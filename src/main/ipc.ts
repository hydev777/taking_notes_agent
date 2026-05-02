import { app, ipcMain, dialog } from 'electron'
import { writeFile, copyFile, unlink, readFile } from 'node:fs/promises'
import { basename, extname, isAbsolute, join, resolve, sep } from 'node:path'
import { v4 as uuidv4 } from 'uuid'
import type { ProcessCallResult, SessionListItem, SessionRecord } from '../shared/ipc'
import type { TemplateId } from '../shared/templateId'
import { templateIdSchema } from '../shared/templateId'
import {
  validateTemplateData,
  type TemplatePayload
} from '../shared/zodTemplates'
import {
  deleteSession,
  getProfileName,
  getSessionRow,
  listSessionRowsLight,
  markEmailSent,
  setProfileName,
  updateSessionProcessedData,
  updateSessionProcessingState,
  updateSessionTemplate,
  upsertSessionBase,
  type DbSessionListRowLight,
  type DbSessionRow
} from './services/db'
import { buildEmailPreview, readSmtpFromEnv, sendEmail } from './services/emailService'
import { fieldsByTemplateId } from '../shared/templateFormMeta'
import {
  EmptyAudioError,
  RateLimitError,
  structureTemplateFromTranscript,
  synthesizeTemplateContextParagraph,
  transcribeAudioFile
} from './services/llm'
import { getSessionsDir } from './services/paths'
import { buildValidationWarnings, detectCaseCategory } from './services/validation'
import { registerDisplayMediaSupport } from './services/displayMedia'

const SAFE_SESSION_ID_RE = /^[A-Za-z0-9_-]{1,80}$/
const ALLOWED_IMPORT_EXTS = new Set(['.webm', '.wav', '.mp3', '.mpeg', '.m4a', '.ogg'])
const pendingImportBySession = new Map<string, string>()
const AUTO_PROCESS_MAX_ATTEMPTS = 3

function requireApiKey(): string {
  const key = process.env.GROQ_API_KEY
  if (!key) {
    throw new Error(
      'Missing GROQ_API_KEY in environment (.env in project or userData). Free key at https://console.groq.com.'
    )
  }
  return key
}

function applyAgentToPayload(payload: TemplatePayload, agentName: string): TemplatePayload {
  if (!agentName.trim()) {
    return payload
  }
  switch (payload.templateId) {
    case 'generalNewClients':
      return { templateId: payload.templateId, data: { ...payload.data, agent: agentName } }
    case 'lemonLaw':
      return { templateId: payload.templateId, data: { ...payload.data, agent: agentName } }
    case 'uberRequest':
      return { templateId: payload.templateId, data: { ...payload.data, agent: agentName } }
    default: {
      const _exhaustive: never = payload
      return _exhaustive
    }
  }
}

function assertSafeSessionId(sessionId: string): string {
  const normalized = sessionId.trim()
  if (!SAFE_SESSION_ID_RE.test(normalized)) {
    throw new Error('Invalid session id')
  }
  return normalized
}

function assertSafeImportSourcePath(sourcePath: string): { sourcePath: string; extension: string } {
  const normalized = sourcePath.trim()
  if (!isAbsolute(normalized)) {
    throw new Error('Invalid source path')
  }
  const extension = extname(normalized).toLowerCase()
  if (!ALLOWED_IMPORT_EXTS.has(extension)) {
    throw new Error('Unsupported audio file extension')
  }
  return { sourcePath: normalized, extension }
}

function resolveAudioPathInSessionsDir(dir: string, sessionId: string, extension: string): string {
  const candidate = resolve(dir, `${sessionId}${extension}`)
  const root = resolve(dir) + sep
  if (!candidate.startsWith(root)) {
    throw new Error('Invalid audio destination path')
  }
  return candidate
}

function normalizeTemplateId(raw: string): TemplateId {
  if (raw === 'detailedNarrative') {
    // Backward compatibility for historical rows persisted before template removal.
    return 'generalNewClients'
  }
  const parsed = templateIdSchema.safeParse(raw)
  if (parsed.success) {
    return parsed.data
  }
  return 'generalNewClients'
}

