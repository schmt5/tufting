import { html } from 'hono/html'
import type { SignupRow } from '../../db.ts'
import type { SignupMail } from '../../template.ts'
import type { Html } from '../layout.ts'
import { timestamp } from './format.ts'

/**
 * Anmeldungen als Tabelle, für den Eingang und für einen Termin. Pro Zeile
 * die Hauptaktionen sichtbar (Einladung, schreiben, erledigt), die seltenen im
 * Menü „⋮“ ganz links.
 */

/** Was Naira braucht, um einer Person zu schreiben. */
export interface SignupMailInfo {
  mail: SignupMail
  /** Dateiname der Einladung, z.B. `einladung-2026-11-28.ics`. */
  inviteFilename: string
  /** Bei einem abgesagten Termin ist die Einladung eine Absage. */
  workshopCancelled: boolean
}

/** Pro Anmeldung (ID) die ausgefüllte Vorlage. */
export type MailContext = Map<string, SignupMailInfo>

/** Von wo aus eine Aktion kommt — dorthin führt der Redirect zurück. */
export type SignupView = 'termin' | 'eingang'

/** Symbole als Inline-SVG, damit sie überall gleich aussehen. Der Text steht daneben oder versteckt dabei. */
const ICON_MORE = html`<svg class="icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
    <circle cx="8" cy="3" r="1.5" /><circle cx="8" cy="8" r="1.5" /><circle cx="8" cy="13" r="1.5" />
  </svg>`

const ICON_DOWNLOAD = html`<svg class="icon icon--stroke" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
    <path d="M8 2v8M4.5 6.5 8 10l3.5-3.5M2.5 11.5v1.5h11v-1.5" />
  </svg>`

function signupPath(id: string, action: string): string {
  return `/admin/anmeldungen/${id}/${action}`
}

/** Ein Button in einem eigenen Formular — HTML kann nur so per POST auslösen. */
function action(signup: SignupRow, name: string, label: string, view: SignupView, variant: string): Html {
  return html`<form method="post" action="${signupPath(signup.id, name)}">
      ${view === 'eingang' ? html`<input type="hidden" name="ansicht" value="eingang" />` : ''}
      <button class="${variant}" type="submit">${label}</button>
    </form>`
}

/**
 * Löschen ist endgültig, deshalb ein Schritt mehr: der Button steckt in einem
 * `<details>`. Funktioniert ohne JavaScript, anders als ein confirm()-Dialog.
 */
function deleteAction(signup: SignupRow, view: SignupView): Html {
  return html`<details class="confirm">
      <summary class="menu__item menu__item--danger">Löschen …</summary>
      <div class="confirm__body">
        <p>Die Anmeldung wird endgültig gelöscht. Stornieren behält sie in der Liste.</p>
        ${action(signup, 'loeschen', 'Endgültig löschen', view, 'button button--small button--danger')}
      </div>
    </details>`
}

function state(signup: SignupRow): Html {
  if (signup.cancelled_at) {
    return html`<span class="badge badge--cancelled-signup">Storniert</span>
      <span class="cell-note">${timestamp(signup.cancelled_at)}</span>`
  }
  if (signup.contacted_at) {
    return html`<span class="badge badge--done">Geschrieben</span>
      <span class="cell-note">${timestamp(signup.contacted_at)}</span>`
  }
  return html`<span class="badge badge--new">Neu</span>`
}

/**
 * Wege zu schreiben, der erste ist der Hauptknopf — Naira schreibt die Mail
 * meist selbst:
 *
 * - „Einladung herunterladen“ lädt die Einladung herunter, zum Anhängen von
 *   Hand. Erst als Anhang zeigen Gmail und Outlook „Ja / Vielleicht / Nein“.
 * - „Mail mit Kalender“ hängt die Einladung als echte Datei an, über das
 *   Teilen-Menü des Geräts (Web Share). Einen Empfänger kann das Teilen-Menü
 *   nicht setzen; admin.js kopiert deshalb die Adresse in die Zwischenablage.
 * - „E-Mail schreiben“ ist ein mailto-Link mit der ausgefüllten Vorlage und
 *   geht überall — aber ohne Anhang, das lässt mailto nicht zu. Der Kalender
 *   steht dann als Link im Text.
 * - „Text kopieren“ (im Menü) für Mail-Apps, die mit langen mailto-Links
 *   nicht umgehen können.
 *
 * „Mail mit Kalender“ und „Text kopieren“ brauchen JavaScript und eine
 * passende Schnittstelle im Browser — sie stehen versteckt im HTML, und
 * /admin/admin.js zeigt sie nur, wo sie auch gehen. Teilen mit Datei gibt es
 * vor allem auf dem Handy und in Safari.
 */
