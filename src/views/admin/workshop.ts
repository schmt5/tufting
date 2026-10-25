import { html } from 'hono/html'
import type { SignupRow, WorkshopWithSeats } from '../../db.ts'
import { type FieldErrors, MAX_CAPACITY, MAX_COMMENT_LENGTH, MAX_NOTE_LENGTH } from '../../forms.ts'
import type { SignupMail } from '../../template.ts'
import { checkbox, input, radios, textarea } from '../fields.ts'
import type { Html } from '../layout.ts'
import { persons, STATUS_LABELS, timeRange, timestamp, weekdayDate } from './format.ts'
import { workshopPath } from './overview.ts'

const STATUS_CHOICES = [
  { value: 'published', label: 'Veröffentlicht — auf der Seite, Anmeldung offen' },
  { value: 'draft', label: 'Entwurf — nur hier sichtbar' },
  { value: 'cancelled', label: 'Abgesagt — nicht mehr auf der Seite' },
]

export interface WorkshopFormOptions {
  /** Fehlt sie, ist es ein neuer Termin. */
  workshop?: WorkshopWithSeats
  values: Record<string, string>
  errors?: FieldErrors
  today: string
}

export function renderWorkshopForm(options: WorkshopFormOptions): Html {
  const { workshop, values, errors = {} } = options
  const action = workshop ? workshopPath(workshop.id) : '/admin/workshops'

  return html`<div class="prose prose--narrow">
      <p class="back">
        <a href="${workshop ? workshopPath(workshop.id) : '/admin'}">${workshop ? 'Zum Termin' : 'Alle Termine'}</a>
      </p>
      <h1 class="page-title">${workshop ? `Termin vom ${weekdayDate(workshop.date)} bearbeiten` : 'Neuer Termin'}</h1>

      <form class="form" method="post" action="${action}">
        ${input({
          name: 'date',
          label: 'Datum',
          type: 'date',
          value: values.date,
          error: errors.date,
          min: workshop ? undefined : options.today,
          required: true,
        })}
        <div class="form__row">
          ${input({
            name: 'start_time',
            label: 'Beginn',
            type: 'time',
            value: values.start_time,
            error: errors.start_time,
            required: true,
          })}
          ${input({
            name: 'end_time',
            label: 'Ende',
            type: 'time',
            value: values.end_time,
            error: errors.end_time,
            required: true,
          })}
        </div>
        ${input({
          name: 'capacity',
          label: 'Plätze',
          type: 'number',
          inputmode: 'numeric',
          min: '1',
          max: String(MAX_CAPACITY),
          value: values.capacity,
          error: errors.capacity,
          hint: workshop && workshop.booked > 0 ? `Schon angemeldet: ${persons(workshop.booked)}.` : undefined,
          required: true,
        })}
        ${textarea({
          name: 'note',
          label: 'Hinweis auf der Seite (optional)',
          hint: 'Ein Satz unter dem Datum, z.B. „Mit Apéro zum Abschluss“.',
          value: values.note,
          error: errors.note,
          maxlength: MAX_NOTE_LENGTH,
          rows: 2,
        })}
        ${radios({
          name: 'status',
          label: 'Status',
          value: values.status,
          error: errors.status,
          choices: STATUS_CHOICES,
          required: true,
        })}
        <p><button class="button" type="submit">${workshop ? 'Speichern' : 'Termin anlegen'}</button></p>
      </form>
    </div>`
}

function signupPath(id: string, action: string): string {
  return `/admin/anmeldungen/${id}/${action}`
}

/** Ein Button in einem eigenen Formular — HTML kann nur so per POST auslösen. */
function action(path: string, label: string, variant = 'button--secondary'): Html {
  return html`<form method="post" action="${path}">
      <button class="button button--small ${variant}" type="submit">${label}</button>
    </form>`
}

/**
 * Löschen ist endgültig, deshalb ein Schritt mehr: der Button steckt in einem
 * `<details>`. Funktioniert ohne JavaScript, anders als ein confirm()-Dialog.
 */
