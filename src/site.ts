/**
 * Stammdaten der Seite. Einziger Ort für Herkunft, Adresse und Eckwerte des
 * Workshops — Canonical, Open Graph, Sitemap, JSON-LD und der sichtbare Text
 * lesen alle von hier, damit nichts auseinanderläuft.
 *
 * Was noch nicht feststeht, ist `null` und nicht geraten: fehlende Felder
 * lassen den betroffenen Block in den strukturierten Daten weg. Eine erfundene
 * Adresse in einem LocalBusiness ist schlimmer als gar keine.
 */

/**
 * Herkunft der Seite ohne Schrägstrich am Ende, z.B. `https://naira-tufting.ch`.
 *
 * Solange sie `null` ist, wird die Herkunft des Requests verwendet — die Seite
 * ist damit auf jeder Domain korrekt verlinkt, aber `*.workers.dev` und eine
 * spätere Custom Domain gelten als zwei Seiten. Sobald die Domain steht, gehört
 * sie hierher; ab dann zeigt jedes Canonical dorthin.
 */
export const SITE_ORIGIN: string | null = null

export interface Business {
  name: string
  /** Verantwortliche Person — Impressum und JSON-LD `founder`. */
  person: string
  street: string | null
  postalCode: string | null
  locality: string
  /** ISO 3166-1 alpha-2. */
  country: string
  email: string | null
  /** Profile, die dieselbe Person bezeichnen — schema.org `sameAs`. */
  profiles: string[]
}

export const BUSINESS: Business = {
  name: 'Naira Tufting',
  person: 'Naira', // TODO: vollständiger Name fürs Impressum
  // TODO: Hausnummer ergänzen. Ohne sie findet eine Kartensuche nur den Platz,
  // nicht das Studio — für den Rest der strukturierten Daten reicht es.
  street: 'Eigerplatz',
  postalCode: '3007',
  locality: 'Bern',
  country: 'CH',
  email: 'tuftingstudio.bern@outlook.com',
  profiles: [], // TODO: Instagram o.ä.
}

/** Die Adresse taugt nur für strukturierte Daten, wenn sie vollständig ist. */
export function hasAddress(business: Business = BUSINESS): boolean {
  return business.street !== null && business.postalCode !== null
}

/**
 * Eckwerte eines Workshops. Stehen hier, weil sie an drei Stellen gebraucht
 * werden: im Fliesstext der Intro, im Preisblock und im `Offer` des JSON-LD.
 */
export const WORKSHOP = {
  /** Preis für eine Person allein — der Ausgangspreis, den Google zeigt. */
  price: 290,
  currency: 'CHF',
  maxAttendees: 4,
  /** Ungefähre Dauer in Stunden, für `Event.duration` als ISO-8601. */
  durationIso: 'PT7H',
}