function mailButtons(signup: SignupRow, info: SignupMailInfo): Html {
  const invite = `/admin/anmeldungen/${signup.id}/einladung.ics`
  const label = info.workshopCancelled ? 'Absage herunterladen' : 'Einladung herunterladen'

  return html`<span class="mail-buttons">
      <a
        class="button button--small"
        href="${invite}"
        download="${info.inviteFilename}"
        title="Kalenderdatei zum Anhängen an deine Mail"
      >
        ${ICON_DOWNLOAD} ${label}<span class="visually-hidden"> für ${signup.first_name} ${signup.last_name}</span>
      </a>
      <button
        class="button button--small button--secondary"
        type="button"
        data-invite="${invite}"
        data-invite-name="${info.inviteFilename}"
        data-mail-to="${signup.email}"
        data-mail-subject="${info.mail.subject}"
        data-mail-body="${info.mail.body}"
        hidden
      >
        Mail mit Kalender
      </button>
      <a class="button button--small button--secondary" href="${info.mail.mailto}">E-Mail schreiben</a>
    </span>`
}

function menu(signup: SignupRow, info: SignupMailInfo | undefined, view: SignupView): Html {
  const active = !signup.cancelled_at

  return html`<details class="menu" data-menu>
      <summary class="button button--small button--secondary button--icon" title="Weitere Aktionen">
        ${ICON_MORE}<span class="visually-hidden">Weitere Aktionen für ${signup.first_name}
          ${signup.last_name}</span>
      </summary>
      <div class="menu__panel">
        ${active && info
          ? html`<button class="menu__item" type="button" data-copy="${info.mail.subject}\n\n${info.mail.body}" hidden>
              Mailtext kopieren
            </button>`
          : ''}
        ${active ? action(signup, 'storniert', 'Stornieren', view, 'menu__item') : ''}
        ${deleteAction(signup, view)}
      </div>
    </details>`
}

function row(signup: SignupRow, context: MailContext, view: SignupView): Html {
  const active = !signup.cancelled_at
  const info = context.get(signup.id)

  return html`<tr class="signup${active ? '' : ' signup--cancelled'}" id="anmeldung-${signup.id}">
      <td>
        <span class="signup__name">${signup.first_name} ${signup.last_name}</span>
        <a class="cell-note" href="mailto:${signup.email}">${signup.email}</a>
      </td>
      <td class="num">${signup.persons}</td>
      <td class="signup__comment">${signup.comment ?? html`<span class="muted">–</span>`}</td>
      <td class="nowrap">
        ${timestamp(signup.created_at)}
        ${signup.source === 'admin' ? html`<span class="cell-note">von Hand erfasst</span>` : ''}
      </td>
      <td class="nowrap">${state(signup)}</td>
      <td>
        <div class="row-actions">
          ${menu(signup, info, view)} ${active && info ? mailButtons(signup, info) : ''}
          ${active && !signup.contacted_at
            ? action(signup, 'kontaktiert', 'Erledigt', view, 'button button--small button--secondary')
            : ''}
        </div>
      </td>
    </tr>`
}

/** Steht über der Tabelle: wie die Einladung in die Mail kommt. */
export function inviteHints(): Html {
  return html`<p class="hint">
      „Einladung herunterladen“ und die Datei in der Mail als Anhang anfügen — Gmail und Outlook zeigen der Person
      dann „Ja / Vielleicht / Nein“, die Antwort kommt zu dir. Nach einer Absage dasselbe mit „Absage herunterladen“.
    </p>
    <p class="hint" data-invite-hint hidden>
      „Mail mit Kalender“ hängt die Einladung an und kopiert die Adresse — in der Mail im Feld „An“ einfügen.
    </p>`
}

export function signupTable(signups: SignupRow[], context: MailContext, options: { view: SignupView }): Html {
  return html`<div class="table-wrap">
      <table class="table">
        <thead>
          <tr>
            <th scope="col">Name</th>
            <th scope="col" class="num">Pers.</th>
            <th scope="col">Bemerkung</th>
            <th scope="col">Angemeldet</th>
            <th scope="col">Status</th>
            <th scope="col"><span class="visually-hidden">Aktionen</span></th>
          </tr>
        </thead>
        <tbody>
          ${signups.map((signup) => row(signup, context, options.view))}
        </tbody>
      </table>
    </div>`
}
