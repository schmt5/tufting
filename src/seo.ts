/**
 * Strukturierte Daten (schema.org als JSON-LD).
 *
 * Zweck: die Termine sind datiert, haben einen Preis und einen Ort — genau das
 * liest Google als Event-Rich-Result aus. Ohne Markup bleibt davon nichts
 * übrig, weil Datum und Zustand auf der Seite nur als Text stehen.
 *
 * Rein und ohne Netzwerk testbar: `buildGraph` bekommt fertige Workshops und
 * eine Herkunft, sonst nichts.
 */

import { raw } from 'hono/html'
import { BUSINESS, hasAddress, SITE_ORIGIN, WORKSHOP } from './site.ts'
import type { Workshop } from './workshops.ts'
import type { Html } from './views/layout.ts'

/** Öffentliche Formular-URL bei Tally — dorthin führt das `Offer`. */
const TALLY_FORM_URL = 'https://tally.so/r/'

/**
 * Herkunft für absolute URLs. Steht `SITE_ORIGIN`, gewinnt sie; sonst die
 * Herkunft des Requests, damit die Seite auch ohne Custom Domain korrekt
 * verlinkt ist.
 */
export function originOf(requestUrl: string): string {
  return SITE_ORIGIN ?? new URL(requestUrl).origin
}

/**
 * JSON-LD als `<script>`-Block.
 *
 * `hono/html` escapt Interpolationen für HTML und würde das JSON zerstören,
 * deshalb `raw()`. Damit liegt das Escaping hier: `<` wird zu `<`, sonst
 * beendet ein `</script>` in einem Wert aus der Tally-API das Script vorzeitig.
 * Das ist die einzige Zeile, die diesen Block sicher macht — nicht entfernen.
 */
export function jsonLd(data: unknown): Html {
  const json = JSON.stringify(data).replace(/</g, '\\u003c')
  return raw(`<script type="application/ld+json">${json}</script>`)
}

/**
 * Anschrift. Solange Strasse und PLZ fehlen, bleibt es beim Ort — lieber
 * unvollständig als erfunden.
 */
function postalAddress() {
  return {
    '@type': 'PostalAddress',
    ...(hasAddress() ? { streetAddress: BUSINESS.street, postalCode: BUSINESS.postalCode } : {}),
    addressLocality: BUSINESS.locality,
    addressCountry: BUSINESS.country,
  }
}

/**
 * Das Studio. Bekommt eine `@id`, damit die Events per Referenz darauf zeigen
 * statt die Adresse zu wiederholen.
 */
function localBusiness(origin: string) {
  return {
    '@type': 'LocalBusiness',
    '@id': `${origin}/#business`,
    name: BUSINESS.name,
    url: `${origin}/`,
    image: `${origin}/og-image.png`,
    description:
      'Tufting-Workshops in Bern: an einem Tag den eigenen Teppich tuften, in kleiner Runde und ohne Vorkenntnisse.',
    address: postalAddress(),
    areaServed: BUSINESS.locality,
    priceRange: `${WORKSHOP.currency} ${WORKSHOP.price}`,
    ...(BUSINESS.email ? { email: BUSINESS.email } : {}),
    ...(BUSINESS.profiles.length > 0 ? { sameAs: BUSINESS.profiles } : {}),
  }
}

function offer(workshop: Workshop) {
  return {
    '@type': 'Offer',
    price: WORKSHOP.price,
    priceCurrency: WORKSHOP.currency,
    url: `${TALLY_FORM_URL}${workshop.id}`,
    availability:
      workshop.state === 'soldOut' ? 'https://schema.org/SoldOut' : 'https://schema.org/InStock',
    // Ohne Enddatum wertet Google ein Angebot als unbefristet. Es gilt bis zum
    // Workshop selbst.
    validThrough: workshop.date,
  }
}

/**
 * Ein Event pro Workshop.
 *
 * `startDate` bleibt datumsgenau: die Uhrzeit steht nirgends in den Daten. Ein
 * Hidden Field `time=10:00` in Tally wäre der Weg dorthin — `parseHiddenFields`
 * liest beliebige Keys bereits.
 */
function event(workshop: Workshop, origin: string) {
  return {
    '@type': 'Event',
    '@id': `${origin}/#workshop-${workshop.id}`,
    name: `Tufting-Workshop in ${BUSINESS.locality}`,
    description:
      'Tagesworkshop: Teppich, Wandbild oder Kissen selbst tuften. Material inklusive, keine Vorkenntnisse nötig.',
    startDate: workshop.date,
    duration: WORKSHOP.durationIso,
    eventStatus: 'https://schema.org/EventScheduled',
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    image: `${origin}/og-image.png`,
    maximumAttendeeCapacity: WORKSHOP.maxAttendees,
    ...(workshop.freeSpots !== null ? { remainingAttendeeCapacity: workshop.freeSpots } : {}),
    // Verweis statt Wiederholung: die Adresse steht einmal im LocalBusiness.
    location: { '@id': `${origin}/#business` },
    organizer: { '@id': `${origin}/#business` },
    offers: offer(workshop),
  }
}

/**
 * Der Graph der Startseite: das Studio plus ein Event pro anstehendem Workshop.
 *
 * Erwartet bereits gefilterte Workshops — die Prüfung der Formular-ID passiert
 * einmal in `index.ts`, damit `Offer.url` und der Anmelde-Button nie
 * auseinanderlaufen können.
 */
export function buildGraph(workshops: Workshop[], origin: string): object {
  return {
    '@context': 'https://schema.org',
    '@graph': [localBusiness(origin), ...workshops.map((workshop) => event(workshop, origin))],
  }
}
