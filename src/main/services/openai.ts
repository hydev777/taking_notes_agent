import { readFile } from 'node:fs/promises'
import { parseLlmTemplatePayload, type TemplatePayload } from '../../shared/zodTemplates'
import type { TemplateId } from '../../shared/templateId'

const TRANSCRIBE_URL = 'https://api.openai.com/v1/audio/transcriptions'
const CHAT_URL = 'https://api.openai.com/v1/chat/completions'
const TRANSCRIBE_TIMEOUT_MS = 90_000
const CHAT_TIMEOUT_MS = 45_000

/** Budget chat model for plain-text template paragraph only (not JSON extraction). Override via OPENAI_TEMPLATE_PARAGRAPH_MODEL. */
const DEFAULT_TEMPLATE_PARAGRAPH_MODEL = 'gpt-3.5-turbo'

const TRANSCRIPT_TAIL_CHARS = 12_000

const TEMPLATE_PARAGRAPH_SYSTEM = `You are an intake note assistant for a US law firm answering service (DTLA-style).
You receive structured template fields (labels + values) and the call transcript in English.
Write ONE fluent paragraph in English that summarizes the situation for a colleague: weave the field values together with natural context, using the transcript only to clarify or support what is already in the fields.
Rules:
- Output ONLY plain text: a single paragraph. No markdown, no bullet lists, no headings.
- Do not invent facts that are not supported by the fields or the transcript.
- If a field is empty, skip it or mention generically only if needed for flow; do not fabricate details.
- Keep professional tone suitable for case notes.`

function templateParagraphModel(): string {
  const m = process.env.OPENAI_TEMPLATE_PARAGRAPH_MODEL?.trim()
  return m && m.length > 0 ? m : DEFAULT_TEMPLATE_PARAGRAPH_MODEL
}

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

const SYSTEM_PROMPT = `You are an intake note assistant for a US law firm answering service (DTLA-style).
You receive an English call transcript. Output ONLY valid JSON (no markdown) matching this shape:
{
  "templateId": one of "generalNewClients" | "lemonLaw" | "uberRequest" | "detailedNarrative",
  "data": { ... }
}

Rules:
- Pick exactly ONE templateId based on the call.
- Use "lemonLaw" when the matter is clearly a defective vehicle / lemon law.
- Use "uberRequest" when the caller is requesting or describing an Uber/trip/ride pickup-dropoff style request.
- Use "generalNewClients" for typical new client intake that matches general fields.
- Use "detailedNarrative" when the situation is complex and does not fit the other three; fill who/what/when/where/why/how/consequences/nextSteps/additionalNotes from the transcript only.

Field keys for generalNewClients (all strings, empty if unknown):
name, caseType, office (default "DTLA"), signed (default "Pending"), city, date, email, comments, howDidYouHearAboutUs, scheduleCallBack, agent

lemonLaw:
name, caseType (default "Lemon Law"), office ("DTLA"), phoneNumber, city, date, email, carYearMakeModel, yearOfPurchase, whereBoughtLeasedOrPurchased, newOrUsed, mileageThenOrNow, commentsOrIssues, repairShopVisitsCount, warrantyEnd, howDidYouHearAboutUs, scheduleCallBack, agent

uberRequest:
client, phoneNumber, time, pickUp, dropOff, comments, agent

detailedNarrative:
who, what, when, where, why, how, consequences, nextSteps, additionalNotes

Never invent facts not supported by the transcript. Use empty string when unknown.
The profile agent name will be provided separately; put it in the "agent" field when applicable.`

export async function transcribeAudioFile(params: {
  filePath: string
  apiKey: string
  filename: string
  mimeType: string
}): Promise<string> {
  const buffer = await readFile(params.filePath)
  const body = new FormData()
  body.append('file', new Blob([buffer], { type: params.mimeType }), params.filename)
  body.append('model', 'whisper-1')

  const res = await fetchWithTimeout(
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
  const user = `Agent name for templates (use in "agent" where applicable): ${params.agentName}\n\nTranscript:\n${params.transcript}`

  const res = await fetchWithTimeout(
    CHAT_URL,
    {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${params.apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: user }
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

  const res = await fetchWithTimeout(
    CHAT_URL,
    {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${params.apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: templateParagraphModel(),
      temperature: 0.3,
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
  const allowed: TemplateId[] = ['generalNewClients', 'lemonLaw', 'uberRequest', 'detailedNarrative']
  return allowed.includes(id as TemplateId) ? (id as TemplateId) : null
}
