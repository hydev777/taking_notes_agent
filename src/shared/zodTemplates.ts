import { z } from 'zod'
import { templateIdSchema, type TemplateId } from './templateId'

const str = () =>
  z
    .union([z.string(), z.number(), z.null(), z.undefined()])
    .transform((v) => (v == null ? '' : String(v)))

export const generalNewClientsSchema = z.object({
  name: str(),
  phoneNumber: str(),
  caseType: str(),
  office: z.union([z.string(), z.undefined()]).transform((v) => v ?? 'DTLA'),
  signed: z.union([z.string(), z.undefined()]).transform((v) => v ?? 'Pending'),
  city: str(),
  date: str(),
  email: str(),
  comments: str(),
  howDidYouHearAboutUs: str(),
  scheduleCallBack: str(),
  agent: str()
})

export const lemonLawSchema = z.object({
  name: str(),
  caseType: z.union([z.string(), z.undefined()]).transform((v) => v ?? 'Lemon Law'),
  office: z.union([z.string(), z.undefined()]).transform((v) => v ?? 'DTLA'),
  phoneNumber: str(),
  city: str(),
  date: str(),
  email: str(),
  carYearMakeModel: str(),
  yearOfPurchase: str(),
  whereBoughtLeasedOrPurchased: str(),
  newOrUsed: str(),
  mileageThenOrNow: str(),
  commentsOrIssues: str(),
  repairShopVisitsCount: str(),
  warrantyEnd: str(),
  howDidYouHearAboutUs: str(),
  scheduleCallBack: str(),
  agent: str()
})

export const uberRequestSchema = z.object({
  client: str(),
  phoneNumber: str(),
  time: str(),
  pickUp: str(),
  dropOff: str(),
  comments: str(),
  agent: str()
})

export const detailedNarrativeSchema = z.object({
  who: str(),
  phoneNumber: str(),
  what: str(),
  when: str(),
  where: str(),
  why: str(),
  how: str(),
  consequences: str(),
  nextSteps: str(),
  additionalNotes: str()
})

export const templateDataById = {
  generalNewClients: generalNewClientsSchema,
  lemonLaw: lemonLawSchema,
  uberRequest: uberRequestSchema,
  detailedNarrative: detailedNarrativeSchema
} satisfies Record<TemplateId, z.ZodTypeAny>

export type GeneralNewClients = z.infer<typeof generalNewClientsSchema>
export type LemonLaw = z.infer<typeof lemonLawSchema>
export type UberRequest = z.infer<typeof uberRequestSchema>
export type DetailedNarrative = z.infer<typeof detailedNarrativeSchema>

export type TemplatePayload =
  | { templateId: 'generalNewClients'; data: GeneralNewClients }
  | { templateId: 'lemonLaw'; data: LemonLaw }
  | { templateId: 'uberRequest'; data: UberRequest }
  | { templateId: 'detailedNarrative'; data: DetailedNarrative }

export function validateTemplateData(id: TemplateId, data: unknown): TemplatePayload {
  const schema = templateDataById[id]
  const result = schema.safeParse(data)
  if (!result.success) {
    throw new Error(result.error.message)
  }
  return { templateId: id, data: result.data } as TemplatePayload
}

const llmRootSchema = z.object({
  templateId: templateIdSchema,
  data: z.unknown()
})

export function parseLlmTemplatePayload(raw: unknown): TemplatePayload {
  const parsed = llmRootSchema.safeParse(raw)
  if (!parsed.success) {
    throw new Error(`Invalid LLM template payload: ${parsed.error.message}`)
  }
  return validateTemplateData(parsed.data.templateId, parsed.data.data)
}
