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
  return html`<div class="page page--narrow">
      <header class="detail__head">
        <div>
          <h1 class="page-title">Mitteilungen</h1>
          <p class="muted">
            Bei jeder neuen Anmeldung über die Webseite kommt eine Mitteilung auf die Geräte, die hier
            angemeldet sind. Ein Tipp darauf öffnet den Termin.
          </p>
        </div>
      </header>

      <section class="panel">
        <h2 class="panel__title">Dieses Gerät</h2>

      ${vapidPublicKey
        ? html`<div class="push" data-push data-vapid-key="${vapidPublicKey}">
            <p data-push-status>Zum Aktivieren braucht es JavaScript.</p>
            <p class="hint" data-push-ios hidden>
              Auf dem iPhone geht das nur in der App: in Safari auf Teilen tippen, dann „Zum
              Home-Bildschirm“, und den Admin von dort öffnen.
            </p>
            <p>
              <button class="button" type="button" data-push-enable hidden>
                Mitteilungen auf diesem Gerät aktivieren
              </button>
            </p>
          </div>`
        : html`<p class="alert alert--warning">
            Mitteilungen sind nicht eingerichtet: es fehlen die VAPID-Schlüssel
            (<code>VAPID_PUBLIC_KEY</code>, <code>VAPID_PRIVATE_KEY</code>, <code>VAPID_SUBJECT</code>).
          </p>`}
      </section>

      <section class="panel" aria-labelledby="geraete">
        <div class="panel__head">
          <h2 class="panel__title" id="geraete">Angemeldete Geräte</h2>
          ${devices.length > 0
            ? html`<form method="post" action="/admin/push/test">
                <button class="button button--small button--secondary" type="submit">Testmitteilung senden</button>
              </form>`
            : ''}
        </div>
        ${devices.length > 0
          ? html`<table class="table">
              <tbody>
                ${devices.map(
                  (device) => html`<tr>
                    <td><span class="signup__name">${device.label ?? 'Gerät'}</span></td>
                    <td class="muted">seit ${timestamp(device.created_at)}</td>
                    <td class="cell-end">
                      <form method="post" action="/admin/push/entfernen">
                        <input type="hidden" name="endpoint" value="${device.endpoint}" />
                        <button class="button button--small button--ghost" type="submit">Entfernen</button>
                      </form>
                    </td>
                  </tr>`,
                )}
              </tbody>
            </table>`
          : html`<p class="muted">Noch kein Gerät angemeldet.</p>`}
      </section>
    </div>`
}
