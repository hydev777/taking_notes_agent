import { ipcMain, dialog } from 'electron'
import { writeFile, copyFile, unlink, readFile } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'
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
  insertSession,
  listSessionRows,
  markEmailSent,
  setProfileName,
  updateSessionTemplate,
  type DbSessionRow
} from './services/db'
import { buildEmailPreview, readSmtpFromEnv, sendEmail } from './services/emailService'
import { fieldsByTemplateId } from '../shared/templateFormMeta'
import {
  structureTemplateFromTranscript,
  synthesizeTemplateContextParagraph,
  transcribeAudioFile
} from './services/openai'
import { getSessionsDir } from './services/paths'
import { buildValidationWarnings } from './services/validation'
import { registerDisplayMediaSupport } from './services/displayMedia'

function requireApiKey(): string {
  const key = process.env.OPENAI_API_KEY
  if (!key) {
    throw new Error('Missing OPENAI_API_KEY in environment (.env in project or userData).')
  }
  return key
}

function previewFromTranscript(transcript: string): string {
  const t = transcript.replace(/\s+/g, ' ').trim()
  if (t.length <= 100) {
    return t
  }
  return `${t.slice(0, 97)}…`
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
    case 'detailedNarrative':
      return payload
    default: {
      const _exhaustive: never = payload
      return _exhaustive
    }
  }
}

async function persistProcessedSession(input: {
  sessionId: string
  profileName: string
  audioPath: string
  audioMime: string | null
  transcript: string
  payload: TemplatePayload
}): Promise<void> {
  insertSession({
    id: input.sessionId,
    endedAt: new Date().toISOString(),
    profileName: input.profileName,
    audioPath: input.audioPath,
    audioMime: input.audioMime,
    transcript: input.transcript,
    templateId: input.payload.templateId,
    templateJson: JSON.stringify(input.payload.data)
  })
}

async function runPipelineOnDiskFile(input: {
  sessionId: string
  audioPath: string
  audioMime: string | null
  filenameForApi: string
  mimeForApi: string
  profileName: string
}): Promise<ProcessCallResult> {
  const apiKey = requireApiKey()
  const transcript = await transcribeAudioFile({
    filePath: input.audioPath,
    apiKey,
    filename: input.filenameForApi,
    mimeType: input.mimeForApi
  })
  let payload = await structureTemplateFromTranscript({
    transcript,
    agentName: input.profileName,
    apiKey
  })
  payload = applyAgentToPayload(payload, input.profileName)
  const validationWarnings = buildValidationWarnings({
    transcript,
    templateId: payload.templateId
  })
  await persistProcessedSession({
    sessionId: input.sessionId,
    profileName: input.profileName,
    audioPath: input.audioPath,
    audioMime: input.audioMime,
    transcript,
    payload
  })
  return { transcript, templatePayload: payload, validationWarnings }
}

function rowToListItem(row: DbSessionRow): SessionListItem {
  const templateId = templateIdSchema.parse(row.template_id)
  return {
    id: row.id,
    endedAt: row.ended_at,
    profileName: row.profile_name,
    templateId,
    preview: previewFromTranscript(row.transcript),
    audioPath: row.audio_path
  }
}

function rowToRecord(row: DbSessionRow): SessionRecord {
  const templateId = templateIdSchema.parse(row.template_id)
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
    preview: previewFromTranscript(row.transcript)
  }
}

export function registerIpcHandlers(): void {
  registerDisplayMediaSupport()
  ipcMain.handle('tna:get-profile', async () => getProfileName())
  ipcMain.handle('tna:set-profile', async (_e, name: string) => {
    setProfileName(name)
  })

  ipcMain.handle('tna:list-sessions', async () => {
    return listSessionRows().map(rowToListItem)
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
      const ext = input.mimeType.includes('webm') ? '.webm' : '.bin'
      const audioPath = join(dir, `${input.sessionId}${ext}`)
      await writeFile(audioPath, Buffer.from(input.audio))
      return runPipelineOnDiskFile({
        sessionId: input.sessionId,
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
    const profileName = getProfileName() ?? ''
    return {
      canceled: false as const,
      sessionId,
      sourcePath: res.filePaths[0],
      profileName
    }
  })

  ipcMain.handle(
    'tna:process-imported-file',
    async (_e, input: { sessionId: string; sourcePath: string; profileName: string }) => {
      const dir = getSessionsDir()
      const ext = extname(input.sourcePath) || '.webm'
      const audioPath = join(dir, `${input.sessionId}${ext}`)
      await copyFile(input.sourcePath, audioPath)
      const lower = ext.toLowerCase()
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
      return runPipelineOnDiskFile({
        sessionId: input.sessionId,
        audioPath,
        audioMime: mime,
        filenameForApi: basename(input.sourcePath),
        mimeForApi: mime,
        profileName: input.profileName
      })
    }
  )

  ipcMain.handle('tna:preview-email', async (_e, sessionId: string) => {
    const row = getSessionRow(sessionId)
    if (!row) {
      return { error: 'Session not found' }
    }
    const templateId = templateIdSchema.parse(row.template_id)
    const data: unknown = JSON.parse(row.template_json) as unknown
    const payload = validateTemplateData(templateId, data)
    return buildEmailPreview({ templateId, payload, sessionId })
  })

  ipcMain.handle('tna:get-session-audio-bytes', async (_e, sessionId: string) => {
    const row = getSessionRow(sessionId)
    if (!row) {
      return null
    }
    const buf = await readFile(row.audio_path)
    const mime = row.audio_mime ?? 'audio/webm'
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
    return { mime, data: ab }
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
    const templateId = templateIdSchema.parse(row.template_id)
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
