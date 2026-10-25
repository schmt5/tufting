/**
 * Workshop-Semantik für die öffentliche Seite: Termine aus der D1 in der Form,
 * die Cards, Anmeldeseite und JSON-LD brauchen, dazu Datum und Zeitzone.
 *
 * Alles ausser loadWorkshops() ist rein und ohne Netzwerk testbar.
 */

import { listPublishedWorkshops, type WorkshopWithSeats } from './db.ts'

/** Ab so vielen freien Plätzen erscheint kein Hinweis mehr. */
export const LOW_SPOTS_THRESHOLD = 3

export type WorkshopState = 'open' | 'low' | 'soldOut'

export interface Workshop {
  id: string
  /** ISO YYYY-MM-DD */
  date: string
  /** HH:MM, Europe/Zurich */
  startTime: string
  endTime: string
  capacity: number
  freeSpots: number
  state: WorkshopState
  /** Optionaler Satz auf der Card, z.B. „Mit Apéro zum Abschluss“. */
  note: string | null
}

export interface WorkshopsResult {
  workshops: Workshop[]
  /** true, wenn die D1 nicht geantwortet hat — dann ist die Liste leer, nicht „keine Termine“. */
  failed: boolean
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

export function deriveState(freeSpots: number): WorkshopState {
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

/** Ein Termin aus der D1 in der Form, die die öffentlichen Views kennen. */
export function fromDatabase(row: WorkshopWithSeats): Workshop {
  return {
    id: row.id,
    date: row.date,
    startTime: row.start_time,
    endTime: row.end_time,
    capacity: row.capacity,
    freeSpots: row.free,
    state: deriveState(row.free),
    note: row.note,
  }
}

/**
 * Veröffentlichte Termine ab heute, nach Datum und Startzeit — die Reihenfolge
 * macht schon die Abfrage. Fällt die D1 aus, bleibt die Liste leer und
 * `failed` gesetzt; die Startseite steht trotzdem.
 */
export async function loadWorkshops(db: D1Database): Promise<WorkshopsResult> {
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

/** `10:00–17:00` */
export function formatTimeRange(workshop: Pick<Workshop, 'startTime' | 'endTime'>): string {
  return `${workshop.startTime}–${workshop.endTime}`
}
