import { z } from 'zod'

export const templateIdSchema = z.enum([
  'generalNewClients',
  'lemonLaw',
  'uberRequest'
])

export type TemplateId = z.infer<typeof templateIdSchema>

export const TEMPLATE_LABELS: Record<TemplateId, string> = {
  generalNewClients: 'General template for new clients',
  lemonLaw: 'Lemon Law Email Template',
  uberRequest: 'Uber Request Template'
}