function appendGeneratedComments(existing: string, generated: string, categoryLabel: string | null): string {
  const base = existing.trim()
  const next = generated.trim()
  if (!next) {
    return base
  }
  if (!base) {
    return next
  }
  if (base === next || base.includes(next)) {
    return base
  }
  const title = categoryLabel ? `AI category notes (${categoryLabel})` : 'AI category notes'
  return `${base}\n\n---\n${title}\n${next}`
}

function tokenizeForSimilarity(input: string): string[] {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 0)
}

function diceSimilarity(a: string, b: string): number {
  const aTokens = tokenizeForSimilarity(a)
  const bTokens = tokenizeForSimilarity(b)
  if (aTokens.length === 0 || bTokens.length === 0) {
    return 0
  }
  const bBag = new Map<string, number>()
  for (const token of bTokens) {
    bBag.set(token, (bBag.get(token) ?? 0) + 1)
  }
  let overlap = 0
  for (const token of aTokens) {
    const count = bBag.get(token) ?? 0
    if (count > 0) {
      overlap += 1
      bBag.set(token, count - 1)
    }
  }
  return (2 * overlap) / (aTokens.length + bTokens.length)
}

function dedupeTranscriptRepeats(transcript: string): string {
  const compact = transcript.replace(/\s+/g, ' ').trim()
  if (!compact) {
    return compact
  }
  const parts = compact
    .split(/(?<=[.!?])\s+|\n+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
  if (parts.length < 2) {
    return compact
  }
  const deduped: string[] = []
  for (const current of parts) {
    const previous = deduped[deduped.length - 1]
    if (!previous) {
      deduped.push(current)
      continue
    }
    const minLength = Math.min(previous.length, current.length)
    const similar = diceSimilarity(previous, current) >= 0.92
    const longEnough = minLength >= 35
    if (similar && longEnough) {
      continue
    }
    deduped.push(current)
  }
  return deduped.join(' ').trim()
}

function parseWarningsJson(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? parsed.map((item) => String(item)) : []
  } catch {
    return []
  }
}

function normalizeProcessingError(error: unknown): string {
  if (error instanceof RateLimitError) {
    return error.message
  }
  if (error instanceof EmptyAudioError) {
    return error.message
  }
  const raw = error instanceof Error ? error.message : String(error)
  const lower = raw.toLowerCase()
  const category =
    lower.includes('timeout') || lower.includes('connect') || lower.includes('socket')
      ? 'network'
      : lower.includes('groq') || lower.includes('transcription failed') || lower.includes('llm')
        ? 'api'
        : lower.includes('validation') || lower.includes('json')
          ? 'validation'
          : 'unknown'
  return `${category}: ${raw}`
}

async function runPipelineOnDiskFile(input: {
  sessionId: string
  audioPath: string
  audioMime: string | null
  filenameForApi: string
  mimeForApi: string
  profileName: string
}): Promise<{ transcript: string; payload: TemplatePayload; validationWarnings: string[] }> {
  const apiKey = requireApiKey()
  const rawTranscript = await transcribeAudioFile({
    filePath: input.audioPath,
    apiKey,
    filename: input.filenameForApi,
    mimeType: input.mimeForApi
  })
  const transcript = dedupeTranscriptRepeats(rawTranscript)
  let payload = await structureTemplateFromTranscript({
    transcript,
    agentName: input.profileName,
    apiKey
  })
  payload = applyAgentToPayload(payload, input.profileName)
  if (payload.templateId === 'generalNewClients') {
    const category = detectCaseCategory(payload.data.caseType ?? '')
    const categoryLabel =
      category === 'wrongfulTermination'
        ? 'Wrongful Termination'
        : category === 'injuryAccidentAssaultSlipFall'
          ? 'Injury/Accidents/Assault/Slip and fall'
          : category === 'workersCompInjury'
            ? "Workers' Comp Injury"
            : null
    payload = {
      templateId: payload.templateId,
      data: {
        ...payload.data,
        comments: appendGeneratedComments('', payload.data.comments ?? '', categoryLabel)
      }
    }
  }
  const validationWarnings = buildValidationWarnings({
    transcript,
    templateId: payload.templateId,
    caseType: payload.templateId === 'generalNewClients' ? payload.data.caseType : '',
    comments: payload.templateId === 'generalNewClients' ? payload.data.comments : ''
  })
  return { transcript, payload, validationWarnings }
}

