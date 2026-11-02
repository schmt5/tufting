import { html } from 'hono/html'
import { BUSINESS } from '../../site.ts'
import type { Html } from '../layout.ts'

/**
 * Skeleton des Admins. Eigenes statt das der öffentlichen Seite: kein Open
 * Graph, kein JSON-LD, keine Ankerlinks — dafür die Leiste des Admins und der
 * Logout. Auch ein eigenes Stylesheet: der Admin ist ein Werkzeug für den
 * Laptop und folgt nicht der Formensprache der Seite (DESIGN_GUIDE.md §6).
 *
 * noindex steht zusätzlich als Header (X-Robots-Tag, siehe admin.ts), damit
 * es auch für Antworten gilt, die kein HTML sind.
 */

export type AdminSection = 'termine' | 'vorlage'

export interface AdminLayoutOptions {
  title: string
  /** Kurze Rückmeldung nach einer Aktion, z.B. „Termin gespeichert.“ */
  flash?: string | null
  /** Ohne Session: keine Leiste, kein Logout. */
  signedIn: boolean
  /** Der Menüpunkt, der hervorgehoben wird. */
  current?: AdminSection
  /** Anmeldungen, denen Naira noch nicht geschrieben hat — als Zahl am Menüpunkt. */
  newTotal?: number
}

const SECTIONS: { key: AdminSection; href: string; label: string }[] = [
  { key: 'termine', href: '/admin', label: 'Termine' },
  { key: 'vorlage', href: '/admin/vorlage', label: 'E-Mail-Vorlage' },
]

function navigation(options: AdminLayoutOptions): Html {
  return html`<nav class="topbar__nav" aria-label="Admin">
      <ul role="list">
        ${SECTIONS.map(
          (section) => html`<li>
            <a
              class="topbar__link"
              href="${section.href}"${section.key === options.current ? html` aria-current="page"` : ''}
              >${section.label}${section.key === 'termine' && options.newTotal
                ? html` <span class="count">${options.newTotal}<span class="visually-hidden"> neu</span></span>`
                : ''}</a
            >
          </li>`,
        )}
      </ul>
    </nav>
    <form class="topbar__logout" method="post" action="/admin/logout">
      <button class="topbar__link" type="submit">Abmelden</button>
    </form>`
}

export function adminLayout(options: AdminLayoutOptions, content: Html | string): Html {
  return html`<!doctype html>
    <html lang="de-CH">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="robots" content="noindex, nofollow" />
        <title>${options.title} — Admin ${BUSINESS.name}</title>
        <meta name="theme-color" content="#ffffff" />
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <!-- Als App installierbar (Home-Bildschirm), mit eigenem Namen und Icon. -->
        <link rel="manifest" href="/admin/manifest.webmanifest" />
        <link rel="apple-touch-icon" href="/admin/icon-180.png" />
        <meta name="apple-mobile-web-app-title" content="Naira Admin" />
        <link rel="stylesheet" href="/admin/admin.css" />
      </head>
      <body>
        <a class="skip-link" href="#inhalt">Zum Inhalt springen</a>

        <header class="topbar">
          <a class="topbar__brand" href="/admin">${BUSINESS.name} <span>Admin</span></a>
          ${options.signedIn ? navigation(options) : ''}
        </header>

        <main id="inhalt" tabindex="-1">${content}</main>

        <!-- Unten rechts, damit sie auch nach dem Sprung zu einer Anmeldung
             sichtbar bleibt. Beim Laden schon da, deshalb ohne Live-Region. -->
        ${options.flash
          ? html`<div class="toast" data-toast>
              <p>${options.flash}</p>
              <button class="toast__close" type="button" aria-label="Meldung schliessen" data-toast-close hidden>
                ×
              </button>
            </div>`
          : ''}

        <!-- Teilen, Kopieren, Menüs. Die Seiten funktionieren auch ohne. -->
        <script type="module" src="/admin/admin.js"></script>
      </body>
    </html>`
}
