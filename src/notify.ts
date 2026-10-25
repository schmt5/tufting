/**
 * Mitteilungen an Naira: wer sich angemeldet hat, an alle angemeldeten
 * Geräte. Baut auf push.ts auf und räumt dabei Geräte weg, die der
 * Push-Dienst nicht mehr kennt.
 */

import { deletePushSubscription, listPushSubscriptions, nowSeconds, type SignupInput } from './db.ts'
import type { Env } from './env.ts'
import { type PushMessage, sendPush, vapidConfig } from './push.ts'
import { formatWorkshopDate, type Workshop } from './workshops.ts'

export interface NotifyResult {
  sent: number
  failed: number
  /** Abgemeldete Geräte, die dabei gelöscht wurden. */
  removed: number
}

/** An alle Geräte; ohne VAPID-Konfiguration passiert nichts. */
export async function notifyAdmin(env: Env, message: PushMessage): Promise<NotifyResult> {
  const result: NotifyResult = { sent: 0, failed: 0, removed: 0 }

  const vapid = vapidConfig(env)
  if (!vapid) return result

  const subscriptions = await listPushSubscriptions(env.DB)
  const now = nowSeconds()

  await Promise.all(
    subscriptions.map(async (subscription) => {
      const outcome = await sendPush(subscription, message, vapid, now)

      if (outcome === 'sent') result.sent++
      else if (outcome === 'failed') result.failed++
      else {
        await deletePushSubscription(env.DB, subscription.endpoint)
        result.removed++
      }
    }),
  )

  return result
}

/** `28.11.2026` → `28.11.` — im Titel einer Mitteilung reicht der Tag. */
function shortDate(iso: string): string {
  return formatWorkshopDate(iso).slice(0, 6)
}

/**
 * „Neue Anmeldung 28.11. — Mia B., 2 Personen. Noch 1 Platz frei.“
 *
 * Nur Vorname und Initial: die Mitteilung kann auf dem Sperrbildschirm stehen.
 * Alles Weitere zeigt der Admin hinter dem Login.
 */
export function newSignupMessage(workshop: Workshop, signup: SignupInput, signupId: string): PushMessage {
  const free = Math.max((workshop.freeSpots ?? 0) - signup.persons, 0)
  const persons = signup.persons === 1 ? '1 Person' : `${signup.persons} Personen`
  const seats = free === 0 ? 'Jetzt ausgebucht.' : free === 1 ? 'Noch 1 Platz frei.' : `Noch ${free} Plätze frei.`

  return {
    title: `Neue Anmeldung ${shortDate(workshop.date)}`,
    body: `${signup.first_name} ${signup.last_name.charAt(0)}., ${persons}. ${seats}`,
    url: `/admin/workshops/${workshop.id}#anmeldung-${signupId}`,
  }
}
