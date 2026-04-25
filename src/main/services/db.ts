import Database from 'better-sqlite3'
import { app } from 'electron'
import { getDbPath } from './paths'
import type { TemplateId } from '../../shared/templateId'

let db: Database.Database | null = null

export function getDb(): Database.Database {
  if (db) {
    return db
  }
  const path = getDbPath()
  db = new Database(path)
  db.pragma('journal_mode = WAL')
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      ended_at TEXT NOT NULL,
      profile_name TEXT NOT NULL,
      audio_path TEXT NOT NULL,
      audio_mime TEXT,
      transcript TEXT NOT NULL,
      template_id TEXT NOT NULL,
      template_json TEXT NOT NULL,
      email_sent_at TEXT
    );
  `)
  return db
}

export function closeDb(): void {
  if (db) {
    db.close()
    db = null
  }
}

export function getProfileName(): string | null {
  const row = getDb()
    .prepare('SELECT value FROM settings WHERE key = ?')
    .get('profileName') as { value: string } | undefined
  return row?.value ?? null
}

export function setProfileName(name: string): void {
  getDb()
    .prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run('profileName', name.trim())
}

export type DbSessionRow = {
  id: string
  ended_at: string
  profile_name: string
  audio_path: string
  audio_mime: string | null
  transcript: string
  template_id: string
  template_json: string
  email_sent_at: string | null
}

export function insertSession(row: {
  id: string
  endedAt: string
  profileName: string
  audioPath: string
  audioMime: string | null
  transcript: string
  templateId: TemplateId
  templateJson: string
}): void {
  getDb()
    .prepare(
      `INSERT INTO sessions (id, ended_at, profile_name, audio_path, audio_mime, transcript, template_id, template_json, email_sent_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)`
    )
    .run(
      row.id,
      row.endedAt,
      row.profileName,
      row.audioPath,
      row.audioMime,
      row.transcript,
      row.templateId,
      row.templateJson
    )
}

export function updateSessionTemplate(input: {
  id: string
  templateId: TemplateId
  templateJson: string
}): void {
  getDb()
    .prepare('UPDATE sessions SET template_id = ?, template_json = ? WHERE id = ?')
    .run(input.templateId, input.templateJson, input.id)
}

export function deleteSession(id: string): void {
  getDb().prepare('DELETE FROM sessions WHERE id = ?').run(id)
}

export function listSessionRows(): DbSessionRow[] {
  return getDb()
    .prepare(
      'SELECT id, ended_at, profile_name, audio_path, audio_mime, transcript, template_id, template_json, email_sent_at FROM sessions ORDER BY ended_at DESC'
    )
    .all() as DbSessionRow[]
}

export function getSessionRow(id: string): DbSessionRow | undefined {
  return getDb()
    .prepare(
      'SELECT id, ended_at, profile_name, audio_path, audio_mime, transcript, template_id, template_json, email_sent_at FROM sessions WHERE id = ?'
    )
    .get(id) as DbSessionRow | undefined
}

export function markEmailSent(sessionId: string, at: string): void {
  getDb().prepare('UPDATE sessions SET email_sent_at = ? WHERE id = ?').run(at, sessionId)
}

export function onAppQuit(): void {
  app.on('before-quit', () => {
    closeDb()
  })
}
