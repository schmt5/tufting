import { html } from 'hono/html'
import type { SignupRow, WorkshopWithSeats } from '../../db.ts'
import type { Html } from '../layout.ts'
import { STATUS_LABELS, timeRange, weekdayDate } from './format.ts'
import { inviteHints, type MailContext, signupTable } from './signups.ts'

export function workshopPath(id: string): string {
  return `/admin/workshops/${id}`
}

/** Was in der Liste links offen ist: der Eingang oder ein Termin. */
export type Selection = 'eingang' | { workshopId: string } | null

export interface SplitOptions {
  upcoming: WorkshopWithSeats[]
  past: WorkshopWithSeats[]
  newCounts: Map<string, number>
  selected: Selection
}

/**
 * Die Zustände eines Termins als farbige Marken. Farbe ist hier erlaubt (§6),
 * trägt aber nie allein: das Wort steht immer da.
 */
export function workshopBadges(workshop: WorkshopWithSeats, newCount = 0): Html {
  return html`${workshop.status === 'published'
      ? ''
      : html`<span class="badge badge--${workshop.status}">${STATUS_LABELS[workshop.status]}</span>`}
    ${workshop.status === 'published' && workshop.free === 0 ? html`<span class="badge badge--full">Voll</span>` : ''}
    ${newCount > 0 ? html`<span class="badge badge--new">${newCount} neu</span>` : ''}`
}

/** Belegung als Balken. Nur Zierde neben der Zahl, deshalb aria-hidden. */
export function seatsBar(workshop: WorkshopWithSeats): Html {
  const percent = workshop.capacity > 0 ? Math.min(100, Math.round((workshop.booked / workshop.capacity) * 100)) : 0

  return html`<span class="seats-bar${workshop.free === 0 ? ' seats-bar--full' : ''}" style="--belegt: ${percent}%" aria-hidden="true"></span>`
}

function isSelected(selected: Selection, workshop: WorkshopWithSeats): boolean {
  return typeof selected === 'object' && selected?.workshopId === workshop.id
}

function item(workshop: WorkshopWithSeats, newCount: number, selected: Selection): Html {
  return html`<li>
      <a class="slot" href="${workshopPath(workshop.id)}"${isSelected(selected, workshop) ? html` aria-current="page"` : ''}>
        <span class="slot__date">${weekdayDate(workshop.date)}</span>
        <span class="slot__badges">${workshopBadges(workshop, newCount)}</span>
        <span class="slot__meta">${timeRange(workshop)} · ${workshop.booked} von ${workshop.capacity} belegt</span>
        ${seatsBar(workshop)}
      </a>
    </li>`
}

function list(workshops: WorkshopWithSeats[], options: SplitOptions): Html {
  return html`<ul class="slots" role="list">
      ${workshops.map((workshop) => item(workshop, options.newCounts.get(workshop.id) ?? 0, options.selected))}
    </ul>`
}

function total(counts: Map<string, number>): number {
  return [...counts.values()].reduce((sum, count) => sum + count, 0)
}

/**
 * Liste links, Inhalt rechts — wie ein Mail-Programm. Die Liste kommt mit
 * jeder Seite neu vom Server; so bleibt jede Ansicht eine eigene Adresse und
 * es braucht kein JavaScript. Auf schmalen Bildschirmen steht sie über dem
 * Inhalt.
 */
export function renderSplit(options: SplitOptions, detail: Html): Html {
  const newTotal = total(options.newCounts)
  const pastOpen = options.past.some((workshop) => isSelected(options.selected, workshop))

  return html`<div class="split">
      <nav class="sidebar" aria-label="Termine">
        <a class="inbox-link" href="/admin"${options.selected === 'eingang' ? html` aria-current="page"` : ''}>
          Neue Anmeldungen
          ${newTotal > 0 ? html`<span class="count">${newTotal}</span>` : html`<span class="inbox-link__done">erledigt</span>`}
        </a>

        <div class="sidebar__head">
          <h2 class="sidebar__title">Kommende Termine</h2>
          <a class="button button--small" href="/admin/workshops/neu">+ Neuer Termin</a>
        </div>
        ${options.upcoming.length > 0
          ? list(options.upcoming, options)
          : html`<p class="muted sidebar__empty">Keine kommenden Termine.</p>`}
        ${options.past.length > 0
          ? html`<details class="sidebar__past"${pastOpen ? html` open` : ''}>
              <summary>Vergangene Termine</summary>
              ${list(options.past, options)}
            </details>`
          : ''}
      </nav>

      <div class="detail">${detail}</div>
    </div>`
}

export interface InboxGroup {
  workshop: WorkshopWithSeats
  signups: SignupRow[]
}

/**
 * Der Eingang: alle Anmeldungen, denen Naira noch nicht geschrieben hat, nach
 * Termin gruppiert. Das ist, was nach dem Login zu tun ist.
 */
export function renderInbox(groups: InboxGroup[], context: MailContext): Html {
  if (groups.length === 0) {
    return html`<div class="empty">
        <h1 class="page-title">Alles beantwortet</h1>
        <p class="muted">
          Neue Anmeldungen über die Webseite erscheinen hier. Alle Anmeldungen eines Termins siehst du,
          wenn du ihn links wählst.
        </p>
      </div>`
  }

  const count = groups.reduce((sum, group) => sum + group.signups.length, 0)

  return html`<header class="detail__head">
      <div>
        <h1 class="page-title">Neue Anmeldungen</h1>
        <p class="muted">
          ${count === 1 ? 'Eine Anmeldung wartet' : `${count} Anmeldungen warten`} auf deine Antwort. Nach dem
          Schreiben „Erledigt“ klicken, dann verschwindet sie von hier.
        </p>
      </div>
    </header>
    ${inviteHints()}

    ${groups.map(
      ({ workshop, signups }) => html`<section class="panel" aria-labelledby="eingang-${workshop.id}">
        <div class="panel__head">
          <h2 class="panel__title" id="eingang-${workshop.id}">
            <a href="${workshopPath(workshop.id)}">${weekdayDate(workshop.date)}</a>
          </h2>
          <span class="muted">${timeRange(workshop)} · ${workshop.booked} von ${workshop.capacity} belegt</span>
          ${workshopBadges(workshop)}
        </div>
        ${signupTable(signups, context, { view: 'eingang' })}
      </section>`,
    )}`
}
