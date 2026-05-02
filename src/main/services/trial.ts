import { createHmac } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { homedir, hostname } from 'node:os'
import { dirname, join } from 'node:path'
import { getSetting, setSetting } from './db'
import {
  buildTrialState,
  TRIAL_ALWAYS_ACTIVE,
  TRIAL_EXPIRED_USER_MESSAGE,
  type TrialState
} from '../../shared/trial'

const SQLITE_FIRST = 'trial.firstRunAt'
const SQLITE_LAST = 'trial.lastSeenAt'
const REGISTRY_KEY = '\\Software\\TakingNotesAgent\\Trial'
const ROLLBACK_GUARD_MS = 60 * 60 * 1000

type TrialRecord = { firstRunAt: string; lastSeenAt: string; v: number }

export class TrialExpiredError extends Error {
  constructor() {
    super(TRIAL_EXPIRED_USER_MESSAGE)
    this.name = 'TrialExpiredError'
  }
}

/** Canonical first-run + tamper flag; expiry is recomputed with wall-clock on each read. */
let trialAnchor: { firstRunAt: string; clockTampered: boolean } | undefined

function hmacSecret(): string {
  return createHmac('sha256', 'tna-trial-hmac-v1').update(hostname()).digest('hex')
}

function signPayload(payloadB64: string): string {
  return createHmac('sha256', hmacSecret()).update(payloadB64).digest('hex')
}

function hiddenTrialPath(): string {
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA?.trim()
    if (appData) {
      return join(appData, '.tnt-trial.dat')
    }
  }
  return join(homedir(), '.config', '.tnt-trial.dat')
}

function parseRecord(first: string | null, last: string | null): TrialRecord | null {
  if (!first?.trim() || !last?.trim()) {
    return null
  }
  const fa = first.trim()
  const la = last.trim()
  if (!Number.isFinite(Date.parse(fa)) || !Number.isFinite(Date.parse(la))) {
    return null
  }
  return { firstRunAt: fa, lastSeenAt: la, v: 1 }
}

function readSqliteTrial(): TrialRecord | null {
  try {
    return parseRecord(getSetting(SQLITE_FIRST), getSetting(SQLITE_LAST))
  } catch {
    return null
  }
}

function writeSqliteTrial(rec: TrialRecord): void {
  try {
    setSetting(SQLITE_FIRST, rec.firstRunAt)
    setSetting(SQLITE_LAST, rec.lastSeenAt)
  } catch {
    /* ignore */
  }
}

async function readRegistryTrial(): Promise<TrialRecord | null> {
  if (!__TRIAL_ENABLED__ || process.platform !== 'win32') {
    return null
  }
  try {
    const Winreg = (await import('winreg')).default as typeof import('winreg')
    const key = new Winreg({ hive: Winreg.HKCU, key: REGISTRY_KEY })
    const getVal = (name: string): Promise<string | null> =>
      new Promise((resolve) => {
        key.get(name, (err: Error | null, item: unknown) => {
          if (err || !item || typeof item !== 'object' || !('value' in item)) {
            resolve(null)
            return
          }
          resolve(String((item as { value: unknown }).value))
        })
      })
    const fa = await getVal('firstRunAt')
    const la = await getVal('lastSeenAt')
    return parseRecord(fa, la)
  } catch {
    return null
  }
}

async function writeRegistryTrial(rec: TrialRecord): Promise<void> {
  if (!__TRIAL_ENABLED__ || process.platform !== 'win32') {
    return
  }
  try {
    const Winreg = (await import('winreg')).default as typeof import('winreg')
    const key = new Winreg({ hive: Winreg.HKCU, key: REGISTRY_KEY })
    const setVal = (name: string, value: string): Promise<void> =>
      new Promise((resolve) => {
        key.set(name, Winreg.REG_SZ, value, () => resolve())
      })
    await setVal('firstRunAt', rec.firstRunAt)
    await setVal('lastSeenAt', rec.lastSeenAt)
  } catch {
    /* ignore */
  }
}

