import { html } from 'hono/html'
import { formatWorkshopDate, type Workshop } from '../workshops.ts'
import type { Html } from './layout.ts'

/**
 * Eigene Seite pro Formular: Anmeldung zu einem Termin und das Kontaktformular.
 *
 * Warum eine Unterseite und kein Popup: die Formulare sind länger als ein
 * Popup hoch ist. Im Overlay scrollt man in einem Kasten im Kasten und sieht
 * nie das ganze Formular. Auf einer eigenen Seite wächst das iframe per
 * `dynamicHeight` auf seine volle Höhe, und gescrollt wird die Seite.
 *
 * Die Adresse ist teilbar und der Zurück-Weg ist der Zurück-Knopf des Browsers
 * — beides kann ein Overlay nicht.
 */

/** Parameter aus dem Embed-Code von Tally. `dynamicHeight` ist der Grund für die Seite. */
const EMBED_PARAMS = 'alignLeft=1&hideTitle=1&transparentBackground=1&dynamicHeight=1'

/**
 * Anfangshöhe aus dem Embed-Code. Sie gilt nur, bis embed.js die erste
 * Höhenmeldung des Formulars bekommt — ohne Script bleibt sie stehen, und das
 * Formular ist dann in sich scrollbar statt abgeschnitten.
 */
const EMBED_HEIGHT = 616

/** Adresse der Anmeldeseite eines Workshops. Auch das JSON-LD zeigt hierhin. */
export function signupPath(workshopId: string): string {
  return `/anmeldung/${workshopId}`
}

/**
 * `src` direkt, ohne `data-tally-src`: so lädt das Formular auch ohne
 * JavaScript, und /tally.js hängt den Höhen-Resizer sofort an statt erst beim
 * Hereinscrollen. Beide Attribute zusammen wären der eine Fall, den embed.js
 * nicht behandelt — dann bliebe die Höhe für immer stehen (nachgemessen).
 *
 * Ohne JavaScript bleibt es bei EMBED_HEIGHT; das Formular ist dann in sich
 * scrollbar statt abgeschnitten.
 */
function embed(formId: string, title: string): Html {
  const src = `https://tally.so/embed/${formId}?${EMBED_PARAMS}`

  return html`<iframe
      class="embed"
      src="${src}"
      width="100%"
      height="${EMBED_HEIGHT}"
      title="${title}"
    ></iframe>`
}

/** Zurück zu der Stelle, von der der Button hierher geführt hat. */
function back(href: string, label: string): Html {
  return html`<p class="back"><a href="${href}">${label}</a></p>`
}

interface FormPageOptions {
  heading: string
  lead: Html | string
  /** Ein Satz zwischen Lead und Formular, z.B. die Restplätze. */
  note?: Html | string | null
  /** Fehlt sie, steht statt des Formulars der Hinweistext. */
  formId: string | null
  formTitle: string
  fallback?: string
  backHref: string
  backLabel: string
}

function formPage(options: FormPageOptions): Html {
  return html`<section class="section">
      <div class="wrap prose prose--narrow">
        ${back(options.backHref, options.backLabel)}
        <h1 class="page-title">${options.heading}</h1>
        <p class="lead">${options.lead}</p>
        ${options.note ? html`<p>${options.note}</p>` : ''}
      </div>

      <div class="wrap embed-wrap">
        ${options.formId
          ? embed(options.formId, options.formTitle)
          : html`<p class="note">${options.fallback}</p>`}
      </div>
    </section>`
}

/** Restplätze als Satz — auf einer eigenen Seite liest sich das besser als ein Label. */
function spots(workshop: Workshop): string | null {
  if (workshop.state !== 'low' || workshop.freeSpots === null) return null

  return workshop.freeSpots === 1
    ? 'Für diesen Termin ist noch 1 Platz frei.'
    : `Für diesen Termin sind noch ${workshop.freeSpots} Plätze frei.`
}

export function renderSignup(workshop: Workshop): Html {
  const date = formatWorkshopDate(workshop.date)

  return formPage({
    heading: 'Anmeldung',
    lead: html`Workshop am <time datetime="${workshop.date}">${date}</time>`,
    note: spots(workshop),
    // Ausgebucht heisst kein Formular. Die Seite bleibt trotzdem erreichbar:
    // wer den Link gespeichert hat, soll den Grund lesen und nicht eine 404.
    formId: workshop.state === 'soldOut' ? null : workshop.id,
    formTitle: `Anmeldeformular: Workshop vom ${date}`,
    fallback: 'Dieser Termin ist ausgebucht.',
    backHref: '/#termine',
    backLabel: 'Alle Termine',
  })
}

export function renderContactPage(formId: string): Html {
  return formPage({
    heading: 'Schreibe mir',
    lead: 'Kein Termin passt? Schreib mir, wir schauen zusammen nach einer Alternative.',
    formId,
    formTitle: 'Kontaktformular',
    backHref: '/#termine',
    backLabel: 'Alle Termine',
  })
}

/** Die Anmeldung braucht die Daten aus Tally — fehlen sie, ist ehrlicher als raten. */
export function renderSignupUnavailable(): Html {
  return html`<section class="section">
      <div class="wrap prose prose--narrow">
        ${back('/#termine', 'Alle Termine')}
        <h1 class="page-title">Anmeldung</h1>
        <p>
          Die Anmeldung kann momentan nicht geladen werden. Bitte versuche es später
          nochmals.
        </p>
      </div>
    </section>`
}
