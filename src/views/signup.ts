import { html } from 'hono/html'
import { type FieldErrors, MAX_COMMENT_LENGTH } from '../forms.ts'
import { SIGNUP_ACTION } from '../turnstile.ts'
import { formatTimeRange, formatWorkshopDate, type Workshop } from '../workshops.ts'
import { input, select, textarea } from './fields.ts'
import type { Html } from './layout.ts'

/**
 * Anmeldeseite eines Termins mit dem eigenen Formular, dazu die Danke-Seite.
 *
 * Warum eine Unterseite und kein Popup: das Formular ist länger als ein Popup
 * hoch ist. Im Overlay scrollt man in einem Kasten im Kasten und sieht nie das
 * ganze Formular. Die Adresse ist teilbar und der Zurück-Weg ist der
 * Zurück-Knopf des Browsers — beides kann ein Overlay nicht.
 */

/** Adresse der Anmeldeseite eines Workshops. Auch das JSON-LD zeigt hierhin. */
export function signupPath(workshopId: string): string {
  return `/anmeldung/${workshopId}`
}

/** Zurück zu der Stelle, von der der Button hierher geführt hat. */
function back(href: string, label: string): Html {
  return html`<p class="back"><a href="${href}">${label}</a></p>`
}

/** Restplätze als Satz — auf einer eigenen Seite liest sich das besser als ein Label. */
function spots(workshop: Workshop): string | null {
  if (workshop.state !== 'low') return null

  return workshop.freeSpots === 1
    ? 'Für diesen Termin ist noch 1 Platz frei.'
    : `Für diesen Termin sind noch ${workshop.freeSpots} Plätze frei.`
}

/** Datum und Uhrzeit — als Lead der Anmelde- und der Danke-Seite. */
function when(workshop: Workshop): Html {
  const date = formatWorkshopDate(workshop.date)
  return html`Workshop am <time datetime="${workshop.date}">${date}</time>, ${formatTimeRange(workshop)}`
}

export interface SignupFormOptions {
  values?: Record<string, string>
  errors?: FieldErrors
  /** Öffentlicher Schlüssel des Turnstile-Widgets. */
  siteKey: string
}

/**
 * Das Anmeldeformular.
 *
 * Die Personenzahl ist eine Auswahl bis zu den freien Plätzen: wer zu dritt
 * kommen will, wenn nur zwei frei sind, sieht das schon hier. Ob es beim
 * Absenden noch reicht, entscheidet die Datenbank (db.ts, insertSignup).
 *
 * Ohne JavaScript bleibt das Formular ein normaler POST — nur Turnstile
 * braucht Script. Fehlt das Token, sagt die Seite das am Widget.
 */
export function renderSignupForm(workshop: Workshop, options: SignupFormOptions): Html {
  // Ausgebucht heisst kein Formular. Die Seite bleibt trotzdem erreichbar: wer
  // den Link gespeichert hat, soll den Grund lesen und nicht eine 404. Wer den
  // letzten Platz eben verpasst hat, liest, dass es gerade passiert ist.
  if (workshop.state === 'soldOut') {
    return html`<section class="section">
        <div class="wrap prose prose--narrow">
          ${back('/#termine', 'Alle Termine')}
          <h1 class="page-title">Anmeldung</h1>
          <p class="lead">${when(workshop)}</p>
          <p class="note">${options.errors?.seats ?? 'Dieser Termin ist ausgebucht.'}</p>
        </div>
      </section>`
  }

  const values = options.values ?? { persons: '1' }
  const errors = options.errors ?? {}
  const choices = Array.from({ length: workshop.freeSpots }, (_, index) => {
    const count = index + 1
    return { value: String(count), label: count === 1 ? '1 Person' : `${count} Personen` }
  })

  return html`<section class="section">
      <div class="wrap prose prose--narrow">
        ${back('/#termine', 'Alle Termine')}
        <h1 class="page-title">Anmeldung</h1>
        <p class="lead">${when(workshop)}</p>
        ${workshop.note ? html`<p>${workshop.note}</p>` : ''}
        ${spots(workshop) ? html`<p>${spots(workshop)}</p>` : ''}
        ${errors.seats ? html`<p class="flash">${errors.seats}</p>` : ''}

        <form class="form" method="post" action="${signupPath(workshop.id)}">
          <div class="form__row">
            ${input({ name: 'first_name', label: 'Vorname', value: values.first_name, error: errors.first_name, autocomplete: 'given-name', required: true })}
            ${input({ name: 'last_name', label: 'Nachname', value: values.last_name, error: errors.last_name, autocomplete: 'family-name', required: true })}
          </div>
          ${input({
            name: 'email',
            label: 'E-Mail',
            type: 'email',
            inputmode: 'email',
            autocomplete: 'email',
            hint: 'Naira schreibt dir persönlich mit allen Infos zum Workshop.',
            value: values.email,
            error: errors.email,
            required: true,
          })}
          ${select({
            name: 'persons',
            label: 'Anzahl Personen',
            value: values.persons,
            error: errors.persons,
            choices,
            required: true,
          })}
          ${textarea({
            name: 'comment',
            label: 'Bemerkung (optional)',
            value: values.comment,
            error: errors.comment,
            maxlength: MAX_COMMENT_LENGTH,
          })}

          <div class="field">
            ${errors.turnstile ? html`<p class="field__error" id="turnstile-fehler">${errors.turnstile}</p>` : ''}
            <div
              class="cf-turnstile"
              data-sitekey="${options.siteKey}"
              data-action="${SIGNUP_ACTION}"
              data-language="de"
            ></div>
          </div>

          <p><button class="button" type="submit">Verbindlich anmelden</button></p>
          <p class="field__hint">
            Wofür deine Angaben verwendet werden, steht in der
            <a href="/datenschutz">Datenschutzerklärung</a>.
          </p>
        </form>
      </div>
    </section>`
}

export function renderThanks(workshop: Workshop): Html {
  return html`<section class="section">
      <div class="wrap prose prose--narrow">
        <h1 class="page-title">Danke für deine Anmeldung</h1>
        <p class="lead">${when(workshop)}</p>
        <p>
          Deine Anmeldung ist eingegangen. Naira meldet sich per E-Mail bei dir, mit allen
          Infos zum Workshop.
        </p>
        <p><a href="/#termine">Zurück zu den Terminen</a></p>
      </div>
    </section>`
}

/** Die Anmeldung braucht die Termine — fehlen sie, ist ehrlicher als raten. */
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
