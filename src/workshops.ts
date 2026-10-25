/**
 * Workshop-Semantik für die öffentliche Seite. Zwei Quellen, gewählt über
 * SIGNUP_BACKEND (plan.md §12): die Hidden Fields der Tally-Formulare
 * (`date=12-08-2026`, `freeSpots=4`) oder die eigene D1. Beide liefern
 * dieselben Workshops, damit Cards, Anmeldeseite und JSON-LD nicht wissen
 * müssen, woher sie kommen.
 *
 * Alles ausser den load-Funktionen ist rein und ohne Netzwerk testbar.
 */

import { listPublishedWorkshops, type WorkshopWithSeats } from './db.ts'
import { getFormQuestions, listForms, type TallyQuestion } from './tally.ts'

/** Ab so vielen freien Plätzen erscheint kein Hinweis mehr. */
export const LOW_SPOTS_THRESHOLD = 3

/** Tally-IDs sind alphanumerisch — alles andere kommt nicht in eine URL. */
const FORM_ID_PATTERN = /^[A-Za-z0-9_-]+$/

/**
 * Die ID landet in der Adresse der Anmeldeseite, in der Embed-URL und in der
 * Angebots-URL des JSON-LD.
 * Geprüft wird deshalb einmal hier, nicht in jeder View einzeln.
 */
export function hasUsableId(id: string): boolean {
  return FORM_ID_PATTERN.test(id)
}

export type WorkshopState = 'open' | 'low' | 'soldOut'

export interface Workshop {
  id: string
  name: string
  /** ISO YYYY-MM-DD */
  date: string
  /** null heisst unbekannt, nicht ausgebucht. */
  freeSpots: number | null
  state: WorkshopState
  /**
   * Uhrzeit und Plätze gibt es nur aus der D1; aus Tally sind sie null. Die
   * Views zeigen, was da ist, und lassen den Rest weg.
   */
  startTime: string | null
  endTime: string | null
  capacity: number | null
  /** Optionaler Satz auf der Card, z.B. „Mit Apéro zum Abschluss“. */
  note: string | null
}

export interface WorkshopsResult {
  workshops: Workshop[]
  /** Nur true, wenn schon die Formularliste nicht geladen werden konnte. */
  failed: boolean
}

/**
 * Sammelt alle `key=value`-Paare aus den HIDDEN_FIELDS-Blöcken.
 * Keys werden lowercase abgelegt, `freeSpots` findet man also unter `freespots`.
 */
export function parseHiddenFields(questions: TallyQuestion[]): Map<string, string> {
  const values = new Map<string, string>()

  for (const question of questions) {
    if (question.type !== 'HIDDEN_FIELDS' || question.isDeleted) continue

    for (const field of question.fields) {
      if (!field.title) continue

      // Am ersten '=' trennen — der Wert darf selbst welche enthalten.
      const separator = field.title.indexOf('=')
      if (separator < 1) continue

      const key = field.title.slice(0, separator).trim().toLowerCase()
      if (!key) continue

      values.set(key, field.title.slice(separator + 1).trim())
    }
  }

  return values
}

const DATE_PATTERN = /^(\d{2})-(\d{2})-(\d{4})$/
/** Altbestand ohne Trennzeichen, z.B. `12082026`. */
const LEGACY_DATE_PATTERN = /^(\d{2})(\d{2})(\d{4})$/

/** `DD-MM-YYYY` (oder `DDMMYYYY`) → ISO `YYYY-MM-DD`, sonst null. */
export function parseWorkshopDate(raw: string | undefined): string | null {
  if (!raw) return null

  const trimmed = raw.trim()
  const match = DATE_PATTERN.exec(trimmed) ?? LEGACY_DATE_PATTERN.exec(trimmed)
  if (!match) return null

  const [, day, month, year] = match
  const iso = `${year}-${month}-${day}`

  // Round-Trip, damit 31-02-2026 nicht stillschweigend zum 3. März wird.
  const parsed = new Date(`${iso}T00:00:00Z`)
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== iso) return null

  return iso
}

/**
 * ISO `YYYY-MM-DD` → `DD.MM.YYYY`, aus den Teilen zusammengesetzt statt über
 * `new Date()`. Steht hier statt in einer View, weil Card, Anmeldeseite und
 * Seitentitel dasselbe Datum zeigen müssen.
 */
export function formatWorkshopDate(iso: string): string {
  const [year, month, day] = iso.split('-')
  return `${day}.${month}.${year}`
}

export function parseFreeSpots(raw: string | undefined): number | null {
  if (raw === undefined) return null

  const trimmed = raw.trim()
  if (!/^\d+$/.test(trimmed)) return null

  return Number.parseInt(trimmed, 10)
}

export function deriveState(freeSpots: number | null): WorkshopState {
  // Ein Tippfehler im Hidden Field darf die Anmeldung nicht blockieren.
  if (freeSpots === null) return 'open'
  if (freeSpots <= 0) return 'soldOut'
  if (freeSpots < LOW_SPOTS_THRESHOLD) return 'low'
  return 'open'
}

