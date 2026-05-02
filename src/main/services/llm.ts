import { readFile } from 'node:fs/promises'
import { parseLlmTemplatePayload, type TemplatePayload } from '../../shared/zodTemplates'
import type { TemplateId } from '../../shared/templateId'

const GROQ_BASE_URL = process.env.GROQ_BASE_URL?.trim() || 'https://api.groq.com/openai/v1'
const TRANSCRIBE_URL = `${GROQ_BASE_URL}/audio/transcriptions`
const CHAT_URL = `${GROQ_BASE_URL}/chat/completions`
const TRANSCRIBE_TIMEOUT_MS = 90_000
const CHAT_TIMEOUT_MS = 45_000
const TRANSCRIBE_MAX_ATTEMPTS = 3
const CHAT_MAX_ATTEMPTS = 3

/** Groq Whisper model. Override via GROQ_TRANSCRIBE_MODEL (e.g. "whisper-large-v3" for slower but slightly more accurate). */
const DEFAULT_TRANSCRIBE_MODEL = 'whisper-large-v3-turbo'

/** Groq chat model. Override via GROQ_CHAT_MODEL (e.g. "llama-3.1-8b-instant" for faster + cheaper quota usage). */
const DEFAULT_CHAT_MODEL = 'llama-3.3-70b-versatile'

/** Caps to prevent runaway completions. */
const JSON_EXTRACTION_MAX_TOKENS = 700
const PARAGRAPH_MAX_TOKENS = 220

/** Tail of the transcript fed to paragraph synthesis. ~1k tokens; structured fields already carry the facts. */
const TRANSCRIPT_TAIL_CHARS = 4_000

function transcribeModel(): string {
  return process.env.GROQ_TRANSCRIBE_MODEL?.trim() || DEFAULT_TRANSCRIBE_MODEL
}

function chatModel(): string {
  return process.env.GROQ_CHAT_MODEL?.trim() || DEFAULT_CHAT_MODEL
}

// Groq JSON-mode quirk: when response_format is { type: 'json_object' }, Groq returns HTTP 400
// unless the prompt contains the literal word "JSON" somewhere. SYSTEM_PROMPT below already
// satisfies this ("Output ONLY valid JSON..."); keep it that way during any future tightening.
const TEMPLATE_PARAGRAPH_SYSTEM = `Write ONE English paragraph for a US law firm case note (DTLA).
Input: labeled template fields + call transcript.
Weave field values into a natural professional summary; use the transcript only to clarify what the fields already say.
Output ONLY plain text (no markdown, lists, or headings). Skip empty fields. Never invent facts.`

const SYSTEM_PROMPT = `Extract intake JSON from a US law firm call transcript (English).
Output ONLY valid JSON: {"templateId":"generalNewClients"|"lemonLaw"|"uberRequest","data":{...}}.
No markdown, no prose. Empty string for unknown fields. Never invent facts.

Pick ONE templateId:
- lemonLaw: defective vehicle / lemon law matter.
- uberRequest: ride/trip pickup-dropoff request.
- generalNewClients: any other intake.

generalNewClients comments rules (based on caseType):
- Wrongful Termination: include company/workplace exact name, reason of termination, salary, time with company.
- Injury/Accident/Assault/Slip-Fall: include when, where, how, police report YES/NO, injury details.
- Workers' Comp Injury: include company/workplace exact name, when, how, injury details.
- Other: brief rich summary (what, how, why, key details).

Field keys (all strings):
generalNewClients: name, phoneNumber, caseType, office (default "DTLA"), signed (default "Pending"), city, date, email, comments, howDidYouHearAboutUs, scheduleCallBack, agent
lemonLaw: name, caseType (default "Lemon Law"), office (default "DTLA"), phoneNumber, city, date, email, carYearMakeModel, yearOfPurchase, whereBoughtLeasedOrPurchased, newOrUsed, mileageThenOrNow, commentsOrIssues, repairShopVisitsCount, warrantyEnd, howDidYouHearAboutUs, scheduleCallBack, agent
uberRequest: client, phoneNumber, time, pickUp, dropOff, comments, agent

Leave "agent" empty; it is filled in post-processing.`

function tailTranscript(transcript: string, maxChars: number): string {
  const t = transcript.trim()
  if (t.length <= maxChars) {
    return t
  }
  return t.slice(-maxChars)
}

async function fetchWithTimeout(
  input: string,
  init: RequestInit,
  timeoutMs: number,
  timeoutLabel: string
): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(input, { ...init, signal: controller.signal })
  } catch (e) {
    const aborted = e instanceof DOMException && e.name === 'AbortError'
    if (aborted) {
      throw new Error(`${timeoutLabel} timed out after ${Math.round(timeoutMs / 1000)}s`)
    }
    throw e
  } finally {
    clearTimeout(timer)
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isRetryableFetchError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false
  }
  const cause = (error as { cause?: unknown }).cause
  const causeCode =
    typeof cause === 'object' && cause != null && 'code' in cause
      ? String((cause as { code?: unknown }).code ?? '')
      : ''
  return (
    causeCode === 'UND_ERR_CONNECT_TIMEOUT' ||
    causeCode === 'UND_ERR_HEADERS_TIMEOUT' ||
    causeCode === 'UND_ERR_SOCKET'
  )
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500
}

