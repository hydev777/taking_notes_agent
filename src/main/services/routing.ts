import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import { z } from 'zod'
import type { TemplateId } from '../../shared/templateId'

const routingSchema = z.object({
  byTemplateId: z.record(z.string(), z.array(z.string().email())),
  defaultTo: z.array(z.string().email()),
  subjectPrefix: z.string()
})

export type RoutingConfig = z.infer<typeof routingSchema>

let cached: RoutingConfig | null = null

function routingPath(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, 'resources', 'routing.json')
  }
  return join(process.cwd(), 'resources', 'routing.json')
}


export function loadRouting(): RoutingConfig {
  if (cached) {
    return cached
  }
  const raw = JSON.parse(readFileSync(routingPath(), 'utf-8')) as unknown
  cached = routingSchema.parse(raw)
  return cached
}

export function resolveRecipients(templateId: TemplateId): string[] {
  const cfg = loadRouting()
  const list = cfg.byTemplateId[templateId]
  if (list && list.length > 0) {
    return list
  }
  return cfg.defaultTo
}