/**
 * Heute in Europe/Zurich als ISO-String. Nötig, weil der Worker in UTC läuft:
 * ein Workshop am 12.08. soll den ganzen 12.08. Schweizer Zeit sichtbar bleiben.
 */
export function todayInZurich(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Zurich',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

export async function loadWorkshops(token: string): Promise<WorkshopsResult> {
  let forms

  try {
    forms = await listForms(token)
  } catch (error) {
    console.error('Tally: Formularliste konnte nicht geladen werden', error)
    return { workshops: [], failed: true }
  }

  // Entwürfe und geschlossene Formulare vorab aussortieren — das spart Subrequests.
  const published = forms.filter((form) => form.status === 'PUBLISHED' && !form.isClosed)

  // Ein Subrequest für die Liste plus einer pro Formular. Der Free Plan erlaubt
  // 50 pro Invocation, also maximal ~49 Formulare.
  const questions = await Promise.allSettled(
    published.map((form) => getFormQuestions(token, form.id)),
  )

  const today = todayInZurich()
  const workshops: Workshop[] = []

  published.forEach((form, index) => {
    const result = questions[index]

    if (result.status === 'rejected') {
      // Nur diese Card fällt weg, nicht die Seite.
      console.error(`Tally: Fragen zu Formular ${form.id} nicht ladbar`, result.reason)
      return
    }

    if (!hasUsableId(form.id)) {
      console.error(`Tally: Formular ${form.id} hat eine unerwartete ID und wird übersprungen`)
      return
    }

    const hidden = parseHiddenFields(result.value)

    const date = parseWorkshopDate(hidden.get('date'))
    if (!date) return // ohne gültiges Datum kein Workshop

    // ISO-Strings sind lexikografisch vergleichbar, keine Zeitzonen-Arithmetik nötig.
    if (date < today) return

    const freeSpots = parseFreeSpots(hidden.get('freespots'))

    workshops.push({
      id: form.id,
      name: form.name,
      date,
      freeSpots,
      state: deriveState(freeSpots),
      startTime: null,
      endTime: null,
      capacity: null,
      note: null,
    })
  })

  workshops.sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name, 'de-CH'))

  return { workshops, failed: false }
}

/**
 * Ein Termin aus der D1 in der Form, die die öffentlichen Views kennen. Der
 * Name bleibt leer: Workshops aus der D1 haben keinen, der Titel der Card ist
 * das Datum.
 */
export function fromDatabase(row: WorkshopWithSeats): Workshop {
  return {
    id: row.id,
    name: '',
    date: row.date,
    freeSpots: row.free,
    state: deriveState(row.free),
    startTime: row.start_time,
    endTime: row.end_time,
    capacity: row.capacity,
    note: row.note,
  }
}

/**
 * Dieselbe Rückgabe wie loadWorkshops(), aus der D1. Die Reihenfolge nach
 * Datum und Startzeit macht schon die Abfrage.
 */
export async function loadWorkshopsFromDatabase(db: D1Database): Promise<WorkshopsResult> {
  try {
    const rows = await listPublishedWorkshops(db, todayInZurich())
    return { workshops: rows.map(fromDatabase), failed: false }
  } catch (error) {
    console.error('D1: Termine konnten nicht geladen werden', error)
    return { workshops: [], failed: true }
  }
}

const ZURICH_PARTS = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Zurich',
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
})

/**
 * Abstand von Europe/Zurich zu UTC an diesem Tag und dieser Uhrzeit, als
 * `+01:00` (Winter) oder `+02:00` (Sommer). Ermittelt über Intl statt fest
 * eingetragen, damit die Zeitumstellung stimmt.
 *
 * Gemessen an der Uhrzeit als UTC gelesen — in der Stunde der Umstellung um
 * 02:00/03:00 nachts kann das daneben liegen, ein Workshop beginnt dort nie.
 */
export function zurichOffset(date: string, time: string): string {
  const instant = new Date(`${date}T${time}:00Z`)
  const parts = Object.fromEntries(ZURICH_PARTS.formatToParts(instant).map((part) => [part.type, part.value]))
  const wall = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
  )

  const minutes = Math.round((wall - instant.getTime()) / 60_000)
  const sign = minutes < 0 ? '-' : '+'
  const absolute = Math.abs(minutes)
  const hours = String(Math.floor(absolute / 60)).padStart(2, '0')
  return `${sign}${hours}:${String(absolute % 60).padStart(2, '0')}`
}

/** `2026-11-28` + `10:00` → `2026-11-28T10:00:00+01:00`, für JSON-LD und Kalender. */
export function zurichDateTime(date: string, time: string): string {
  return `${date}T${time}:00${zurichOffset(date, time)}`
}

/** `10:00–17:00`, oder null, solange die Uhrzeit unbekannt ist (Tally). */
export function formatTimeRange(workshop: Pick<Workshop, 'startTime' | 'endTime'>): string | null {
  return workshop.startTime && workshop.endTime ? `${workshop.startTime}–${workshop.endTime}` : null
}
