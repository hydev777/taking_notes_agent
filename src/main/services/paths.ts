import { app } from 'electron'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

export function getSessionsDir(): string {
  const dir = join(app.getPath('userData'), 'sessions')
  mkdirSync(dir, { recursive: true })
  return dir
}

export function getDbPath(): string {
  return join(app.getPath('userData'), 'app.db')
}
