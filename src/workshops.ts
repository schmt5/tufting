/**
 * Workshop-Semantik: deutet die Hidden Fields eines Tally-Formulars
 * (`date=12-08-2026`, `freeSpots=4`) und leitet daraus die Cards ab.
 *
 * Alles ausser loadWorkshops() ist rein und ohne Netzwerk testbar.
 */

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
    })
  })

  workshops.sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name, 'de-CH'))

  return { workshops, failed: false }
}
