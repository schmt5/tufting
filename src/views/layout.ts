import { html } from 'hono/html'
import type { HtmlEscapedString } from 'hono/utils/html'
import { BUSINESS, hasAddress } from '../site.ts'

/** Rückgabetyp von hono/html — mit Promise, sobald ein Wert asynchron ist. */
export type Html = HtmlEscapedString | Promise<HtmlEscapedString>

/** Wortmarke im Header. Ersetzt eine SVG-Datei, solange es kein Logo gibt. */
const WORDMARK = BUSINESS.name

/** Ankerziele der Navigation. Die IDs stehen an den Sections in den Views. */
const NAV = [
  { href: '/#workshops', label: 'Workshops' },
  { href: '/#termine', label: 'Termine' },
  { href: '/#ueber-mich', label: 'Über mich' },
]

/** Rechtstexte im Footer. Eigene Routen, siehe views/legal.ts. */
const LEGAL = [
  { href: '/impressum', label: 'Impressum' },
  { href: '/datenschutz', label: 'Datenschutz' },
]

export interface LayoutOptions {
  /** Inhalt des <title>. */
  title: string
  /** Meta-Description und og:description. */
  description: string
  /** Absolute URL dieser Seite — Canonical und og:url. */
  canonical: string
  /** Zusätzliches Markup im <head>, aktuell der JSON-LD-Block. */
  head?: Html | string
  /** Fehlerseiten gehören nicht in den Index. */
  noindex?: boolean
  /**
   * Tally-Embed einbinden. Nur dort true, wo es auch einen Button gibt — die
   * Rechtstexte laden damit kein Script eines Drittanbieters.
   */
  tally?: boolean
}

/** Jahr in Schweizer Zeit — der Worker läuft in UTC. */
function currentYear(): string {
  return new Intl.DateTimeFormat('de-CH', { timeZone: 'Europe/Zurich', year: 'numeric' }).format(
    new Date(),
  )
}

/** Herkunft aus dem Canonical, für die absoluten URLs von og:image und Icons. */
function originOfCanonical(canonical: string): string {
  return new URL(canonical).origin
}

/**
 * Anschrift im Footer. Vollständig, sobald die Adresse in site.ts steht —
 * lokale Suche braucht Name, Adresse und Kontakt an einer sichtbaren Stelle,
 * nicht nur im JSON-LD.
 */
function address(): Html {
  const lines = [
    BUSINESS.name,
    ...(hasAddress() ? [BUSINESS.street, `${BUSINESS.postalCode} ${BUSINESS.locality}`] : [BUSINESS.locality]),
  ]

  return html`<address class="site-footer__address">
      ${lines.map((line) => html`<span>${line}</span>`)}
      ${BUSINESS.email ? html`<a href="mailto:${BUSINESS.email}">${BUSINESS.email}</a>` : ''}
    </address>`
}

/**
 * Skeleton der Seite: Header mit Wortmarke und Ankerlinks, Inhalt, Footer.
 * Das CSS liegt in /style.css und wird von Workers Assets ausgeliefert — ohne
 * Worker-Invocation und mit eigenem Caching, deshalb kein Inline-<style>.
 *
 * Der Seitentitel steht nur im <head>; das <h1> gehört zur jeweiligen Seite und
 * wird dort gerendert.
 *
 * role="list" steht an jeder Liste ohne Punkte: Safari nimmt einer <ul> mit
 * list-style:none die Listensemantik, VoiceOver zählt die Einträge sonst nicht.
 */
export function layout(options: LayoutOptions, content: Html | string): Html {
  const origin = originOfCanonical(options.canonical)

  return html`<!doctype html>
    <html lang="de-CH">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>${options.title}</title>
        <meta name="description" content="${options.description}" />
        <link rel="canonical" href="${options.canonical}" />
        ${options.noindex ? html`<meta name="robots" content="noindex, follow" />` : ''}

        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="${BUSINESS.name}" />
        <meta property="og:locale" content="de_CH" />
        <meta property="og:title" content="${options.title}" />
        <meta property="og:description" content="${options.description}" />
        <meta property="og:url" content="${options.canonical}" />
        <meta property="og:image" content="${origin}/og-image.png" />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta property="og:image:alt" content="${BUSINESS.name} — Tufting-Workshops in Bern" />
        <meta name="twitter:card" content="summary_large_image" />

        <meta name="theme-color" content="#ffffff" />
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <link rel="icon" href="/favicon.ico" sizes="32x32" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />

        <!-- crossorigin ist auch bei gleicher Herkunft nötig, sonst lädt der Font zweimal. -->
        <link rel="preload" href="/fonts/inter-latin-var.woff2" as="font" type="font/woff2" crossorigin />
        <link rel="stylesheet" href="/style.css" />
        ${options.head ?? ''}
      </head>
      <body>
        <a class="skip-link" href="#inhalt">Zum Inhalt springen</a>

        <header class="site-header">
          <div class="wrap site-header__inner">
            <a class="site-header__logo" href="/">${WORDMARK}</a>
            <nav aria-label="Seitenbereiche">
              <ul class="nav" role="list">
                ${NAV.map((item) => html`<li><a class="nav__link" href="${item.href}">${item.label}</a></li>`)}
              </ul>
            </nav>
          </div>
        </header>

        <!-- tabindex="-1": ohne das setzt der Skip-Link nur den Scroll, nicht den Fokus. -->
        <main id="inhalt" tabindex="-1">${content}</main>

        <footer class="site-footer">
          <div class="wrap site-footer__inner">
            ${address()}
            <nav aria-label="Rechtliches">
              <ul class="site-footer__legal" role="list">
                ${LEGAL.map((item) => html`<li><a href="${item.href}">${item.label}</a></li>`)}
              </ul>
            </nav>
            <p>© ${currentYear()} ${WORDMARK}</p>
          </div>
        </footer>

        ${options.tally ? html`<script async src="https://tally.so/widgets/embed.js"></script>` : ''}
      </body>
    </html>`
}
