/**
 * Kalenderdatei eines Workshops (iCalendar, RFC 5545). Naira verlinkt sie in
 * ihrer E-Mail; ein Tipp darauf legt den Termin im Kalender an.
 *
 * Die Datei enthält nur, was auch öffentlich auf der Seite steht — keine
 * Personendaten. Deshalb darf sie ohne Login abrufbar sein.
 *
 * Rein und ohne Netzwerk testbar.
 */

import type { WorkshopRow } from './db.ts'
import { BUSINESS, hasAddress } from './site.ts'
import { zurichDateTime } from './workshops.ts'

/** RFC 5545 §3.1: Zeilen höchstens 75 Byte, ohne den Zeilenumbruch. */
const MAX_LINE_BYTES = 75

const encoder = new TextEncoder()

/** `,` `;` `\` und Zeilenumbrüche in Textwerten maskieren (RFC 5545 §3.3.11). */
export function escapeText(value: string): string {
  return value
    .replaceAll('\\', '\\\\')
    .replaceAll(';', '\\;')
    .replaceAll(',', '\\,')
    .replace(/\r\n|\r|\n/g, '\\n')
}

/**
 * Lange Zeilen falten: nach 75 Byte ein CRLF und ein Leerzeichen. Gezählt wird
 * in Byte, nicht in Zeichen — und nie mitten in einem Umlaut, sonst zeigt der
 * Kalender kaputte Zeichen.
 */
export function foldLine(line: string): string {
  const parts: string[] = []
  let current = ''
  let bytes = 0
  // Fortsetzungszeilen beginnen mit einem Leerzeichen, das mitzählt.
  let limit = MAX_LINE_BYTES

  for (const char of line) {
    const size = encoder.encode(char).length
    if (bytes + size > limit) {
      parts.push(current)
      current = ''
      bytes = 0
      limit = MAX_LINE_BYTES - 1
    }
    current += char
    bytes += size
  }
  parts.push(current)

  return parts.join('\r\n ')
}

/** ISO mit Abstand → `20261128T090000Z`. UTC statt TZID: jede Kalender-App liest das gleich. */
export function icsUtc(isoWithOffset: string): string {
  return new Date(isoWithOffset).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}

function icsTimestamp(seconds: number): string {
  return icsUtc(new Date(seconds * 1000).toISOString())
}

function location(): string {
  const parts = hasAddress()
    ? [BUSINESS.name, BUSINESS.street, `${BUSINESS.postalCode} ${BUSINESS.locality}`]
    : [BUSINESS.name, BUSINESS.locality]
  return parts.join(', ')
}

export type IcsWorkshop = Pick<WorkshopRow, 'id' | 'date' | 'start_time' | 'end_time' | 'note' | 'status' | 'updated_at'>

/**
 * Ein VEVENT pro Datei.
 *
 * Die UID bleibt pro Workshop gleich: importiert jemand die Datei nach einer
 * Änderung nochmals, aktualisiert der Kalender den Termin, statt ihn zu
 * verdoppeln. SEQUENCE und LAST-MODIFIED folgen `updated_at`, damit der
 * Kalender die neuere Fassung erkennt. Ein abgesagter Workshop wird als
 * CANCELLED ausgeliefert — so verschwindet er auch aus Kalendern, die ihn
 * schon haben.
 */
export function buildIcs(workshop: IcsWorkshop, origin: string, signupUrl: string): string {
  const host = new URL(origin).hostname
  const description = [
    `Tufting-Workshop bei ${BUSINESS.name} in ${BUSINESS.locality}.`,
    workshop.note,
    `Infos: ${signupUrl}`,
  ]
    .filter(Boolean)
    .join('\n')

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:-//${BUSINESS.name}//Workshops//DE`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:workshop-${workshop.id}@${host}`,
    `DTSTAMP:${icsTimestamp(workshop.updated_at)}`,
    `LAST-MODIFIED:${icsTimestamp(workshop.updated_at)}`,
    `SEQUENCE:${workshop.updated_at}`,
    `DTSTART:${icsUtc(zurichDateTime(workshop.date, workshop.start_time))}`,
    `DTEND:${icsUtc(zurichDateTime(workshop.date, workshop.end_time))}`,
    `SUMMARY:${escapeText(`Tufting-Workshop bei ${BUSINESS.name}`)}`,
    `LOCATION:${escapeText(location())}`,
    `DESCRIPTION:${escapeText(description)}`,
    `URL:${signupUrl}`,
    `STATUS:${workshop.status === 'cancelled' ? 'CANCELLED' : 'CONFIRMED'}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ]

  // CRLF ist Pflicht, auch nach der letzten Zeile.
  return `${lines.map(foldLine).join('\r\n')}\r\n`
}

/** `workshop-2026-11-28.ics` — ein Name, unter dem die Datei auf dem Gerät Sinn ergibt. */
export function icsFilename(date: string): string {
  return `workshop-${date}.ics`
}
