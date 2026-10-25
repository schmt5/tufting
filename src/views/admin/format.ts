/** Formatierung, die nur der Admin braucht. Alles in Schweizer Zeit. */

import { formatWorkshopDate } from '../../workshops.ts'
import type { WorkshopRow, WorkshopStatus } from '../../db.ts'

/** `2026-11-22` → `Sa, 22.11.2026`. Mittags UTC, damit keine Zeitzone den Tag verschiebt. */
export function weekdayDate(iso: string): string {
  const weekday = new Intl.DateTimeFormat('de-CH', { weekday: 'short', timeZone: 'UTC' }).format(
    new Date(`${iso}T12:00:00Z`),
  )

  return `${weekday}, ${formatWorkshopDate(iso)}`
}

export function timeRange(workshop: Pick<WorkshopRow, 'start_time' | 'end_time'>): string {
  return `${workshop.start_time}–${workshop.end_time}`
}

/** Unix-Sekunden → `25.10.2026, 16:40`. */
export function timestamp(seconds: number): string {
  return new Intl.DateTimeFormat('de-CH', {
    timeZone: 'Europe/Zurich',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(seconds * 1000))
}

export function persons(count: number): string {
  return count === 1 ? '1 Person' : `${count} Personen`
}

export const STATUS_LABELS: Record<WorkshopStatus, string> = {
  draft: 'Entwurf',
  published: 'Veröffentlicht',
  cancelled: 'Abgesagt',
}
