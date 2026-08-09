import { html } from 'hono/html'
import { CONTACT_FORM_ID, CONTACT_PATH } from '../site.ts'
import type { Html } from './layout.ts'

/**
 * Section "Wähle deinen Workshoptag": das Card-Grid der Termine plus der
 * Kontaktweg für den Fall, dass kein Datum passt.
 */

const TITLE = 'Wähle deinen Workshoptag'

const CONTACT_TEXT =
  'Du findest keinen passenden Termin? Schreibe mir einfach, wir schauen zusammen nach einer Alternative.'

const CONTACT_LABEL = 'Schreibe mir'

/**
 * Kontaktformular auf einer eigenen Seite, gleicher Weg wie die Anmeldung:
 * /kontakt rendert dasselbe Embed (views/signup.ts).
 *
 * Solange die Formular-ID fehlt, steht hier ein Hinweis statt des Links. Ein
 * Link, der ins Leere führt, wäre schlimmer als keiner.
 */
function contact(): Html {
  if (!CONTACT_FORM_ID) {
    return html`<p class="note contact__pending">Das Kontaktformular folgt.</p>`
  }

  return html`<a class="button contact__open" href="${CONTACT_PATH}">${CONTACT_LABEL}</a>`
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
