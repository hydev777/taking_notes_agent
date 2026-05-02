import { readFile } from 'node:fs/promises'
import { parseLlmTemplatePayload, type TemplatePayload } from '../../shared/zodTemplates'
import type { TemplateId } from '../../shared/templateId'

const TRANSCRIBE_URL = 'https://api.openai.com/v1/audio/transcriptions'
const CHAT_URL = 'https://api.openai.com/v1/chat/completions'
const TRANSCRIBE_TIMEOUT_MS = 90_000
const CHAT_TIMEOUT_MS = 45_000
const TRANSCRIBE_MAX_ATTEMPTS = 3

/** Cheap OpenAI transcription model (~50% of whisper-1 per minute). Override via OPENAI_TRANSCRIBE_MODEL (e.g. "whisper-1" to roll back). */
const DEFAULT_TRANSCRIBE_MODEL = 'gpt-4o-mini-transcribe'

/** OpenAI chat model used when DEEPSEEK_API_KEY is unset. Override via OPENAI_CHAT_MODEL / OPENAI_TEMPLATE_PARAGRAPH_MODEL. */
const DEFAULT_OPENAI_CHAT_MODEL = 'gpt-4o-mini'

/** DeepSeek defaults; used when DEEPSEEK_API_KEY is set. */
const DEFAULT_DEEPSEEK_BASE_URL = 'https://api.deepseek.com'
const DEFAULT_DEEPSEEK_CHAT_MODEL = 'deepseek-v4-flash'

/** Caps to prevent runaway completions. */
const JSON_EXTRACTION_MAX_TOKENS = 700
const PARAGRAPH_MAX_TOKENS = 220

/** Tail of the transcript fed to paragraph synthesis. ~1k tokens; structured fields already carry the facts. */
const TRANSCRIPT_TAIL_CHARS = 4_000

type ChatKind = 'json' | 'paragraph'

type ChatProvider = { url: string; apiKey: string; model: string }

function resolveChatProvider(openaiKey: string, kind: ChatKind): ChatProvider {
  const dsKey = process.env.DEEPSEEK_API_KEY?.trim()
  if (dsKey) {
    const base = process.env.DEEPSEEK_BASE_URL?.trim() || DEFAULT_DEEPSEEK_BASE_URL
    const model = process.env.DEEPSEEK_CHAT_MODEL?.trim() || DEFAULT_DEEPSEEK_CHAT_MODEL
    return { url: `${base}/chat/completions`, apiKey: dsKey, model }
  }
  const override =
    kind === 'json'
      ? process.env.OPENAI_CHAT_MODEL?.trim()
      : process.env.OPENAI_TEMPLATE_PARAGRAPH_MODEL?.trim()
  return { url: CHAT_URL, apiKey: openaiKey, model: override || DEFAULT_OPENAI_CHAT_MODEL }
}

const TEMPLATE_PARAGRAPH_SYSTEM = `Write ONE English paragraph for a US law firm case note (DTLA).
Input: labeled template fields + call transcript.
Weave field values into a natural professional summary; use the transcript only to clarify what the fields already say.
Output ONLY plain text (no markdown, lists, or headings). Skip empty fields. Never invent facts.`

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
      body.append('model', process.env.OPENAI_TRANSCRIBE_MODEL?.trim() || DEFAULT_TRANSCRIBE_MODEL)
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
  const provider = resolveChatProvider(params.apiKey, 'json')

  const res = await fetchWithTimeout(
    provider.url,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${provider.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: provider.model,
        temperature: 0.2,
        max_tokens: JSON_EXTRACTION_MAX_TOKENS,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: `Transcript:\n${params.transcript}` }
        ]
      })
    },
    CHAT_TIMEOUT_MS,
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
  const provider = resolveChatProvider(params.apiKey, 'paragraph')

  const res = await fetchWithTimeout(
    provider.url,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${provider.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: provider.model,
        temperature: 0.3,
        max_tokens: PARAGRAPH_MAX_TOKENS,
        messages: [
          { role: 'system', content: TEMPLATE_PARAGRAPH_SYSTEM },
          { role: 'user', content: user }
        ]
      })
    },
    CHAT_TIMEOUT_MS,
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
