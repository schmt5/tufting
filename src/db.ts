/**
 * Alle SQL-Statements an einem Ort. Die Routen rufen nur diese Funktionen auf
 * und schreiben selbst kein SQL — so bleibt sichtbar, welche Abfragen es gibt
 * und welche davon den Platz-Check enthalten.
 *
 * Schema: migrations/0001_init.sql, Begründungen in plan.md §4 und §5.
 */

export type WorkshopStatus = 'draft' | 'published' | 'cancelled'

export interface WorkshopRow {
  id: string
  /** ISO YYYY-MM-DD, Europe/Zurich */
  date: string
  /** HH:MM, Europe/Zurich */
  start_time: string
  end_time: string
  capacity: number
  note: string | null
  status: WorkshopStatus
  created_at: number
  updated_at: number
}

/** Ein Workshop mit den gezählten Plätzen. */
export interface WorkshopWithSeats extends WorkshopRow {
  /** Personen aus allen nicht stornierten Anmeldungen. */
  booked: number
  /**
   * Nie negativ. Hat Naira bewusst überbucht, ist der Termin einfach voll —
   * eine negative Zahl hätte auf der Seite keine Bedeutung.
   */
  free: number
}

export interface WorkshopInput {
  date: string
  start_time: string
  end_time: string
  capacity: number
  note: string | null
  status: WorkshopStatus
}

export interface SignupRow {
  id: string
  workshop_id: string
  first_name: string
  last_name: string
  email: string
  persons: number
  comment: string | null
  source: 'web' | 'admin'
  created_at: number
  contacted_at: number | null
  cancelled_at: number | null
}

export interface SignupInput {
  workshop_id: string
  first_name: string
  last_name: string
  email: string
  persons: number
  comment: string | null
}

export type InsertSignupResult =
  | { ok: true; id: string }
  /** Nicht genug Plätze — oder der Termin ist nicht (mehr) offen. */
  | { ok: false }

/**
 * Kleinbuchstaben und Ziffern ohne 0/o und 1/l, damit eine ID auch vorgelesen
 * oder abgetippt funktioniert. 32 Zeichen, also 5 Bit pro Stelle.
 */
const ID_ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789'

/**
 * Zufällige ID statt fortlaufender Zahl: die Workshop-ID steht in öffentlichen
 * Adressen, und eine erratbare Anmelde-ID wäre eine Einladung, sobald sie je
 * irgendwo auftaucht.
 *
 * 10 Stellen (50 Bit) für Workshops, 16 Stellen (80 Bit) für Anmeldungen.
 */
export function newId(length: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length))
  // 256 ist ein Vielfaches von 32 — der Modulo verzerrt die Verteilung nicht.
  return Array.from(bytes, (byte) => ID_ALPHABET[byte % ID_ALPHABET.length]).join('')
}

export const WORKSHOP_ID_LENGTH = 10
export const SIGNUP_ID_LENGTH = 16

/** Jetzt als Unix-Sekunden, wie in allen Zeitstempel-Spalten. */
export function nowSeconds(now: Date = new Date()): number {
  return Math.floor(now.getTime() / 1000)
}

/**
 * Belegte Plätze als Unterabfrage, damit jede Workshop-Abfrage dieselbe
 * Zählung verwendet. Stornierte Anmeldungen zählen nicht.
 */
const BOOKED = `COALESCE((
  SELECT SUM(s.persons) FROM signups s
  WHERE s.workshop_id = w.id AND s.cancelled_at IS NULL
), 0)`

const WORKSHOP_WITH_SEATS = `
  SELECT w.*, ${BOOKED} AS booked, MAX(w.capacity - ${BOOKED}, 0) AS free
  FROM workshops w`

