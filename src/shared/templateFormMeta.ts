import type { TemplateId } from './templateId'

export type FieldMeta = { key: string; label: string }

const general: FieldMeta[] = [
  { key: 'name', label: 'Name' },
  { key: 'caseType', label: 'Case Type' },
  { key: 'office', label: 'Office' },
  { key: 'signed', label: 'Signed' },
  { key: 'city', label: 'City' },
  { key: 'date', label: 'Date' },
  { key: 'email', label: 'Email' },
  { key: 'comments', label: 'Comments' },
  { key: 'howDidYouHearAboutUs', label: 'How did you hear about us?' },
  { key: 'scheduleCallBack', label: 'Schedule Call Back' },
  { key: 'agent', label: 'Agent' }
]

const lemon: FieldMeta[] = [
  { key: 'name', label: 'Name' },
  { key: 'caseType', label: 'Case Type' },
  { key: 'office', label: 'Office' },
  { key: 'phoneNumber', label: 'Phone Number' },
  { key: 'city', label: 'City' },
  { key: 'date', label: 'Date' },
  { key: 'email', label: 'Email' },
  { key: 'carYearMakeModel', label: 'Car Year Make Model' },
  { key: 'yearOfPurchase', label: 'Year of purchase' },
  { key: 'whereBoughtLeasedOrPurchased', label: 'Where bought / leased or purchased?' },
  { key: 'newOrUsed', label: 'New or Used' },
  { key: 'mileageThenOrNow', label: 'Mileage (then/now)' },
  { key: 'commentsOrIssues', label: 'Comments/Issues' },
  { key: 'repairShopVisitsCount', label: 'Times taken to repair shop' },
  { key: 'warrantyEnd', label: 'When does the warranty end' },
  { key: 'howDidYouHearAboutUs', label: 'How did you hear about us?' },
  { key: 'scheduleCallBack', label: 'Schedule Call Back' },
  { key: 'agent', label: 'Agent' }
]

const uber: FieldMeta[] = [
  { key: 'client', label: 'Client' },
  { key: 'phoneNumber', label: 'Phone Number' },
  { key: 'time', label: 'Time' },
  { key: 'pickUp', label: 'Pick up' },
  { key: 'dropOff', label: 'Drop off' },
  { key: 'comments', label: 'Comments' },
  { key: 'agent', label: 'Agent' }
]

const detailed: FieldMeta[] = [
  { key: 'who', label: 'Who' },
  { key: 'what', label: 'What' },
  { key: 'when', label: 'When' },
  { key: 'where', label: 'Where' },
  { key: 'why', label: 'Why' },
  { key: 'how', label: 'How' },
  { key: 'consequences', label: 'Consequences' },
  { key: 'nextSteps', label: 'Next steps' },
  { key: 'additionalNotes', label: 'Additional notes' }
]

export const fieldsByTemplateId: Record<TemplateId, FieldMeta[]> = {
  generalNewClients: general,
  lemonLaw: lemon,
  uberRequest: uber,
  detailedNarrative: detailed
}

/** One readable paragraph: non-empty fields in order as `Label: value.` segments joined by spaces. */
export function formatTemplateAsParagraph(templateId: TemplateId, data: Record<string, string>): string {
  const fields = fieldsByTemplateId[templateId]
  const parts: string[] = []
  for (const f of fields) {
    const v = (data[f.key] ?? '').replace(/\s+/g, ' ').trim()
    if (!v) {
      continue
    }
    const endsSentence = /[.!?…]$/.test(v)
    parts.push(endsSentence ? `${f.label}: ${v}` : `${f.label}: ${v}.`)
  }
  if (parts.length === 0) {
    return '(No filled fields yet.)'
  }
  return parts.join(' ')
}