/**
 * POSTs to the Groq chat endpoint with the same retry posture as transcription:
 * 3 attempts, exponential backoff, retry on socket errors plus HTTP 429 / 5xx.
 * Free tiers throw transient 429s more often than paid, so this matters.
 */
async function chatWithRetry(
  apiKey: string,
  body: unknown,
  timeoutLabel: string
): Promise<Response> {
  let lastError: unknown = null
  for (let attempt = 1; attempt <= CHAT_MAX_ATTEMPTS; attempt += 1) {
    try {
      const res = await fetchWithTimeout(
        CHAT_URL,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(body)
        },
        CHAT_TIMEOUT_MS,
        timeoutLabel
      )
      if (res.ok || !isRetryableStatus(res.status) || attempt === CHAT_MAX_ATTEMPTS) {
        return res
      }
      // Retryable HTTP error: drain body so the connection is freed, then back off.
      await res.text().catch(() => undefined)
      lastError = new Error(`HTTP ${res.status}`)
    } catch (error) {
      lastError = error
      const retryable = isRetryableFetchError(error)
      if (!retryable || attempt === CHAT_MAX_ATTEMPTS) {
        throw error
      }
    }
    await sleep(attempt * 700)
  }
  throw new Error(
    `${timeoutLabel} failed after ${CHAT_MAX_ATTEMPTS} attempts: ${String(lastError)}`
  )
}

export async function transcribeAudioFile(params: {
  filePath: string
  apiKey: string
  filename: string
  mimeType: string
}): Promise<string> {
  const buffer = await readFile(params.filePath)
  let res: Response | null = null
  let lastError: unknown = null
  for (let attempt = 1; attempt <= TRANSCRIBE_MAX_ATTEMPTS; attempt += 1) {
    try {
      const body = new FormData()
      body.append('file', new Blob([buffer], { type: params.mimeType }), params.filename)
      body.append('model', transcribeModel())
      // Pin English: DTLA calls are English-only. Without this, Whisper auto-detect
      // occasionally mis-tags heavily Spanish-accented English on whisper-large-v3-turbo
      // and starts translating instead of transcribing.
      body.append('language', 'en')
      res = await fetchWithTimeout(
        TRANSCRIBE_URL,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${params.apiKey}`
          },
          body
        },
        TRANSCRIBE_TIMEOUT_MS,
        'Transcription request'
      )
      break
    } catch (error) {
      lastError = error
      const retryable = isRetryableFetchError(error)
      if (!retryable || attempt === TRANSCRIBE_MAX_ATTEMPTS) {
        throw error
      }
      await sleep(attempt * 700)
    }
  }
  if (!res) {
    throw new Error(
      `Transcription failed after ${TRANSCRIBE_MAX_ATTEMPTS} attempts: ${String(lastError)}`
    )
  }

  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`Transcription failed (${res.status}): ${errText}`)
  }

  const json = (await res.json()) as { text?: string }
  if (!json.text) {
    throw new Error('Transcription response missing text')
  }
  return json.text.trim()
}

export async function structureTemplateFromTranscript(params: {
  transcript: string
  agentName: string
  apiKey: string
}): Promise<TemplatePayload> {
  // agentName is intentionally not sent to the LLM: it is filled in post-processing
  // by applyAgentToPayload (src/main/ipc.ts), so the user message stays minimal.
  void params.agentName

  const res = await chatWithRetry(
    params.apiKey,
    {
      model: chatModel(),
      temperature: 0.2,
      max_tokens: JSON_EXTRACTION_MAX_TOKENS,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `Transcript:\n${params.transcript}` }
      ]
    },
    'Template structuring request'
  )

  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`LLM failed (${res.status}): ${errText}`)
  }

  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>
  }
  const content = json.choices?.[0]?.message?.content
  if (!content) {
    throw new Error('LLM response missing content')
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(content) as unknown
  } catch {
    throw new Error('LLM returned non-JSON content')
  }

  return parseLlmTemplatePayload(parsed)
}

export async function synthesizeTemplateContextParagraph(params: {
  templateId: TemplateId
  labeledFields: Array<{ label: string; value: string }>
  transcript: string
  apiKey: string
}): Promise<string> {
  const userPayload = {
    templateId: params.templateId,
    fields: params.labeledFields,
    transcript: tailTranscript(params.transcript, TRANSCRIPT_TAIL_CHARS)
  }
  const user = JSON.stringify(userPayload)

  const res = await chatWithRetry(
    params.apiKey,
    {
      model: chatModel(),
      temperature: 0.3,
      max_tokens: PARAGRAPH_MAX_TOKENS,
      messages: [
        { role: 'system', content: TEMPLATE_PARAGRAPH_SYSTEM },
        { role: 'user', content: user }
      ]
    },
    'Template paragraph request'
  )

  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`LLM paragraph failed (${res.status}): ${errText}`)
  }

  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>
  }
  const content = json.choices?.[0]?.message?.content
  if (!content) {
    throw new Error('LLM paragraph response missing content')
  }
  const oneLine = content.replace(/\s+/g, ' ').trim()
  if (!oneLine) {
    throw new Error('LLM paragraph response empty')
  }
  return oneLine
}

export function coerceTemplateId(id: string): TemplateId | null {
  const allowed: TemplateId[] = ['generalNewClients', 'lemonLaw', 'uberRequest']
  return allowed.includes(id as TemplateId) ? (id as TemplateId) : null
}