/** Startseite: veröffentlichte Termine ab heute, nach Datum und Startzeit. */
export async function listPublishedWorkshops(
  db: D1Database,
  today: string,
): Promise<WorkshopWithSeats[]> {
  const { results } = await db
    .prepare(
      `${WORKSHOP_WITH_SEATS}
       WHERE w.status = 'published' AND w.date >= ?1
       ORDER BY w.date, w.start_time`,
    )
    .bind(today)
    .all<WorkshopWithSeats>()

  return results
}

/**
 * Anmeldeseite: ein veröffentlichter Termin ab heute, sonst null. Entwürfe,
 * abgesagte und vergangene Termine sehen von aussen gleich aus wie ein
 * Termin, den es nicht gibt.
 */
export async function getPublishedWorkshop(
  db: D1Database,
  id: string,
  today: string,
): Promise<WorkshopWithSeats | null> {
  return db
    .prepare(`${WORKSHOP_WITH_SEATS} WHERE w.id = ?1 AND w.status = 'published' AND w.date >= ?2`)
    .bind(id, today)
    .first<WorkshopWithSeats>()
}

/** Admin-Übersicht: alle Termine ab heute, auch Entwürfe und abgesagte. */
export async function listUpcomingWorkshops(
  db: D1Database,
  today: string,
): Promise<WorkshopWithSeats[]> {
  const { results } = await db
    .prepare(`${WORKSHOP_WITH_SEATS} WHERE w.date >= ?1 ORDER BY w.date, w.start_time`)
    .bind(today)
    .all<WorkshopWithSeats>()

  return results
}

/** Admin-Übersicht: die letzten vergangenen Termine, neueste zuerst. */
export async function listPastWorkshops(
  db: D1Database,
  today: string,
  limit: number,
): Promise<WorkshopWithSeats[]> {
  const { results } = await db
    .prepare(
      `${WORKSHOP_WITH_SEATS} WHERE w.date < ?1 ORDER BY w.date DESC, w.start_time DESC LIMIT ?2`,
    )
    .bind(today, limit)
    .all<WorkshopWithSeats>()

  return results
}

/**
 * Anmeldungen, denen Naira noch nicht geschrieben hat, pro Termin. Getrennt
 * von WORKSHOP_WITH_SEATS, weil nur der Admin sie braucht.
 */
export async function countNewSignups(db: D1Database): Promise<Map<string, number>> {
  const { results } = await db
    .prepare(
      `SELECT workshop_id, COUNT(*) AS count FROM signups
       WHERE contacted_at IS NULL AND cancelled_at IS NULL
       GROUP BY workshop_id`,
    )
    .all<{ workshop_id: string; count: number }>()

  return new Map(results.map((row) => [row.workshop_id, row.count]))
}

/** Admin: ein Termin in jedem Zustand, auch vergangen. */
export async function getWorkshop(db: D1Database, id: string): Promise<WorkshopWithSeats | null> {
  return db.prepare(`${WORKSHOP_WITH_SEATS} WHERE w.id = ?1`).bind(id).first<WorkshopWithSeats>()
}

export async function createWorkshop(
  db: D1Database,
  input: WorkshopInput,
  now: number = nowSeconds(),
): Promise<string> {
  const id = newId(WORKSHOP_ID_LENGTH)

  await db
    .prepare(
      `INSERT INTO workshops (id, date, start_time, end_time, capacity, note, status, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8)`,
    )
    .bind(id, input.date, input.start_time, input.end_time, input.capacity, input.note, input.status, now)
    .run()

  return id
}

/** false, wenn es den Termin nicht gibt. */
export async function updateWorkshop(
  db: D1Database,
  id: string,
  input: WorkshopInput,
  now: number = nowSeconds(),
): Promise<boolean> {
  const result = await db
    .prepare(
      `UPDATE workshops
       SET date = ?2, start_time = ?3, end_time = ?4, capacity = ?5, note = ?6, status = ?7, updated_at = ?8
       WHERE id = ?1`,
    )
    .bind(id, input.date, input.start_time, input.end_time, input.capacity, input.note, input.status, now)
    .run()

  return result.meta.changes === 1
}

