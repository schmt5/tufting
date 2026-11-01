import { html } from 'hono/html'
import type { SignupRow, WorkshopWithSeats } from '../../db.ts'
import { type FieldErrors, MAX_CAPACITY, MAX_COMMENT_LENGTH, MAX_NOTE_LENGTH } from '../../forms.ts'
import { checkbox, input, radios, textarea } from '../fields.ts'
import type { Html } from '../layout.ts'
import { persons, STATUS_LABELS, timeRange, weekdayDate } from './format.ts'
import { seatsBar, workshopBadges, workshopPath } from './overview.ts'
import { inviteHints, type MailContext, signupTable } from './signups.ts'

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

  return html`<header class="detail__head">
      <h1 class="page-title">${workshop ? `Termin vom ${weekdayDate(workshop.date)} bearbeiten` : 'Neuer Termin'}</h1>
    </header>

    <form class="form panel" method="post" action="${action}">
      <div class="form__row">
        ${input({
          name: 'date',
          label: 'Datum',
          type: 'date',
          value: values.date,
          error: errors.date,
          min: workshop ? undefined : options.today,
          required: true,
        })}
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
      </div>
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
      <div class="form__actions">
        <button class="button" type="submit">${workshop ? 'Speichern' : 'Termin anlegen'}</button>
        <a class="button button--ghost" href="${workshop ? workshopPath(workshop.id) : '/admin'}">Abbrechen</a>
      </div>
    </form>`
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

  return html`<details class="disclosure" id="von-hand"${options.open ? html` open` : ''}>
      <summary>Anmeldung von Hand erfassen</summary>
      <form class="form" method="post" action="/admin/anmeldungen">
        <input type="hidden" name="workshop_id" value="${workshop.id}" />
        ${errors.seats ? html`<p class="alert alert--danger">${errors.seats}</p>` : ''}
        <div class="form__row">
          ${input({ name: 'first_name', label: 'Vorname', value: values.first_name, error: errors.first_name, required: true })}
          ${input({ name: 'last_name', label: 'Nachname', value: values.last_name, error: errors.last_name, required: true })}
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
        </div>
        ${textarea({
          name: 'comment',
          label: 'Bemerkung (optional)',
          value: values.comment,
          error: errors.comment,
          maxlength: MAX_COMMENT_LENGTH,
          rows: 2,
        })}
        ${checkbox({
          name: 'overbook',
          label: 'Auch eintragen, wenn der Termin dafür zu voll ist',
          checked: values.overbook === '1',
        })}
        <div class="form__actions"><button class="button" type="submit">Eintragen</button></div>
      </form>
    </details>`
}

/** Neue zuerst, sonst in der Reihenfolge der Anmeldung. */
function newFirst(signups: SignupRow[]): SignupRow[] {
  return [...signups].sort((a, b) => Number(Boolean(a.contacted_at)) - Number(Boolean(b.contacted_at)))
}

export function renderWorkshop(
  workshop: WorkshopWithSeats,
  signups: SignupRow[],
  context: MailContext,
  manual: ManualSignupOptions = {},
): Html {
  const active = newFirst(signups.filter((signup) => !signup.cancelled_at))
  const cancelled = signups.filter((signup) => signup.cancelled_at)
  const newCount = active.filter((signup) => !signup.contacted_at).length

  return html`<header class="detail__head">
      <div>
        <div class="detail__title">
          <h1 class="page-title">${weekdayDate(workshop.date)}</h1>
          ${workshop.status === 'published'
            ? html`<span class="badge badge--published">${STATUS_LABELS.published}</span>`
            : ''}
          ${workshopBadges(workshop)}
        </div>
        ${workshop.note ? html`<p class="muted">Hinweis auf der Seite: ${workshop.note}</p>` : ''}
      </div>
      <a class="button button--secondary" href="${workshopPath(workshop.id)}/bearbeiten">Bearbeiten</a>
    </header>

    <dl class="stats">
      <div class="stat">
        <dt>Zeit</dt>
        <dd>${timeRange(workshop)}</dd>
      </div>
      <div class="stat">
        <dt>Belegt</dt>
        <dd>${workshop.booked} von ${workshop.capacity} ${seatsBar(workshop)}</dd>
      </div>
      <div class="stat">
        <dt>Frei</dt>
        <dd>${workshop.free}</dd>
      </div>
      <div class="stat${newCount > 0 ? ' stat--new' : ''}">
        <dt>Noch zu beantworten</dt>
        <dd>${newCount}</dd>
      </div>
    </dl>

    ${workshop.status === 'cancelled' && active.length > 0
      ? html`<p class="alert alert--danger">
          Der Termin ist abgesagt, aber ${active.length === 1 ? 'eine Anmeldung ist' : `${active.length} Anmeldungen sind`}
          noch aktiv. Den Leuten schreiben und danach stornieren.
        </p>`
      : ''}

    <section class="panel" aria-labelledby="anmeldungen">
      <div class="panel__head">
        <h2 class="panel__title" id="anmeldungen">Anmeldungen</h2>
        <span class="muted">${active.length}</span>
      </div>
      ${active.length > 0
        ? html`${inviteHints()} ${signupTable(active, context, { view: 'termin' })}`
        : html`<p class="muted panel__empty">Noch keine Anmeldungen.</p>`}
      ${manualSignupForm(workshop, manual)}
    </section>

    ${cancelled.length > 0
      ? html`<details class="disclosure disclosure--section">
          <summary>Storniert (${cancelled.length})</summary>
          ${signupTable(cancelled, context, { view: 'termin' })}
        </details>`
      : ''}`
}