async function processSessionOnDiskFile(input: {
  sessionId: string
  audioPath: string
  audioMime: string | null
  filenameForApi: string
  mimeForApi: string
  profileName: string
  attempts?: number
}): Promise<ProcessCallResult> {
  const attempts = Math.max(1, input.attempts ?? AUTO_PROCESS_MAX_ATTEMPTS)
  let lastError: unknown = null
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const result = await runPipelineOnDiskFile({
        sessionId: input.sessionId,
        audioPath: input.audioPath,
        audioMime: input.audioMime,
        filenameForApi: input.filenameForApi,
        mimeForApi: input.mimeForApi,
        profileName: input.profileName
      })
      const finishedAt = new Date().toISOString()
      updateSessionProcessedData({
        id: input.sessionId,
        transcript: result.transcript,
        templateId: result.payload.templateId,
        templateJson: JSON.stringify(result.payload.data),
        validationWarningsJson: JSON.stringify(result.validationWarnings),
        processingStatus: 'completed',
        processingError: null,
        lastProcessedAt: finishedAt
      })
      return {
        transcript: result.transcript,
        templatePayload: result.payload,
        validationWarnings: result.validationWarnings
      }
    } catch (error) {
      lastError = error
      if (error instanceof RateLimitError) {
        // Same daily quota wall would hit on attempts 2 and 3; don't waste audio
        // uploads or chat-request quota. The friendly message is still written below.
        break
      }
      if (error instanceof EmptyAudioError) {
        // Same audio file → same silence → same hallucination on retry. Re-uploading
        // the file 3x just burns transcription quota for no benefit.
        break
      }
    }
  }
  const normalized = normalizeProcessingError(lastError)
  updateSessionProcessingState({
    id: input.sessionId,
    processingStatus: 'failed',
    processingError: normalized,
    lastProcessedAt: new Date().toISOString()
  })
  throw new Error(normalized)
}

function rowToListItem(row: DbSessionListRowLight): SessionListItem {
  const candidateFromTemplate = (() => {
    try {
      const parsed = JSON.parse(row.template_json) as Record<string, unknown>
      const direct = [parsed.name, parsed.client, parsed.who]
      for (const value of direct) {
        const text = value == null ? '' : String(value).trim()
        if (text.length > 0) {
          return text
        }
      }
      return ''
    } catch {
      return ''
    }
  })()
  const clientName = candidateFromTemplate || 'Unknown client'
  const templateId = normalizeTemplateId(row.template_id)
  return {
    id: row.id,
    endedAt: row.ended_at,
    profileName: row.profile_name,
    clientName,
    templateId,
    preview: row.preview,
    audioPath: row.audio_path,
    processingStatus: row.processing_status,
    processingError: row.processing_error,
    lastProcessedAt: row.last_processed_at
  }
}

function rowToRecord(row: DbSessionRow): SessionRecord {
  const templateId = normalizeTemplateId(row.template_id)
  return {
    id: row.id,
    endedAt: row.ended_at,
    profileName: row.profile_name,
    audioPath: row.audio_path,
    audioMime: row.audio_mime,
    transcript: row.transcript,
    templateId,
    templateJson: row.template_json,
    emailSentAt: row.email_sent_at,
    processingStatus: row.processing_status,
    processingError: row.processing_error,
    lastProcessedAt: row.last_processed_at,
    validationWarnings: parseWarningsJson(row.validation_warnings_json),
    preview:
      row.transcript.replace(/\s+/g, ' ').trim().length <= 100
        ? row.transcript.replace(/\s+/g, ' ').trim()
        : `${row.transcript.replace(/\s+/g, ' ').trim().slice(0, 97)}…`
  }
}