/**
 * Anmeldung über die Webseite, mit Platz-Check.
 *
 * Prüfen und Speichern sind **ein** Statement. D1 führt die Schreibzugriffe
 * auf eine Datenbank nacheinander aus; zwei gleichzeitige Anmeldungen auf den
 * letzten Platz können sich zwischen Prüfung und Speichern also nicht
 * überholen. Die zweite findet keinen Platz mehr und schreibt nichts.
 *
 * Getrennt gelesen und dann geschrieben (oder mit KV) könnten beide „1 frei“
 * sehen und beide speichern — siehe plan.md §2.
 */
export async function insertSignup(
  db: D1Database,
  input: SignupInput,
  today: string,
  now: number = nowSeconds(),
): Promise<InsertSignupResult> {
  const id = newId(SIGNUP_ID_LENGTH)

  const result = await db
    .prepare(
      `INSERT INTO signups (id, workshop_id, first_name, last_name, email, persons, comment, source, created_at)
       SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, 'web', ?8
       WHERE (
         SELECT w.capacity - ${BOOKED} FROM workshops w
         WHERE w.id = ?2 AND w.status = 'published' AND w.date >= ?9
       ) >= ?6`,
    )
    .bind(
      id,
      input.workshop_id,
      input.first_name,
      input.last_name,
      input.email,
      input.persons,
      input.comment,
      now,
      today,
    )
    .run()

  return result.meta.changes === 1 ? { ok: true, id } : { ok: false }
}

/**
 * Von Hand erfasste Anmeldung im Admin. Läuft über denselben Platz-Check wie
 * die Webseite, ausser Naira überbucht bewusst (`overbook`). Entwürfe und
 * vergangene Termine sind hier erlaubt — Naira darf nachtragen.
 */
export async function insertAdminSignup(
  db: D1Database,
  input: SignupInput,
  options: { overbook: boolean },
  now: number = nowSeconds(),
): Promise<InsertSignupResult> {
  const id = newId(SIGNUP_ID_LENGTH)

  // Ohne Überbuchen bleibt der Check; ein abgesagter Termin nimmt nie etwas an.
  const seatCheck = options.overbook ? '' : `AND w.capacity - ${BOOKED} >= ?6`

  const result = await db
    .prepare(
      `INSERT INTO signups (id, workshop_id, first_name, last_name, email, persons, comment, source, created_at)
       SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, 'admin', ?8
       WHERE EXISTS (
         SELECT 1 FROM workshops w
         WHERE w.id = ?2 AND w.status != 'cancelled' ${seatCheck}
       )`,
    )
    .bind(
      id,
      input.workshop_id,
      input.first_name,
      input.last_name,
      input.email,
      input.persons,
      input.comment,
      now,
    )
    .run()

  return result.meta.changes === 1 ? { ok: true, id } : { ok: false }
}

/** Admin: alle Anmeldungen eines Termins, älteste zuerst, stornierte mit. */
export async function listSignups(db: D1Database, workshopId: string): Promise<SignupRow[]> {
  const { results } = await db
    .prepare('SELECT * FROM signups WHERE workshop_id = ?1 ORDER BY created_at, id')
    .bind(workshopId)
    .all<SignupRow>()

  return results
}

export async function getSignup(db: D1Database, id: string): Promise<SignupRow | null> {
  return db.prepare('SELECT * FROM signups WHERE id = ?1').bind(id).first<SignupRow>()
}

/** Naira hat geschrieben. Ein zweiter Klick ändert den Zeitpunkt nicht. */
export async function markContacted(
  db: D1Database,
  id: string,
  now: number = nowSeconds(),
): Promise<boolean> {
  const result = await db
    .prepare('UPDATE signups SET contacted_at = COALESCE(contacted_at, ?2) WHERE id = ?1')
    .bind(id, now)
    .run()

  return result.meta.changes === 1
}

