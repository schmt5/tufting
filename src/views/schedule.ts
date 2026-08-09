import { html } from 'hono/html'
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
 * ID des Tally-Kontaktformulars. Anders als die Workshops steht sie fest und
 * wird nicht über die API gesucht — es gibt genau dieses eine Formular.
 *
 * Solange sie leer ist, erscheint statt des Buttons ein Hinweis. Ein Button,
 * der nichts öffnet, wäre schlimmer als gar keiner.
 */
const CONTACT_FORM_ID = ''

/**
 * Kontaktformular als Tally-Popup, gleicher Weg wie die Anmelde-Buttons der
 * Cards: /tally.js bindet sich an data-form-id, geladen wird erst beim Klick.
 */
function contact(): Html {
  if (!CONTACT_FORM_ID) {
    return html`<p class="note contact__pending">Das Kontaktformular folgt.</p>`
  }

  return html`<button
      type="button"
      class="button contact__open"
      data-form-id="${CONTACT_FORM_ID}"
      aria-haspopup="dialog"
    >
      ${CONTACT_LABEL}
    </button>`
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
