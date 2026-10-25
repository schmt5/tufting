import { html } from 'hono/html'
import type { WorkshopWithSeats } from '../../db.ts'
import type { Html } from '../layout.ts'
import { STATUS_LABELS, timeRange, weekdayDate } from './format.ts'

export function workshopPath(id: string): string {
  return `/admin/workshops/${id}`
}

/**
 * Ein Termin als Zeile. Der ganze Eintrag ist klickbar, aber es gibt nur
 * einen Link — auf dem Datum, die Fläche kommt über ::after (Block-Link). So
 * liest ein Screenreader einen Link pro Termin statt eines Links um alles.
 */
function row(workshop: WorkshopWithSeats, newCount: number): Html {
  const status = workshop.status === 'published' ? null : STATUS_LABELS[workshop.status]

  return html`<li class="admin-row">
      <a class="admin-row__link" href="${workshopPath(workshop.id)}">${weekdayDate(workshop.date)}</a>
      <span class="admin-row__meta">
        ${timeRange(workshop)} · ${workshop.booked} von ${workshop.capacity} belegt
      </span>
      ${status || newCount > 0
        ? html`<span class="admin-row__tags">
            ${status ? html`<span class="tag">${status}</span>` : ''}
            ${newCount > 0 ? html`<span class="tag tag--strong">${newCount} neu</span>` : ''}
          </span>`
        : ''}
    </li>`
}

function list(workshops: WorkshopWithSeats[], newCounts: Map<string, number>): Html {
  return html`<ul class="admin-list" role="list">
      ${workshops.map((workshop) => row(workshop, newCounts.get(workshop.id) ?? 0))}
    </ul>`
}

export function renderOverview(
  upcoming: WorkshopWithSeats[],
  past: WorkshopWithSeats[],
  newCounts: Map<string, number>,
): Html {
  return html`<div class="admin-heading">
        <h1 class="page-title">Termine</h1>
        <a class="button" href="/admin/workshops/neu">Neuer Termin</a>
      </div>

      ${upcoming.length > 0
        ? list(upcoming, newCounts)
        : html`<p class="note">Keine kommenden Termine.</p>`}
      ${past.length > 0
        ? html`<details class="admin-past">
            <summary>Vergangene Termine</summary>
            ${list(past, newCounts)}
          </details>`
        : ''}`
}
