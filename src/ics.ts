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

/** Eine Person in ORGANIZER oder ATTENDEE. */
export interface IcsPerson {
  name: string
  email: string
}

/**
 * Für eine Einladung an eine angemeldete Person: Veranstalterin und Gast.
 * Ohne Einladung ist die Datei ein reiner Termin zum Importieren (PUBLISH).
 */
export interface IcsInvite {
  organizer: IcsPerson
  attendee: IcsPerson
}

/**
 * Parameterwert in Anführungszeichen (RFC 5545 §3.2). Darin darf kein `"`
 * stehen, und Zeilenumbrüche haben in einem Namen nichts verloren.
 */
function quoteParam(value: string): string {
  return `"${value.replace(/["\r\n]/g, '')}"`
}

function person(property: 'ORGANIZER' | 'ATTENDEE', who: IcsPerson, extra = ''): string {
  return `${property};CN=${quoteParam(who.name)}${extra}:mailto:${who.email}`
}

/**
 * Ein VEVENT pro Datei.
 *
 * Die UID bleibt pro Workshop gleich: importiert jemand die Datei nach einer
 * Änderung nochmals, aktualisiert der Kalender den Termin, statt ihn zu
 * verdoppeln — auch zwischen öffentlicher Datei und Einladung. SEQUENCE und
 * LAST-MODIFIED folgen `updated_at`, damit der Kalender die neuere Fassung
 * erkennt. Ein abgesagter Workshop wird als CANCELLED ausgeliefert — so
 * verschwindet er auch aus Kalendern, die ihn schon haben.
 *
 * Mit `invite` wird daraus eine Einladung (RFC 5546): METHOD:REQUEST mit
 * Naira als ORGANIZER und der angemeldeten Person als ATTENDEE. Erst dann
 * zeigen Gmail und Outlook den Termin als Karte mit „Ja / Vielleicht / Nein“;
 * die Antwort geht als Mail an die Veranstalterin. Für einen abgesagten
 * Workshop wird die Einladung zur Absage (METHOD:CANCEL).
 */
export function buildIcs(workshop: IcsWorkshop, origin: string, signupUrl: string, invite?: IcsInvite): string {
  const host = new URL(origin).hostname
  const cancelled = workshop.status === 'cancelled'
  const description = [
    `Tufting-Workshop bei ${BUSINESS.name} in ${BUSINESS.locality}.`,
    workshop.note,
    `Infos: ${signupUrl}`,
  ]
    .filter(Boolean)
    .join('\n')

  const method = invite ? (cancelled ? 'CANCEL' : 'REQUEST') : 'PUBLISH'

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:-//${BUSINESS.name}//Workshops//DE`,
    'CALSCALE:GREGORIAN',
    `METHOD:${method}`,
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
    ...(invite
      ? [
          person('ORGANIZER', invite.organizer),
          person('ATTENDEE', invite.attendee, ';CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE'),
        ]
      : []),
    `STATUS:${cancelled ? 'CANCELLED' : 'CONFIRMED'}`,
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

/** `einladung-2026-11-28.ics` — der Anhang in Nairas Mail. */
export function inviteFilename(date: string): string {
  return `einladung-${date}.ics`
}
