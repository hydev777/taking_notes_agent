import nodemailer from 'nodemailer'
import type { TemplatePayload } from '../../shared/zodTemplates'
import { loadRouting, resolveRecipients } from './routing'
import type { TemplateId } from '../../shared/templateId'

export type SmtpEnv = {
  host: string
  port: number
  secure: boolean
  user: string
  pass: string
  from: string
}

export function readSmtpFromEnv(): SmtpEnv | null {
  const host = process.env.SMTP_HOST
  const portRaw = process.env.SMTP_PORT
  const user = process.env.SMTP_USER
  const pass = process.env.SMTP_PASS
  const from = process.env.SMTP_FROM ?? user
  if (!host || !portRaw || !user || !pass || !from) {
    return null
  }
  const port = Number(portRaw)
  const secure = process.env.SMTP_SECURE === 'true' || port === 465
  return { host, port, secure, user, pass, from }
}

function templateToText(payload: TemplatePayload): string {
  const lines: string[] = [`Template: ${payload.templateId}`, '']
  const data = payload.data as Record<string, string>
  for (const [k, v] of Object.entries(data)) {
    lines.push(`${k}: ${v}`)
  }
  return lines.join('\n')
}

export function buildEmailPreview(input: {
  templateId: TemplateId
  payload: TemplatePayload
  sessionId: string
}): { to: string[]; subject: string; textBody: string } {
  const cfg = loadRouting()
  const to = resolveRecipients(input.templateId)
  const subject = `${cfg.subjectPrefix} ${input.templateId} (${input.sessionId.slice(0, 8)})`
  const textBody = templateToText(input.payload)
  return { to, subject, textBody }
}

export async function sendEmail(input: {
  smtp: SmtpEnv
  to: string[]
  subject: string
  textBody: string
}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const transporter = nodemailer.createTransport({
      host: input.smtp.host,
      port: input.smtp.port,
      secure: input.smtp.secure,
      auth: { user: input.smtp.user, pass: input.smtp.pass }
    })
    await transporter.sendMail({
      from: input.smtp.from,
      to: input.to.join(', '),
      subject: input.subject,
      text: input.textBody
    })
    return { ok: true }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, error: msg }
  }
}
