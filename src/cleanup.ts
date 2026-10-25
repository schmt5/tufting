/**
 * Tägliches Aufräumen per Cron Trigger (wrangler.jsonc, `triggers.crons`).
 *
 * Anmeldungen bleiben drei Monate nach dem Workshop — genug für Nachfragen,
 * Gutscheine und Nachholtermine (plan.md §13) — und werden dann gelöscht.
 * Fehlversuche beim Login braucht es nur für die Sperre, also einen Tag.
 */

import { deleteLoginFailuresBefore, deleteSignupsBefore, nowSeconds } from './db.ts'
import { todayInZurich } from './workshops.ts'

export const RETENTION_MONTHS = 3
const LOGIN_FAILURE_SECONDS = 24 * 60 * 60

/**
 * `today` minus `months` Monate, als ISO-Datum. Fällt der Tag weg (31. Mai
 * minus drei Monate), gilt der letzte Tag des Monats — nicht der Überlauf in
 * den nächsten, den `Date` sonst rechnen würde.
 */
export function monthsBefore(today: string, months: number): string {
  const [year, month, day] = today.split('-').map(Number) as [number, number, number]
  const target = new Date(Date.UTC(year, month - 1 - months, 1))
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate()
  target.setUTCDate(Math.min(day, lastDay))
  return target.toISOString().slice(0, 10)
}

export interface CleanupResult {
  signups: number
  loginFailures: number
}

export async function cleanup(db: D1Database, now: Date = new Date()): Promise<CleanupResult> {
  const cutoff = monthsBefore(todayInZurich(now), RETENTION_MONTHS)

  const [signups, loginFailures] = await Promise.all([
    deleteSignupsBefore(db, cutoff),
    deleteLoginFailuresBefore(db, nowSeconds(now) - LOGIN_FAILURE_SECONDS),
  ])

  return { signups, loginFailures }
}
