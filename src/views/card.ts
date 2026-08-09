import { html } from 'hono/html'
import type { Workshop } from '../workshops.ts'
import type { Html } from './layout.ts'

/** ISO → DD.MM.YYYY, aus den Teilen zusammengesetzt statt über new Date(). */
function formatDate(iso: string): string {
  const [year, month, day] = iso.split('-')
  return `${day}.${month}.${year}`
}

function notice(workshop: Workshop): string | null {
  if (workshop.state === 'soldOut') return 'Ausgebucht'

  if (workshop.state === 'low') {
    return workshop.freeSpots === 1 ? 'Nur noch 1 Platz frei' : `Nur noch ${workshop.freeSpots} Plätze frei`
  }

  return null
}

/**
 * Das Formular öffnet als Popup: embed.js bindet sich an data-tally-open.
 * Bei ausgebuchten Workshops gibt es keinen Button.
 *
 * aria-label statt nur "Anmelden", weil ein Screenreader die Buttons auch
 * ausserhalb ihrer Card vorliest und sie sonst nicht unterscheidbar wären.
 * Benannt wird das Datum, nicht der Formularname — nur das Datum steht auch
 * sichtbar auf der Card. Der Label beginnt mit dem sichtbaren Text, sonst
 * bräche Spracheingabe ("Klick Anmelden").
 */
function action(workshop: Workshop): Html | string {
  if (workshop.state === 'soldOut') return ''

  return html`<button
      type="button"
      class="button card__cta"
      data-tally-open="${workshop.id}"
      data-tally-width="420"
      data-tally-hide-title="1"
      aria-haspopup="dialog"
      aria-label="Anmelden: Workshop vom ${formatDate(workshop.date)}"
    >
      Anmelden
    </button>`
}

/**
 * Eine Card ist ein Termin innerhalb der Section "Wähle deinen Workshoptag" —
 * deshalb h3: h2 gehört dem Sectiontitel, und zwei h2 nebeneinander lesen sich
 * im Screenreader als zwei gleichrangige Bereiche statt als Liste von Terminen.
 *
 * Die ID ist bereits in loadWorkshops() geprüft.
 */
export function renderCard(workshop: Workshop): Html {
  const text = notice(workshop)

  // Der Formularname aus Tally ist ein interner Bezeichner und erscheint nicht.
  // Das Datum ist der Titel der Card.
  return html`<article class="card" data-state="${workshop.state}">
      <h3 class="card__title">
        <time datetime="${workshop.date}">${formatDate(workshop.date)}</time>
      </h3>
      ${text ? html`<p class="card__notice">${text}</p>` : ''}
      ${action(workshop)}
    </article>`
}
