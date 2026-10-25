/**
 * E-Mail-Vorlage für Nairas Antwort auf eine Anmeldung. Die Seite verschickt
 * nichts selbst (plan.md §8): sie füllt die Vorlage aus und öffnet Nairas
 * Mail-App per `mailto:`. Naira liest, ändert und schickt selbst ab.
 *
 * Rein und ohne Netzwerk testbar.
 */

import { BUSINESS, hasAddress } from './site.ts'

export interface Template {
  subject: string
  body: string
}

/** Schlüssel der einen Vorlage in der Tabelle `templates`. */
export const CONFIRMATION = 'confirmation'

/**
 * Erster Entwurf, bis Naira ihre eigene Fassung speichert. Steht im Code
 * statt in der Datenbank: so gibt es ihn auch ohne Migration, und „Standard
 * wiederherstellen“ heisst einfach, die gespeicherte Fassung zu löschen.
 */
export const DEFAULT_TEMPLATE: Template = {
  subject: 'Dein Tufting-Workshop am {datum}',
  body: `Hallo {vorname}

Danke für deine Anmeldung zum Tufting-Workshop am {datum}, {zeit}. Ich freue mich auf dich!

Angemeldet: {personen}
Ort: {adresse}

Den Termin kannst du hier direkt in deinen Kalender übernehmen:
{kalender}

Bei Fragen antworte einfach auf diese E-Mail.

Liebe Grüsse
Naira`,
}

/** Die Platzhalter mit Erklärung — für die Hilfe neben dem Formular im Admin. */
export const PLACEHOLDERS = [
  { name: 'vorname', label: 'Vorname der angemeldeten Person' },
  { name: 'nachname', label: 'Nachname' },
  { name: 'datum', label: 'Datum des Workshops, z.B. 28.11.2026' },
  { name: 'zeit', label: 'Uhrzeit, z.B. 10:00–17:00' },
  { name: 'personen', label: 'z.B. „2 Personen“' },
  { name: 'adresse', label: 'Adresse des Studios' },
  { name: 'kalender', label: 'Link auf die Kalenderdatei des Termins' },
] as const

export type PlaceholderValues = Record<(typeof PLACEHOLDERS)[number]['name'], string>

export function studioAddress(): string {
  return hasAddress()
    ? `${BUSINESS.street}, ${BUSINESS.postalCode} ${BUSINESS.locality}`
    : BUSINESS.locality
}

/**
 * Ersetzt `{name}` durch den Wert. Unbekannte Platzhalter bleiben sichtbar
 * stehen — ein Tippfehler wie `{vornahme}` soll in der Mail auffallen, statt
 * still zu verschwinden.
 */
export function fillTemplate(text: string, values: PlaceholderValues): string {
  return text.replace(/\{([a-z]+)\}/g, (match, name: string) =>
    Object.hasOwn(values, name) ? values[name as keyof PlaceholderValues] : match,
  )
}

/** Platzhalter in einem Text, die es nicht gibt — für eine Warnung im Admin. */
export function unknownPlaceholders(text: string): string[] {
  const known = new Set<string>(PLACEHOLDERS.map((placeholder) => placeholder.name))
  return [...new Set([...text.matchAll(/\{([a-z]+)\}/g)].map((match) => match[1] ?? ''))].filter(
    (name) => !known.has(name),
  )
}

/**
 * `mailto:` nach RFC 6068: Empfänger, Betreff und Text prozentkodiert,
 * Zeilenumbrüche als CRLF (`%0D%0A`) — mit blossem `%0A` setzen manche
 * Mail-Apps alles auf eine Zeile.
 */
export function mailtoLink(to: string, subject: string, body: string): string {
  const crlf = (text: string) => text.replace(/\r?\n/g, '\r\n')
  const params = [`subject=${encodeURIComponent(crlf(subject))}`]
  // Ein leerer Text bleibt weg — sonst setzen manche Apps einen leeren Absatz.
  if (body) params.push(`body=${encodeURIComponent(crlf(body))}`)
  return `mailto:${encodeURIComponent(to)}?${params.join('&')}`
}

/** Adresse der Kalenderdatei eines Workshops. Route und Vorlage lesen beide von hier. */
export function calendarPath(workshopId: string): string {
  return `/termin/${workshopId}.ics`
}

export interface SignupMail {
  subject: string
  body: string
  mailto: string
}

/** Die ausgefüllte Vorlage für eine Anmeldung, samt fertigem mailto-Link. */
export function signupMail(
  template: Template,
  workshop: { id: string; date: string; start_time: string; end_time: string },
  signup: { first_name: string; last_name: string; email: string; persons: number },
  origin: string,
): SignupMail {
  const [year, month, day] = workshop.date.split('-')
  const values: PlaceholderValues = {
    vorname: signup.first_name,
    nachname: signup.last_name,
    datum: `${day}.${month}.${year}`,
    zeit: `${workshop.start_time}–${workshop.end_time}`,
    personen: signup.persons === 1 ? '1 Person' : `${signup.persons} Personen`,
    adresse: studioAddress(),
    kalender: `${origin}${calendarPath(workshop.id)}`,
  }

  const subject = fillTemplate(template.subject, values)
  const body = fillTemplate(template.body, values)
  return { subject, body, mailto: mailtoLink(signup.email, subject, body) }
}
