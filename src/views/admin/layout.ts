import { html } from 'hono/html'
import { BUSINESS } from '../../site.ts'
import type { Html } from '../layout.ts'

/**
 * Skeleton des Admins. Eigenes statt das der öffentlichen Seite: kein Open
 * Graph, kein JSON-LD, keine Ankerlinks — dafür die Navigation des Admins und
 * der Logout. Dasselbe Stylesheet, damit Admin und Seite gleich aussehen.
 *
 * noindex steht zusätzlich als Header (X-Robots-Tag, siehe admin.ts), damit
 * es auch für Antworten gilt, die kein HTML sind.
 */

export interface AdminLayoutOptions {
  title: string
  /** Kurze Rückmeldung nach einer Aktion, z.B. „Termin gespeichert.“ */
  flash?: string | null
  /** Ohne Session: kein Menü, kein Logout. */
  signedIn: boolean
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
        <link rel="preload" href="/fonts/inter-latin-var.woff2" as="font" type="font/woff2" crossorigin />
        <link rel="stylesheet" href="/style.css" />
      </head>
      <body class="admin">
        <a class="skip-link" href="#inhalt">Zum Inhalt springen</a>

        <header class="site-header">
          <div class="wrap site-header__inner">
            <a class="site-header__logo" href="/admin">${BUSINESS.name} · Admin</a>
            ${options.signedIn
              ? html`<nav aria-label="Admin">
                  <ul class="nav" role="list">
                    <li><a class="nav__link" href="/admin">Termine</a></li>
                    <li><a class="nav__link" href="/admin/workshops/neu">Neuer Termin</a></li>
                    <li><a class="nav__link" href="/admin/mitteilungen">Mitteilungen</a></li>
                    <li>
                      <form method="post" action="/admin/logout">
                        <button class="nav__link nav__button" type="submit">Abmelden</button>
                      </form>
                    </li>
                  </ul>
                </nav>`
              : ''}
          </div>
        </header>

        <main id="inhalt" tabindex="-1">
          <div class="wrap admin__main">
            ${options.flash ? html`<p class="flash">${options.flash}</p>` : ''} ${content}
          </div>
        </main>

        <!-- Service Worker und Push. Die Seiten funktionieren auch ohne. -->
        <script type="module" src="/admin/admin.js"></script>
      </body>
    </html>`
}