/** Stornieren gibt die Plätze frei; die Anmeldung bleibt zur Nachvollziehbarkeit stehen. */
export async function cancelSignup(
  db: D1Database,
  id: string,
  now: number = nowSeconds(),
): Promise<boolean> {
  const result = await db
    .prepare('UPDATE signups SET cancelled_at = COALESCE(cancelled_at, ?2) WHERE id = ?1')
    .bind(id, now)
    .run()

  return result.meta.changes === 1
}

export async function deleteSignup(db: D1Database, id: string): Promise<boolean> {
  const result = await db.prepare('DELETE FROM signups WHERE id = ?1').bind(id).run()
  return result.meta.changes === 1
}

/** Fehlversuche einer IP seit `since` (Unix-Sekunden), für die Login-Sperre. */
export async function countLoginFailures(db: D1Database, ip: string, since: number): Promise<number> {
  const row = await db
    .prepare('SELECT COUNT(*) AS count FROM login_failures WHERE ip = ?1 AND at > ?2')
    .bind(ip, since)
    .first<{ count: number }>()

  return row?.count ?? 0
}

export async function recordLoginFailure(
  db: D1Database,
  ip: string,
  now: number = nowSeconds(),
): Promise<void> {
  await db.prepare('INSERT INTO login_failures (ip, at) VALUES (?1, ?2)').bind(ip, now).run()
}

/** Nach einem erfolgreichen Login zählt die Vorgeschichte dieser IP nicht mehr. */
export async function clearLoginFailures(db: D1Database, ip: string): Promise<void> {
  await db.prepare('DELETE FROM login_failures WHERE ip = ?1').bind(ip).run()
}

export interface PushSubscriptionRow {
  endpoint: string
  p256dh: string
  auth: string
  label: string | null
  created_at: number
}

/**
 * Ein Gerät für Push anmelden. Meldet sich dasselbe Gerät neu an (gleicher
 * Endpunkt, neue Schlüssel), ersetzt das den alten Eintrag.
 */
export async function savePushSubscription(
  db: D1Database,
  subscription: { endpoint: string; p256dh: string; auth: string; label: string | null },
  now: number = nowSeconds(),
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO push_subscriptions (endpoint, p256dh, auth, label, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5)
       ON CONFLICT (endpoint) DO UPDATE SET p256dh = ?2, auth = ?3, label = ?4`,
    )
    .bind(subscription.endpoint, subscription.p256dh, subscription.auth, subscription.label, now)
    .run()
}

export async function listPushSubscriptions(db: D1Database): Promise<PushSubscriptionRow[]> {
  const { results } = await db
    .prepare('SELECT * FROM push_subscriptions ORDER BY created_at')
    .all<PushSubscriptionRow>()
  return results
}

export async function deletePushSubscription(db: D1Database, endpoint: string): Promise<boolean> {
  const result = await db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?1').bind(endpoint).run()
  return result.meta.changes === 1
}

/** Die gespeicherte Fassung einer Vorlage, oder null für den Standardtext. */
export async function getTemplate(db: D1Database, key: string): Promise<{ subject: string; body: string } | null> {
  return db.prepare('SELECT subject, body FROM templates WHERE key = ?1').bind(key).first<{ subject: string; body: string }>()
}

export async function saveTemplate(
  db: D1Database,
  key: string,
  template: { subject: string; body: string },
  now: number = nowSeconds(),
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO templates (key, subject, body, updated_at) VALUES (?1, ?2, ?3, ?4)
       ON CONFLICT (key) DO UPDATE SET subject = ?2, body = ?3, updated_at = ?4`,
    )
    .bind(key, template.subject, template.body, now)
    .run()
}

/** Zurück zum Standardtext: die gespeicherte Fassung löschen. */
export async function deleteTemplate(db: D1Database, key: string): Promise<void> {
  await db.prepare('DELETE FROM templates WHERE key = ?1').bind(key).run()
}