function deleteAction(signup: SignupRow): Html {
  return html`<details class="confirm">
      <summary class="button button--small button--secondary">Löschen …</summary>
      <div class="confirm__body">
        <p>Die Anmeldung wird endgültig gelöscht. Stornieren behält sie in der Liste.</p>
        ${action(signupPath(signup.id, 'loeschen'), 'Endgültig löschen', '')}
      </div>
    </details>`
}

function state(signup: SignupRow): Html {
  if (signup.cancelled_at) return html`<span class="tag">Storniert ${timestamp(signup.cancelled_at)}</span>`
  if (signup.contacted_at) {
    return html`<span class="tag">Geschrieben ${timestamp(signup.contacted_at)}</span>`
  }
  return html`<span class="tag tag--strong">Neu</span>`
}

/** Was Naira braucht, um der Person zu schreiben: die ausgefüllte Vorlage pro Anmeldung. */
export interface MailContext {
  mails: Map<string, SignupMail>
  /** Dateiname der Einladung, z.B. `einladung-2026-11-28.ics`. */
  inviteFilename: string
}

/**
 * Drei Wege zu schreiben:
 *
 * - „E-Mail schreiben“ ist ein mailto-Link und geht überall — aber ohne
 *   Anhang, das lässt mailto nicht zu. Der Kalender steht dann als Link im
 *   Text.
 * - „Mail mit Kalender“ hängt die Einladung als echte Datei an, über das
 *   Teilen-Menü des Geräts (Web Share). Erst als Anhang schlagen Gmail und
 *   Outlook den Termin direkt vor. Einen Empfänger kann das Teilen-Menü nicht
 *   setzen; admin.js kopiert deshalb die Adresse in die Zwischenablage.
 * - „Text kopieren“ für Mail-Apps, die mit langen mailto-Links nicht umgehen
 *   können.
 *
 * Die beiden letzten brauchen JavaScript und eine passende Schnittstelle im
 * Browser — sie stehen versteckt im HTML, und /admin/admin.js zeigt sie nur,
 * wo sie auch gehen. Teilen mit Datei gibt es vor allem auf dem Handy.
 */
function mailActions(signup: SignupRow, context: MailContext): Html {
  const mail = context.mails.get(signup.id)
  if (!mail) return html``

  return html`<button
      class="button button--small"
      type="button"
      data-invite="/admin/anmeldungen/${signup.id}/einladung.ics"
      data-invite-name="${context.inviteFilename}"
      data-mail-to="${signup.email}"
      data-mail-subject="${mail.subject}"
      data-mail-body="${mail.body}"
      hidden
    >
      Mail mit Kalender
    </button>
    <a class="button button--small" href="${mail.mailto}" data-mail-fallback>E-Mail schreiben</a>
    <button
      class="button button--small button--secondary"
      type="button"
      data-copy="${mail.subject}\n\n${mail.body}"
      hidden
    >
      Text kopieren
    </button>`
}

function signupItem(signup: SignupRow, context: MailContext): Html {
  const active = !signup.cancelled_at

  return html`<li class="signup" id="anmeldung-${signup.id}">
      <div class="signup__head">
        <h3 class="signup__name">${signup.first_name} ${signup.last_name}</h3>
        ${state(signup)}
      </div>
      <p class="signup__meta">
        ${persons(signup.persons)} · <a href="mailto:${signup.email}">${signup.email}</a>
      </p>
      ${signup.comment ? html`<p class="signup__comment">${signup.comment}</p>` : ''}
      <p class="signup__meta">
        ${signup.source === 'admin' ? 'Von Hand erfasst' : 'Angemeldet'} ${timestamp(signup.created_at)}
      </p>
      <div class="actions">
        ${active ? mailActions(signup, context) : ''}
        ${active && !signup.contacted_at
          ? action(signupPath(signup.id, 'kontaktiert'), 'Als geschrieben markieren')
          : ''}
        ${active ? action(signupPath(signup.id, 'storniert'), 'Stornieren') : ''} ${deleteAction(signup)}
      </div>
    </li>`
}

