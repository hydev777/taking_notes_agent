import type { TemplateId } from './templateId'
import type { TemplatePayload } from './zodTemplates'

export type SessionListItem = {
  id: string
  endedAt: string
  profileName: string
  templateId: TemplateId
  preview: string
  audioPath: string
}

export type SessionRecord = {
  id: string
  endedAt: string
  profileName: string
  audioPath: string
  audioMime: string | null
  transcript: string
  templateId: TemplateId
  templateJson: string
  emailSentAt: string | null
  preview: string
}

export type ProcessCallResult = {
  transcript: string
  templatePayload: TemplatePayload
  validationWarnings: string[]
}

export type SendEmailResult = { ok: true } | { ok: false; error: string }

export type EmailPreview = {
  to: string[]
  subject: string
  textBody: string
}

/** Serializable row for the display-capture picker (main → renderer). */
export type DisplayMediaSourceOption = {
  id: string
  name: string
  thumbnailDataUrl: string
}

export type SynthesizeTemplateParagraphResult =
  | { ok: true; paragraph: string }
  | { ok: false; error: string }

export type GetChangelogResult =
  | { ok: true; markdown: string }
  | { ok: false; error: string }

export type IpcApi = {
  getProfileName: () => Promise<string | null>
  setProfileName: (name: string) => Promise<void>
  listSessions: () => Promise<SessionListItem[]>
  getSession: (id: string) => Promise<SessionRecord | null>
  deleteSession: (id: string) => Promise<{ ok: boolean; error?: string }>
  updateSessionTemplate: (input: {
    id: string
    templateId: TemplateId
    templateJson: string
  }) => Promise<{ ok: boolean; error?: string }>
  processCallAudio: (input: {
    sessionId: string
    audio: ArrayBuffer
    mimeType: string
    profileName: string
  }) => Promise<ProcessCallResult>
  importAudioFile: () => Promise<
    | { canceled: true }
    | { canceled: false; sessionId: string; sourcePath: string; profileName: string }
  >
  processImportedFile: (input: {
    sessionId: string
    sourcePath: string
    profileName: string
  }) => Promise<ProcessCallResult>
  previewEmail: (sessionId: string) => Promise<EmailPreview | { error: string }>
  sendEmail: (sessionId: string) => Promise<SendEmailResult>
  getSessionAudioBytes: (sessionId: string) => Promise<{ mime: string; data: ArrayBuffer } | null>
  /** When getDisplayMedia runs, main sends sources here; return value disposes the listener. */
  onDisplayMediaPickRequest: (handler: (sources: DisplayMediaSourceOption[]) => void) => () => void
  /** Resolve the in-flight display-media request (after user picks or cancels). */
  submitDisplayMediaPick: (sourceId: string | null) => void
  /** Cheap chat model: one contextual paragraph from template fields + transcript. */
  synthesizeTemplateParagraph: (input: {
    templateId: TemplateId
    templateJson: string
    transcript: string
  }) => Promise<SynthesizeTemplateParagraphResult>
  getChangelog: () => Promise<GetChangelogResult>
}

declare global {
  interface Window {
    api: IpcApi
  }
}
