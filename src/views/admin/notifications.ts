import { html } from 'hono/html'
import type { PushSubscriptionRow } from '../../db.ts'
import type { Html } from '../layout.ts'
import { timestamp } from './format.ts'

/**
 * Mitteilungen: Gerät anmelden, angemeldete Geräte, Testmitteilung.
 *
 * Das Anmelden braucht JavaScript (Erlaubnis fragen, beim Push-Dienst
 * registrieren) — das macht /admin/admin.js. Ohne Script bleibt der Button
 * versteckt und der Hinweis sagt, warum. Liste, Entfernen und Testmitteilung
 * sind normale Formulare und gehen auch ohne.
 */
export function renderNotifications(devices: PushSubscriptionRow[], vapidPublicKey: string | null): Html {
  return html`<div class="prose prose--narrow">
      <p class="back"><a href="/admin">Alle Termine</a></p>
      <h1 class="page-title">Mitteilungen</h1>
      <p>
        Bei jeder neuen Anmeldung über die Webseite kommt eine Mitteilung auf die Geräte, die hier
        angemeldet sind. Ein Tipp darauf öffnet den Termin.
      </p>

      ${vapidPublicKey
        ? html`<div class="push" data-push data-vapid-key="${vapidPublicKey}">
            <p class="note" data-push-status>Zum Aktivieren braucht es JavaScript.</p>
            <p class="note" data-push-ios hidden>
              Auf dem iPhone geht das nur in der App: in Safari auf Teilen tippen, dann „Zum
              Home-Bildschirm“, und den Admin von dort öffnen.
            </p>
            <p>
              <button class="button" type="button" data-push-enable hidden>
                Mitteilungen auf diesem Gerät aktivieren
              </button>
            </p>
          </div>`
        : html`<p class="note">
            Mitteilungen sind nicht eingerichtet: es fehlen die VAPID-Schlüssel
            (<code>VAPID_PUBLIC_KEY</code>, <code>VAPID_PRIVATE_KEY</code>, <code>VAPID_SUBJECT</code>).
          </p>`}
    </div>

    <section class="admin-section" aria-labelledby="geraete">
      <h2 class="section__title" id="geraete">Angemeldete Geräte</h2>
      ${devices.length > 0
        ? html`<ul class="admin-list" role="list">
              ${devices.map(
                (device) => html`<li class="admin-row">
                  <span class="admin-row__title">${device.label ?? 'Gerät'}</span>
                  <span class="admin-row__meta">seit ${timestamp(device.created_at)}</span>
                  <form class="admin-row__tags" method="post" action="/admin/push/entfernen">
                    <input type="hidden" name="endpoint" value="${device.endpoint}" />
                    <button class="button button--small button--secondary" type="submit">Entfernen</button>
                  </form>
                </li>`,
              )}
            </ul>
            <form method="post" action="/admin/push/test">
              <button class="button" type="submit">Testmitteilung senden</button>
            </form>`
        : html`<p class="note">Noch kein Gerät angemeldet.</p>`}
    </section>`
}
