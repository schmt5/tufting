import { html } from 'hono/html'
import { formatWorkshopDate, type Workshop } from '../workshops.ts'
import type { Html } from './layout.ts'
import { signupPath } from './signup.ts'

function notice(workshop: Workshop): string | null {
  if (workshop.state === 'soldOut') return 'Ausgebucht'

  if (workshop.state === 'low') {
    return workshop.freeSpots === 1 ? 'Nur noch 1 Platz frei' : `Nur noch ${workshop.freeSpots} Plätze frei`
  }

  return null
}

/**
 * Ein Link, kein Button: das Formular steht auf einer eigenen Seite, weil es
 * für ein Popup zu lang ist (siehe views/signup.ts). Damit funktionieren auch
 * Zurück-Knopf, neuer Tab und das Teilen der Adresse.
 * Bei ausgebuchten Workshops gibt es keinen Link.
 *
 * aria-label statt nur "Anmelden", weil ein Screenreader die Links auch
 * ausserhalb ihrer Card vorliest und sie sonst nicht unterscheidbar wären.
 * Benannt wird das Datum, nicht der Formularname — nur das Datum steht auch
 * sichtbar auf der Card. Der Label beginnt mit dem sichtbaren Text, sonst
 * bräche Spracheingabe ("Klick Anmelden").
 */
function action(workshop: Workshop): Html | string {
  if (workshop.state === 'soldOut') return ''

  return html`<a
      class="button card__cta"
      href="${signupPath(workshop.id)}"
      aria-label="Anmelden: Workshop vom ${formatWorkshopDate(workshop.date)}"
    >
      Anmelden
    </a>`
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
  // "Workshop am" steht im h3, nicht als eigener Absatz davor: die Überschrift
  // liest sich damit als ganzer Satz — "Workshop am 22.08.2026" — statt als
  // nacktes Datum, und die Vorzeile bleibt trotzdem eine eigene Zeile.
  return html`<article class="card" data-state="${workshop.state}">
      <h3 class="card__title">
        <span class="card__kicker">Workshop am</span>
        <time datetime="${workshop.date}">${formatWorkshopDate(workshop.date)}</time>
      </h3>
      ${text ? html`<p class="card__notice">${text}</p>` : ''}
      ${action(workshop)}
    </article>`
}