export interface ManualSignupOptions {
  values?: Record<string, string>
  errors?: FieldErrors
  /** Nach einem Fehler offen, damit die Meldung sichtbar ist. */
  open?: boolean
}

function manualSignupForm(workshop: WorkshopWithSeats, options: ManualSignupOptions): Html {
  const values = options.values ?? { persons: '1' }
  const errors = options.errors ?? {}

  return html`<details class="admin-manual" id="von-hand"${options.open ? html` open` : ''}>
      <summary>Anmeldung von Hand erfassen</summary>
      <form class="form" method="post" action="/admin/anmeldungen">
        <input type="hidden" name="workshop_id" value="${workshop.id}" />
        ${errors.seats ? html`<p class="field__error">${errors.seats}</p>` : ''}
        <div class="form__row">
          ${input({ name: 'first_name', label: 'Vorname', value: values.first_name, error: errors.first_name, required: true })}
          ${input({ name: 'last_name', label: 'Nachname', value: values.last_name, error: errors.last_name, required: true })}
        </div>
        ${input({ name: 'email', label: 'E-Mail', type: 'email', inputmode: 'email', value: values.email, error: errors.email, required: true })}
        ${input({
          name: 'persons',
          label: 'Personen',
          type: 'number',
          inputmode: 'numeric',
          min: '1',
          max: String(MAX_CAPACITY),
          value: values.persons,
          error: errors.persons,
          required: true,
        })}
        ${textarea({
          name: 'comment',
          label: 'Bemerkung (optional)',
          value: values.comment,
          error: errors.comment,
          maxlength: MAX_COMMENT_LENGTH,
        })}
        ${checkbox({
          name: 'overbook',
          label: 'Auch eintragen, wenn der Termin dafür zu voll ist',
          checked: values.overbook === '1',
        })}
        <p><button class="button" type="submit">Eintragen</button></p>
      </form>
    </details>`
}

export function renderWorkshop(
  workshop: WorkshopWithSeats,
  signups: SignupRow[],
  context: MailContext,
  manual: ManualSignupOptions = {},
): Html {
  const active = signups.filter((signup) => !signup.cancelled_at)
  const cancelled = signups.filter((signup) => signup.cancelled_at)

  return html`<p class="back"><a href="/admin">Alle Termine</a></p>
    <div class="admin-heading">
      <h1 class="page-title">${weekdayDate(workshop.date)}</h1>
      <a class="button button--secondary" href="${workshopPath(workshop.id)}/bearbeiten">Bearbeiten</a>
    </div>
    <p class="lead">
      ${timeRange(workshop)} · ${workshop.booked} von ${workshop.capacity} Plätzen belegt
      ${workshop.status === 'published' ? '' : html` · <span class="tag">${STATUS_LABELS[workshop.status]}</span>`}
    </p>
    ${workshop.note ? html`<p>${workshop.note}</p>` : ''}
    ${workshop.status === 'cancelled' && active.length > 0
      ? html`<p class="flash">
          Der Termin ist abgesagt, aber ${active.length === 1 ? 'eine Anmeldung ist' : `${active.length} Anmeldungen sind`}
          noch aktiv. Den Leuten schreiben und danach stornieren.
        </p>`
      : ''}

    <section class="admin-section" aria-labelledby="anmeldungen">
      <h2 class="section__title" id="anmeldungen">Anmeldungen</h2>
      <p class="note" data-invite-hint hidden>
        „Mail mit Kalender“ hängt die Einladung an und kopiert die Adresse — in der Mail im Feld
        „An“ einfügen.
      </p>
      ${active.length > 0
        ? html`<ul class="admin-signups" role="list">
            ${active.map((signup) => signupItem(signup, context))}
          </ul>`
        : html`<p class="note">Noch keine Anmeldungen.</p>`}
      ${manualSignupForm(workshop, manual)}
    </section>

    ${cancelled.length > 0
      ? html`<section class="admin-section" aria-labelledby="storniert">
          <h2 class="section__title" id="storniert">Storniert</h2>
          <ul class="admin-signups" role="list">
            ${cancelled.map((signup) => signupItem(signup, context))}
          </ul>
        </section>`
      : ''}`
}
