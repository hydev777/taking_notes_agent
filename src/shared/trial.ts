export type TrialState = {
  firstRunAt: string
  expiresAt: string
  isExpired: boolean
  /**
   * Whole days. Positive = days left; 0 = expires within 24h; negative = days since expiry.
   * Banner uses `Math.abs(daysRemaining)` when `isExpired`.
   */
  daysRemaining: number
  tampered: boolean
}

export const TRIAL_DAYS = 3

/** User-facing message when trial has ended (main throws `TrialExpiredError` with this text). */
export const TRIAL_EXPIRED_USER_MESSAGE =
  'Trial expired. Recording and AI processing are disabled. Existing sessions remain viewable and can be re-emailed.'

/** Default when trial is off or IPC fails (fail-open). */
export const TRIAL_ALWAYS_ACTIVE: TrialState = {
  firstRunAt: '2000-01-01T00:00:00.000Z',
  expiresAt: '9999-12-31T23:59:59.999Z',
  isExpired: false,
  daysRemaining: 9999,
  tampered: false
}

const MS_PER_DAY = 24 * 60 * 60 * 1000

export function trialExpiresAtIso(firstRunAtIso: string): string {
  const t = Date.parse(firstRunAtIso)
  if (!Number.isFinite(t)) {
    return new Date(0).toISOString()
  }
  return new Date(t + TRIAL_DAYS * MS_PER_DAY).toISOString()
}

export function buildTrialState(input: {
  firstRunAtIso: string
  clockTampered: boolean
  nowMs?: number
}): TrialState {
  const nowMs = input.nowMs ?? Date.now()
  const firstRunAt = input.firstRunAtIso
  const expiresAt = trialExpiresAtIso(firstRunAt)
  const expMs = Date.parse(expiresAt)
  const isPastExpiry = Number.isFinite(expMs) && nowMs >= expMs
  const isExpired = isPastExpiry || input.clockTampered
  const daysRemaining = Math.ceil((expMs - nowMs) / MS_PER_DAY)
  return {
    firstRunAt,
    expiresAt,
    isExpired,
    daysRemaining,
    tampered: input.clockTampered
  }
}
