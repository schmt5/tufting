import { html } from 'hono/html'
import { BUSINESS } from '../site.ts'
import { mailtoLink } from '../template.ts'
import type { Html } from './layout.ts'

/**
 * Section "Wähle deinen Workshoptag": das Card-Grid der Termine plus der
 * Kontaktweg für den Fall, dass kein Datum passt.
 */

const TITLE = 'Wähle deinen Workshoptag'

const CONTACT_TEXT =
  'Du findest keinen passenden Termin? Schreibe mir einfach, wir schauen zusammen nach einer Alternative.'

const CONTACT_LABEL = 'Schreibe mir'

/** Betreff, mit dem die Mail bei Naira ankommt — so sieht sie gleich, worum es geht. */
const CONTACT_SUBJECT = 'Anfrage Tufting-Workshop'

/**
 * Ein E-Mail-Link statt eines Formulars (plan.md §13): Naira antwortet sowieso
 * per Mail, und es braucht weder Tabelle noch Formular noch einen Anbieter
 * dazwischen. Ohne Adresse in site.ts gibt es keinen Link — einer ins Leere
 * wäre schlimmer als keiner.
 */
function contact(): Html | string {
  if (!BUSINESS.email) return ''

  return html`<a class="button contact__open" href="${mailtoLink(BUSINESS.email, CONTACT_SUBJECT, '')}">${CONTACT_LABEL}</a>`
}

export function renderSchedule(cards: Html[], message: string | null): Html {
  return html`<section class="section" id="termine">
      <div class="wrap">
        <h2 class="section__title">${TITLE}</h2>

        ${message ? html`<p class="note">${message}</p>` : html`<div class="grid">${cards}</div>`}

        <div class="contact-block">
          <p>${CONTACT_TEXT}</p>
          ${contact()}
        </div>
      </div>
    </section>`
}