async function readHiddenTrial(): Promise<TrialRecord | null> {
  if (!__TRIAL_ENABLED__) {
    return null
  }
  const path = hiddenTrialPath()
  try {
    const raw = (await readFile(path, 'utf8')).trim()
    const dot = raw.lastIndexOf('.')
    if (dot <= 0) {
      return null
    }
    const payloadB64 = raw.slice(0, dot)
    const sig = raw.slice(dot + 1)
    if (!payloadB64 || !sig) {
      return null
    }
    const expected = signPayload(payloadB64)
    if (expected !== sig) {
      return null
    }
    const json = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')) as {
      firstRunAt?: string
      lastSeenAt?: string
      v?: number
    }
    return parseRecord(json.firstRunAt ?? null, json.lastSeenAt ?? null)
  } catch {
    return null
  }
}

async function writeHiddenTrial(rec: TrialRecord): Promise<void> {
  if (!__TRIAL_ENABLED__) {
    return
  }
  const path = hiddenTrialPath()
  try {
    const payload = Buffer.from(JSON.stringify(rec), 'utf8').toString('base64url')
    const sig = signPayload(payload)
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, `${payload}.${sig}`, 'utf8')
  } catch {
    /* ignore */
  }
}

function minIso(isos: string[]): string {
  let best = isos[0]!
  let bestT = Date.parse(best)
  for (const s of isos.slice(1)) {
    const t = Date.parse(s)
    if (Number.isFinite(t) && t < bestT) {
      best = s
      bestT = t
    }
  }
  return best
}

function maxTimeMs(records: Array<TrialRecord | null>): number | null {
  let max: number | null = null
  for (const r of records) {
    if (!r) {
      continue
    }
    const t = Date.parse(r.lastSeenAt)
    if (!Number.isFinite(t)) {
      continue
    }
    max = max == null ? t : Math.max(max, t)
  }
  return max
}

export async function initTrialState(): Promise<void> {
  if (!__TRIAL_ENABLED__) {
    return
  }
  try {
    const nowMs = Date.now()
    const nowIso = new Date(nowMs).toISOString()

    const fromSqlite = readSqliteTrial()
    const fromReg = await readRegistryTrial()
    const fromFile = await readHiddenTrial()
    const reads: Array<TrialRecord | null> = [fromSqlite, fromReg, fromFile]

    const maxLast = maxTimeMs(reads)
    const clockTampered = maxLast != null && nowMs < maxLast - ROLLBACK_GUARD_MS

    const firstRuns = reads
      .filter((r): r is TrialRecord => r != null)
      .map((r) => r.firstRunAt)
      .filter((s) => Number.isFinite(Date.parse(s)))

    const canonicalFirst = firstRuns.length === 0 ? nowIso : minIso(firstRuns)
    const rec: TrialRecord = { firstRunAt: canonicalFirst, lastSeenAt: nowIso, v: 1 }

    writeSqliteTrial(rec)
    await writeRegistryTrial(rec)
    await writeHiddenTrial(rec)

    trialAnchor = { firstRunAt: canonicalFirst, clockTampered }
  } catch (e) {
    console.warn('[Taking Notes Agent] initTrialState failed:', e)
    trialAnchor = undefined
  }
}

export async function getTrialState(): Promise<TrialState> {
  if (!__TRIAL_ENABLED__) {
    return TRIAL_ALWAYS_ACTIVE
  }
  if (trialAnchor == null) {
    console.warn('[Taking Notes Agent] getTrialState: anchor empty; fail-open')
    return TRIAL_ALWAYS_ACTIVE
  }
  return buildTrialState({
    firstRunAtIso: trialAnchor.firstRunAt,
    clockTampered: trialAnchor.clockTampered,
    nowMs: Date.now()
  })
}

export function assertTrialActive(): void {
  if (!__TRIAL_ENABLED__) {
    return
  }
  if (trialAnchor == null) {
    console.warn('[Taking Notes Agent] assertTrialActive: anchor empty; fail-open')
    return
  }
  const live = buildTrialState({
    firstRunAtIso: trialAnchor.firstRunAt,
    clockTampered: trialAnchor.clockTampered,
    nowMs: Date.now()
  })
  if (live.isExpired) {
    throw new TrialExpiredError()
  }
}
