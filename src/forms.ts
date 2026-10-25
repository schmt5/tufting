/**
 * Prüft, was aus einem HTML-Formular kommt. Rein und ohne Netzwerk testbar;
 * die Routen rendern bei Fehlern das Formular erneut, mit den eingegebenen
 * Werten und einer Meldung pro Feld.
 *
 * Die Browser-Validierung (`required`, `type="email"`, `min`) ist nur Komfort.
 * Was hier nicht geprüft wird, kommt in die Datenbank.
 */

import type { SignupInput, WorkshopInput, WorkshopStatus } from './db.ts'

/** Was `c.req.parseBody()` liefert. Dateien gibt es in diesen Formularen nicht. */
export type FormBody = Record<string, string | File | (string | File)[]>

/** Feldname → Meldung. */
export type FieldErrors = Record<string, string>

export type FormResult<T> =
  | { ok: true; value: T }
  | { ok: false; errors: FieldErrors; values: Record<string, string> }

/** Ein Feld als getrimmter String; fehlend, mehrfach oder Datei heisst leer. */
export function field(body: FormBody, name: string): string {
  const value = body[name]
  return typeof value === 'string' ? value.trim() : ''
}

/** Alle Textfelder, um sie nach einem Fehler wieder ins Formular zu setzen. */
function echo(body: FormBody, names: string[]): Record<string, string> {
  return Object.fromEntries(names.map((name) => [name, field(body, name)]))
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/

/** `YYYY-MM-DD` wie aus `<input type="date">`, mit Round-Trip gegen 31.02. */
export function isIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false

  const parsed = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

/** Nur Ziffern, ganzzahlig — `parseInt` liesse „3 Personen“ als 3 durch. */
function integer(value: string): number | null {
  return /^\d{1,4}$/.test(value) ? Number.parseInt(value, 10) : null
}

export const WORKSHOP_FIELDS = ['date', 'start_time', 'end_time', 'capacity', 'note', 'status']

const STATUSES: WorkshopStatus[] = ['draft', 'published', 'cancelled']

/** Grenze gegen Tippfehler wie 40 statt 4. Höher setzen, falls je grössere Gruppen kommen. */
export const MAX_CAPACITY = 12
export const MAX_NOTE_LENGTH = 280

export interface WorkshopFormContext {
  today: string
  /**
   * Beim Bearbeiten: schon gebuchte Personen. Weniger Plätze als das wären
   * eine stille Überbuchung — dafür gibt es das bewusste Überbuchen bei der
   * Anmeldung.
   */
  booked?: number
  /** Nur neue Termine müssen in der Zukunft liegen; alte darf Naira korrigieren. */
  isNew: boolean
}

export function parseWorkshopForm(body: FormBody, context: WorkshopFormContext): FormResult<WorkshopInput> {
  const values = echo(body, WORKSHOP_FIELDS)
  const errors: FieldErrors = {}

  if (!isIsoDate(values.date)) {
    errors.date = 'Bitte ein Datum wählen.'
  } else if (context.isNew && values.date < context.today) {
    errors.date = 'Das Datum liegt in der Vergangenheit.'
  }

  if (!TIME.test(values.start_time)) errors.start_time = 'Bitte eine Startzeit wie 10:00 angeben.'

  if (!TIME.test(values.end_time)) {
    errors.end_time = 'Bitte eine Endzeit wie 17:00 angeben.'
  } else if (!errors.start_time && values.end_time <= values.start_time) {
    // HH:MM ist lexikografisch vergleichbar.
    errors.end_time = 'Das Ende muss nach dem Beginn liegen.'
  }

  const capacity = integer(values.capacity)
  if (capacity === null || capacity < 1 || capacity > MAX_CAPACITY) {
    errors.capacity = `Bitte eine Zahl von 1 bis ${MAX_CAPACITY}.`
  } else if (context.booked !== undefined && capacity < context.booked) {
    errors.capacity = `Es sind schon ${context.booked} Personen angemeldet. Zuerst Anmeldungen stornieren.`
  }

  if (values.note.length > MAX_NOTE_LENGTH) {
    errors.note = `Höchstens ${MAX_NOTE_LENGTH} Zeichen (jetzt ${values.note.length}).`
  }

  const status = STATUSES.find((entry) => entry === values.status)
  if (!status) errors.status = 'Bitte einen Status wählen.'

  if (Object.keys(errors).length > 0 || capacity === null || !status) {
    return { ok: false, errors, values }
  }

  return {
    ok: true,
    value: {
      date: values.date,
      start_time: values.start_time,
      end_time: values.end_time,
      capacity,
      note: values.note || null,
      status,
    },
  }
}

export const SIGNUP_FIELDS = ['first_name', 'last_name', 'email', 'persons', 'comment']

const MAX_NAME_LENGTH = 80
const MAX_EMAIL_LENGTH = 254
export const MAX_COMMENT_LENGTH = 1000

/**
 * Bewusst grob: ein @, davor und danach etwas, hinten ein Punkt, keine
 * Leerzeichen. Ob es die Adresse gibt, zeigt erst Nairas Mail — eine strengere
 * Regel würde nur gültige, ungewöhnliche Adressen abweisen.
 */
export function isPlausibleEmail(value: string): boolean {
  return value.length <= MAX_EMAIL_LENGTH && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

export interface SignupFormContext {
  workshopId: string
  /** Mehr Personen erlaubt das Formular nicht; ob sie noch Platz haben, prüft die Datenbank. */
  maxPersons: number
}

export function parseSignupForm(body: FormBody, context: SignupFormContext): FormResult<SignupInput> {
  const values = echo(body, SIGNUP_FIELDS)
  const errors: FieldErrors = {}

  if (!values.first_name) errors.first_name = 'Bitte den Vornamen angeben.'
  else if (values.first_name.length > MAX_NAME_LENGTH) errors.first_name = 'Der Vorname ist zu lang.'

  if (!values.last_name) errors.last_name = 'Bitte den Nachnamen angeben.'
  else if (values.last_name.length > MAX_NAME_LENGTH) errors.last_name = 'Der Nachname ist zu lang.'

  if (!isPlausibleEmail(values.email)) errors.email = 'Bitte eine gültige E-Mail-Adresse angeben.'

  const persons = integer(values.persons)
  if (persons === null || persons < 1 || persons > context.maxPersons) {
    errors.persons =
      context.maxPersons === 1 ? 'Es ist nur noch 1 Platz frei.' : `Bitte 1 bis ${context.maxPersons} Personen.`
  }

  if (values.comment.length > MAX_COMMENT_LENGTH) {
    errors.comment = `Höchstens ${MAX_COMMENT_LENGTH} Zeichen (jetzt ${values.comment.length}).`
  }

  if (Object.keys(errors).length > 0 || persons === null) return { ok: false, errors, values }

  return {
    ok: true,
    value: {
      workshop_id: context.workshopId,
      first_name: values.first_name,
      last_name: values.last_name,
      email: values.email,
      persons,
      comment: values.comment || null,
    },
  }
}

export const MAX_SUBJECT_LENGTH = 200
export const MAX_BODY_LENGTH = 5000

/**
 * Die E-Mail-Vorlage. Der Betreff ist eine Zeile; der Text darf alles, nur
 * nicht leer sein. Die Zeilenumbrüche des Textfelds bleiben, wie sie sind.
 */
export function parseTemplateForm(body: FormBody): FormResult<{ subject: string; body: string }> {
  const subject = field(body, 'subject')
  // Nicht trimmen ausser am Rand: Leerzeilen im Text sind gewollt.
  const text = (typeof body.body === 'string' ? body.body : '').replace(/\r\n/g, '\n').trim()
  const values = { subject, body: text }
  const errors: FieldErrors = {}

  if (!subject) errors.subject = 'Bitte einen Betreff angeben.'
  else if (subject.length > MAX_SUBJECT_LENGTH) errors.subject = `Höchstens ${MAX_SUBJECT_LENGTH} Zeichen.`
  else if (/[\r\n]/.test(subject)) errors.subject = 'Der Betreff muss auf eine Zeile passen.'

  if (!text) errors.body = 'Bitte einen Text angeben.'
  else if (text.length > MAX_BODY_LENGTH) errors.body = `Höchstens ${MAX_BODY_LENGTH} Zeichen (jetzt ${text.length}).`

  if (Object.keys(errors).length > 0) return { ok: false, errors, values }
  return { ok: true, value: values }
}
