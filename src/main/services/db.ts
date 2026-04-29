import Database from 'better-sqlite3'
import { app } from 'electron'
import { getDbPath } from './paths'
import type { TemplateId } from '../../shared/templateId'

export type SessionProcessingStatus = 'pending' | 'processing' | 'completed' | 'failed'

let db: Database.Database | null = null
const stmtCache: Partial<{
  getProfileName: Database.Statement
  setProfileName: Database.Statement
  upsertSessionBase: Database.Statement
  updateSessionProcessedData: Database.Statement
  updateSessionProcessingState: Database.Statement
  updateSessionTemplate: Database.Statement
  deleteSession: Database.Statement
  listSessionRowsLight: Database.Statement
  getSessionRow: Database.Statement
  markEmailSent: Database.Statement
}> = {}

function ensureSessionsColumns(database: Database.Database): void {
  const columns = database
    .prepare("SELECT name FROM pragma_table_info('sessions')")
    .all() as Array<{ name: string }>
  const names = new Set(columns.map((row) => row.name))
  if (!names.has('processing_status')) {
    database.exec(
      "ALTER TABLE sessions ADD COLUMN processing_status TEXT NOT NULL DEFAULT 'completed'"
    )
  }
  if (!names.has('processing_error')) {
    database.exec('ALTER TABLE sessions ADD COLUMN processing_error TEXT')
  }
  if (!names.has('last_processed_at')) {
    database.exec('ALTER TABLE sessions ADD COLUMN last_processed_at TEXT')
  }
  if (!names.has('validation_warnings_json')) {
    database.exec("ALTER TABLE sessions ADD COLUMN validation_warnings_json TEXT NOT NULL DEFAULT '[]'")
  }
  database.exec(
    "UPDATE sessions SET processing_status = 'completed' WHERE processing_status IS NULL OR trim(processing_status) = ''"
  )
}

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
      email_sent_at TEXT,
      processing_status TEXT NOT NULL DEFAULT 'completed',
      processing_error TEXT,
      last_processed_at TEXT,
      validation_warnings_json TEXT NOT NULL DEFAULT '[]'
    );
  `)
  ensureSessionsColumns(db)
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
  processing_status: SessionProcessingStatus
  processing_error: string | null
  last_processed_at: string | null
  validation_warnings_json: string
}

export type DbSessionListRowLight = {
  id: string
  ended_at: string
  profile_name: string
  audio_path: string
  template_id: string
  template_json: string
  transcript: string
  preview: string
  processing_status: SessionProcessingStatus
  processing_error: string | null
  last_processed_at: string | null
  validation_warnings_json: string
}

export function upsertSessionBase(row: {
  id: string
  endedAt: string
  profileName: string
  audioPath: string
  audioMime: string | null
  transcript: string
  templateId?: TemplateId
  templateJson?: string
  processingStatus: SessionProcessingStatus
  processingError?: string | null
  validationWarningsJson?: string
  lastProcessedAt?: string | null
}): void {
  const stmt =
    stmtCache.upsertSessionBase ??
    (stmtCache.upsertSessionBase = getDb().prepare(
      `INSERT INTO sessions (
         id, ended_at, profile_name, audio_path, audio_mime, transcript, template_id, template_json, email_sent_at,
         processing_status, processing_error, last_processed_at, validation_warnings_json
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         ended_at = excluded.ended_at,
         profile_name = excluded.profile_name,
         audio_path = excluded.audio_path,
         audio_mime = excluded.audio_mime,
         processing_status = excluded.processing_status,
         processing_error = excluded.processing_error,
         last_processed_at = excluded.last_processed_at`
    ))
  stmt.run(
    row.id,
    row.endedAt,
    row.profileName,
    row.audioPath,
    row.audioMime,
    row.transcript,
    row.templateId ?? 'generalNewClients',
    row.templateJson ?? '{}',
    row.processingStatus,
    row.processingError ?? null,
    row.lastProcessedAt ?? null,
    row.validationWarningsJson ?? '[]'
  )
}

export function updateSessionProcessedData(input: {
  id: string
  transcript: string
  templateId: TemplateId
  templateJson: string
  validationWarningsJson: string
  processingStatus: SessionProcessingStatus
  processingError?: string | null
  lastProcessedAt: string
}): void {
  const stmt =
    stmtCache.updateSessionProcessedData ??
    (stmtCache.updateSessionProcessedData = getDb().prepare(
      `UPDATE sessions
       SET transcript = ?, template_id = ?, template_json = ?, validation_warnings_json = ?,
           processing_status = ?, processing_error = ?, last_processed_at = ?
       WHERE id = ?`
    ))
  stmt.run(
    input.transcript,
    input.templateId,
    input.templateJson,
    input.validationWarningsJson,
    input.processingStatus,
    input.processingError ?? null,
    input.lastProcessedAt,
    input.id
  )
}

export function updateSessionProcessingState(input: {
  id: string
  processingStatus: SessionProcessingStatus
  processingError?: string | null
  lastProcessedAt?: string | null
}): void {
  const stmt =
    stmtCache.updateSessionProcessingState ??
    (stmtCache.updateSessionProcessingState = getDb().prepare(
      `UPDATE sessions
       SET processing_status = ?, processing_error = ?, last_processed_at = COALESCE(?, last_processed_at)
       WHERE id = ?`
    ))
  stmt.run(
    input.processingStatus,
    input.processingError ?? null,
    input.lastProcessedAt ?? null,
    input.id
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
        template_json,
        processing_status,
        processing_error,
        last_processed_at,
        validation_warnings_json,
        transcript,
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
      'SELECT id, ended_at, profile_name, audio_path, audio_mime, transcript, template_id, template_json, email_sent_at, processing_status, processing_error, last_processed_at, validation_warnings_json FROM sessions WHERE id = ?'
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
