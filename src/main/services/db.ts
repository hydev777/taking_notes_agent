import Database from 'better-sqlite3'
import { app } from 'electron'
import { getDbPath } from './paths'
import type { TemplateId } from '../../shared/templateId'

let db: Database.Database | null = null
const stmtCache: Partial<{
  getProfileName: Database.Statement
  setProfileName: Database.Statement
  insertSession: Database.Statement
  updateSessionTemplate: Database.Statement
  deleteSession: Database.Statement
  listSessionRowsLight: Database.Statement
  getSessionRow: Database.Statement
  markEmailSent: Database.Statement
}> = {}

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
    for (const key of Object.keys(stmtCache) as Array<keyof typeof stmtCache>) {
      delete stmtCache[key]
    }
  }
}

export function getProfileName(): string | null {
  const stmt =
    stmtCache.getProfileName ??
    (stmtCache.getProfileName = getDb().prepare('SELECT value FROM settings WHERE key = ?'))
  const row = stmt
    .get('profileName') as { value: string } | undefined
  return row?.value ?? null
}

export function setProfileName(name: string): void {
  const stmt =
    stmtCache.setProfileName ??
    (stmtCache.setProfileName = getDb().prepare(
      'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
    ))
  stmt.run('profileName', name.trim())
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

export type DbSessionListRowLight = {
  id: string
  ended_at: string
  profile_name: string
  audio_path: string
  template_id: string
  preview: string
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
  const stmt =
    stmtCache.insertSession ??
    (stmtCache.insertSession = getDb().prepare(
      `INSERT INTO sessions (id, ended_at, profile_name, audio_path, audio_mime, transcript, template_id, template_json, email_sent_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)`
    ))
  stmt.run(
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
  const stmt =
    stmtCache.updateSessionTemplate ??
    (stmtCache.updateSessionTemplate = getDb().prepare(
      'UPDATE sessions SET template_id = ?, template_json = ? WHERE id = ?'
    ))
  stmt.run(input.templateId, input.templateJson, input.id)
}

export function deleteSession(id: string): void {
  const stmt =
    stmtCache.deleteSession ??
    (stmtCache.deleteSession = getDb().prepare('DELETE FROM sessions WHERE id = ?'))
  stmt.run(id)
}

export function listSessionRowsLight(): DbSessionListRowLight[] {
  const stmt =
    stmtCache.listSessionRowsLight ??
    (stmtCache.listSessionRowsLight = getDb().prepare(
      `SELECT
        id,
        ended_at,
        profile_name,
        audio_path,
        template_id,
        CASE
          WHEN length(trim(replace(replace(replace(transcript, char(10), ' '), char(13), ' '), char(9), ' '))) <= 100
            THEN trim(replace(replace(replace(transcript, char(10), ' '), char(13), ' '), char(9), ' '))
          ELSE substr(trim(replace(replace(replace(transcript, char(10), ' '), char(13), ' '), char(9), ' ')), 1, 97) || '…'
        END AS preview
      FROM sessions
      ORDER BY ended_at DESC`
    ))
  return stmt.all() as DbSessionListRowLight[]
}

export function getSessionRow(id: string): DbSessionRow | undefined {
  const stmt =
    stmtCache.getSessionRow ??
    (stmtCache.getSessionRow = getDb().prepare(
      'SELECT id, ended_at, profile_name, audio_path, audio_mime, transcript, template_id, template_json, email_sent_at FROM sessions WHERE id = ?'
    ))
  return stmt.get(id) as DbSessionRow | undefined
}

export function markEmailSent(sessionId: string, at: string): void {
  const stmt =
    stmtCache.markEmailSent ??
    (stmtCache.markEmailSent = getDb().prepare('UPDATE sessions SET email_sent_at = ? WHERE id = ?'))
  stmt.run(at, sessionId)
}

export function onAppQuit(): void {
  app.on('before-quit', () => {
    closeDb()
  })
}
