import { createHash, timingSafeEqual } from 'crypto'

/**
 * Constant-time string comparison. Both inputs are SHA-256 hashed first so the
 * buffers passed to timingSafeEqual are always equal length — this handles
 * length mismatches without an early return that would leak length information.
 */
export function secureCompare(a: string | null | undefined, b: string | null | undefined): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false
  const ha = createHash('sha256').update(a).digest()
  const hb = createHash('sha256').update(b).digest()
  return timingSafeEqual(ha, hb)
}

/** Constant-time check of an Authorization header against `Bearer ${CRON_SECRET}`. */
export function cronAuthOk(authHeader: string | null): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  return secureCompare(authHeader, `Bearer ${secret}`)
}
