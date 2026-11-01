import { html } from 'hono/html'
import { input } from '../fields.ts'
import type { Html } from '../layout.ts'

export interface LoginViewOptions {
  error?: string
  /** Gesperrt nach zu vielen Fehlversuchen — dann gibt es kein Formular. */
  lockedMinutes?: number
}

/**
 * Nur ein Passwort, kein Benutzername. Das unsichtbare Feld „admin“ steht für
 * Passwort-Manager da: Schlüsselbund & Co. speichern ein Passwort zuverlässiger,
 * wenn es einen Benutzernamen dazu gibt. Für Screenreader und Tab ist es weg.
 */
export function renderLogin(options: LoginViewOptions = {}): Html {
  if (options.lockedMinutes) {
    return html`<div class="login panel">
        <h1 class="page-title">Anmelden</h1>
        <p class="alert alert--danger">
          Zu viele Fehlversuche. Der Login ist für ${options.lockedMinutes} Minuten gesperrt.
        </p>
      </div>`
  }

  return html`<div class="login panel">
      <h1 class="page-title">Anmelden</h1>
      <form class="form" method="post" action="/admin/login">
        <input
          class="visually-hidden"
          type="text"
          name="username"
          value="admin"
          autocomplete="username"
          tabindex="-1"
          aria-hidden="true"
          readonly
        />
        ${input({
          name: 'password',
          label: 'Passwort',
          type: 'password',
          autocomplete: 'current-password',
          error: options.error,
          required: true,
        })}
        <div class="form__actions"><button class="button" type="submit">Anmelden</button></div>
      </form>
    </div>`
}

/** Fehlen die Secrets, bleibt der Admin zu — und sagt, warum. */
export function renderNotConfigured(): Html {
  return html`<div class="login panel">
      <h1 class="page-title">Admin nicht eingerichtet</h1>
      <p>
        Es fehlen die Secrets <code>ADMIN_PASSWORD</code> und <code>SESSION_SECRET</code>
        (mindestens 32 Zeichen). Ohne sie bleibt der Admin gesperrt.
      </p>
    </div>`
}