export function registerIpcHandlers(): void {
  registerDisplayMediaSupport()
  ipcMain.handle('tna:get-profile', async () => getProfileName())
  ipcMain.handle('tna:set-profile', async (_e, name: string) => {
    setProfileName(name)
  })

  ipcMain.handle('tna:list-sessions', async () => {
    return listSessionRowsLight().map(rowToListItem)
  })

  ipcMain.handle('tna:get-changelog', async () => {
    try {
      const appPath = app.getAppPath()
      const changelogPath = join(appPath, 'CHANGELOG.md')
      const markdown = await readFile(changelogPath, 'utf8')
      return { ok: true as const, markdown }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      return { ok: false as const, error: `Could not read CHANGELOG.md: ${msg}` }
    }
  })

  ipcMain.handle('tna:get-session', async (_e, id: string) => {
    const row = getSessionRow(id)
    if (!row) {
      return null
    }
    return rowToRecord(row)
  })

  ipcMain.handle('tna:delete-session', async (_e, id: string) => {
    try {
      const row = getSessionRow(id)
      if (!row) {
        return { ok: false as const, error: 'Session not found' }
      }
      await unlink(row.audio_path).catch(() => undefined)
      deleteSession(id)
      return { ok: true as const }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      return { ok: false as const, error: msg }
    }
  })

  ipcMain.handle(
    'tna:update-session-template',
    async (_e, input: { id: string; templateId: TemplateId; templateJson: string }) => {
      try {
        const data: unknown = JSON.parse(input.templateJson) as unknown
        validateTemplateData(input.templateId, data)
        updateSessionTemplate({
          id: input.id,
          templateId: input.templateId,
          templateJson: input.templateJson
        })
        return { ok: true as const }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        return { ok: false as const, error: msg }
      }
    }
  )

  ipcMain.handle(
    'tna:synthesize-template-paragraph',
    async (
      _e,
      input: { templateId: TemplateId; templateJson: string; transcript: string }
    ): Promise<{ ok: true; paragraph: string } | { ok: false; error: string }> => {
      try {
        const apiKey = requireApiKey()
        const tid = templateIdSchema.parse(input.templateId)
        let data: Record<string, unknown>
        try {
          data = JSON.parse(input.templateJson) as Record<string, unknown>
        } catch {
          return { ok: false as const, error: 'Invalid template JSON' }
        }
        validateTemplateData(tid, data)
        const labeled = fieldsByTemplateId[tid].map((f) => ({
          label: f.label,
          value: data[f.key] == null ? '' : String(data[f.key])
        }))
        const paragraph = await synthesizeTemplateContextParagraph({
          templateId: tid,
          labeledFields: labeled,
          transcript: typeof input.transcript === 'string' ? input.transcript : '',
          apiKey
        })
        return { ok: true as const, paragraph }
      } catch (e) {
        // RateLimitError.message is already user-facing; do not wrap or prefix here.
        const msg = e instanceof Error ? e.message : String(e)
        return { ok: false as const, error: msg }
      }
    }
  )

  ipcMain.handle(
    'tna:process-call-audio',
    async (
      _e,
      input: { sessionId: string; audio: ArrayBuffer; mimeType: string; profileName: string }
    ) => {
      const dir = getSessionsDir()
      const sessionId = assertSafeSessionId(input.sessionId)
      const ext = input.mimeType.includes('webm') ? '.webm' : '.bin'
      const audioPath = resolveAudioPathInSessionsDir(dir, sessionId, ext)
      await writeFile(audioPath, Buffer.from(input.audio))
      upsertSessionBase({
        id: sessionId,
        endedAt: new Date().toISOString(),
        profileName: input.profileName,
        audioPath,
        audioMime: input.mimeType,
        transcript: '',
        processingStatus: 'processing',
        processingError: null,
        validationWarningsJson: '[]'
      })
      return processSessionOnDiskFile({
        sessionId,
        audioPath,
        audioMime: input.mimeType,
        filenameForApi: `call${ext}`,
        mimeForApi: input.mimeType || 'audio/webm',
        profileName: input.profileName
      })
    }
  )

  ipcMain.handle('tna:import-audio-file', async () => {
    const res = await dialog.showOpenDialog({
      title: 'Import audio',
      properties: ['openFile'],
      filters: [{ name: 'Audio', extensions: ['webm', 'wav', 'mp3', 'mpeg', 'm4a', 'ogg'] }]
    })
    if (res.canceled || !res.filePaths[0]) {
      return { canceled: true as const }
    }
    const sessionId = uuidv4()
    const sourcePath = res.filePaths[0]
    pendingImportBySession.set(sessionId, sourcePath)
    const profileName = getProfileName() ?? ''
    return {
      canceled: false as const,
      sessionId,
      sourcePath,
      profileName
    }
  })

  ipcMain.handle(
    'tna:process-imported-file',
    async (_e, input: { sessionId: string; sourcePath: string; profileName: string }) => {
      const dir = getSessionsDir()
      const sessionId = assertSafeSessionId(input.sessionId)
      const pendingSourcePath = pendingImportBySession.get(sessionId)
      const safeImport = assertSafeImportSourcePath(input.sourcePath)
      if (!pendingSourcePath || pendingSourcePath !== safeImport.sourcePath) {
        throw new Error('Import source path not authorized for this session')
      }
      pendingImportBySession.delete(sessionId)
      const audioPath = resolveAudioPathInSessionsDir(dir, sessionId, safeImport.extension)
      await copyFile(safeImport.sourcePath, audioPath)
      const lower = safeImport.extension
      const mime =
        lower === '.mp3' || lower === '.mpeg'
          ? 'audio/mpeg'
          : lower === '.wav'
            ? 'audio/wav'
            : lower === '.m4a'
              ? 'audio/mp4'
              : lower === '.ogg'
                ? 'audio/ogg'
                : 'audio/webm'
      upsertSessionBase({
        id: sessionId,
        endedAt: new Date().toISOString(),
        profileName: input.profileName,
        audioPath,
        audioMime: mime,
        transcript: '',
        processingStatus: 'processing',
        processingError: null,
        validationWarningsJson: '[]'
      })
      return processSessionOnDiskFile({
        sessionId,
        audioPath,
        audioMime: mime,
        filenameForApi: basename(safeImport.sourcePath),
        mimeForApi: mime,
        profileName: input.profileName
      })
    }
  )

  ipcMain.handle('tna:retry-session-processing', async (_e, sessionIdRaw: string) => {
    const sessionId = assertSafeSessionId(sessionIdRaw)
    const row = getSessionRow(sessionId)
    if (!row) {
      throw new Error('Session not found')
    }
    if (row.processing_status === 'processing') {
      throw new Error('This session is already processing')
    }
    updateSessionProcessingState({
      id: sessionId,
      processingStatus: 'processing',
      processingError: null
    })
    const extension = extname(row.audio_path).toLowerCase() || '.webm'
    const mimeForApi = row.audio_mime ?? 'audio/webm'
    return processSessionOnDiskFile({
      sessionId,
      audioPath: row.audio_path,
      audioMime: row.audio_mime,
      filenameForApi: `retry${extension}`,
      mimeForApi,
      profileName: row.profile_name
    })
  })

  ipcMain.handle('tna:preview-email', async (_e, sessionId: string) => {
    const row = getSessionRow(sessionId)
    if (!row) {
      return { error: 'Session not found' }
    }
    const templateId = normalizeTemplateId(row.template_id)
    const data: unknown = JSON.parse(row.template_json) as unknown
    const payload = validateTemplateData(templateId, data)
    return buildEmailPreview({ templateId, payload, sessionId })
  })

  ipcMain.handle('tna:get-session-audio-bytes', async (_e, sessionId: string) => {
    try {
      const row = getSessionRow(sessionId)
      if (!row) {
        return null
      }
      const buf = await readFile(row.audio_path)
      const mime = row.audio_mime ?? 'audio/webm'
      const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
      return { mime, data: ab }
    } catch {
      return null
    }
  })

  ipcMain.handle('tna:send-email', async (_e, sessionId: string) => {
    const smtp = readSmtpFromEnv()
    if (!smtp) {
      return { ok: false as const, error: 'SMTP not configured (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM).' }
    }
    const row = getSessionRow(sessionId)
    if (!row) {
      return { ok: false as const, error: 'Session not found' }
    }
    const templateId = normalizeTemplateId(row.template_id)
    const data: unknown = JSON.parse(row.template_json) as unknown
    const payload = validateTemplateData(templateId, data)
    const preview = buildEmailPreview({ templateId, payload, sessionId })
    const sent = await sendEmail({
      smtp,
      to: preview.to,
      subject: preview.subject,
      textBody: preview.textBody
    })
    if (!sent.ok) {
      return sent
    }
    markEmailSent(sessionId, new Date().toISOString())
    return { ok: true as const }
  })
}
