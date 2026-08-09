import { Hono } from 'hono'
import { html } from 'hono/html'
import { buildGraph, jsonLd, originOf } from './seo.ts'
import { BUSINESS, CONTACT_FORM_ID, CONTACT_PATH } from './site.ts'
import { formatWorkshopDate, loadWorkshops } from './workshops.ts'
import { renderAbout } from './views/about.ts'
import { renderCard } from './views/card.ts'
import { renderGallery } from './views/gallery.ts'
import { renderIntro } from './views/intro.ts'
import { layout } from './views/layout.ts'
import { renderImprint, renderNotFound, renderPrivacy } from './views/legal.ts'
import { renderSchedule } from './views/schedule.ts'
import {
  renderContactPage,
  renderSignup,
  renderSignupUnavailable,
  signupPath,
} from './views/signup.ts'

type Env = {
  TALLY_TOKEN: string
}

const TITLE = 'Tufting-Workshops in Bern'
const PAGE_TITLE = `Tufting-Workshops in Bern — ${BUSINESS.name}`
const DESCRIPTION =
  'Tufting-Workshops in Bern: Tufte deinen eigenen Teppich in kleiner Runde. Termine und Anmeldung.'

const app = new Hono<{ Bindings: Env }>()

app.get('/', async (c) => {
  const origin = originOf(c.req.url)
  const { workshops, failed } = await loadWorkshops(c.env.TALLY_TOKEN)
  const cards = workshops.map(renderCard)

  // Bewusst immer 200: die Seite soll nie als Fehlerseite erscheinen. Fehlt die
  // Terminliste, bleibt der Rest der Seite stehen. Sichtbar wird der Ausfall
  // über console.error und die Observability-Logs.
  let message: string | null = null

  if (cards.length === 0) {
    message = failed
      ? 'Die Workshops können momentan nicht geladen werden.'
      : 'Zurzeit sind keine Workshops ausgeschrieben.'
  }

  return c.html(
    layout(
      {
        title: PAGE_TITLE,
        description: DESCRIPTION,
        canonical: `${origin}/`,
        // Dieselben Workshops wie die Cards — das Markup beschreibt, was auch
        // sichtbar auf der Seite steht.
        head: jsonLd(buildGraph(workshops, origin)),
      },
      html`${renderGallery()} ${renderIntro(TITLE)} ${renderSchedule(cards, message)} ${renderAbout()}`,
    ),
  )
})

/**
 * Anmeldung zu einem Termin. Eigene Seite statt Popup, weil das Formular länger
 * ist als ein Overlay hoch — Begründung in views/signup.ts.
 *
 * Die ID wird gegen die geladenen Workshops geprüft, nicht bloss gegen ein
 * Muster: sonst bettete die Seite jedes beliebige fremde Tally-Formular ein.
 * `loadWorkshops` filtert vergangene Termine bereits weg, deren Adressen
 * laufen damit auf die 404.
 */
app.get('/anmeldung/:id', async (c) => {
  const { workshops, failed } = await loadWorkshops(c.env.TALLY_TOKEN)

  // Ohne Daten aus Tally lässt sich die ID nicht prüfen. Eine 404 behauptete,
  // es gäbe den Termin nicht — das weiss die Seite gerade nicht.
  if (failed) {
    return c.html(
      layout(
        {
          title: `Anmeldung — ${BUSINESS.name}`,
          description: 'Anmeldung zu einem Tufting-Workshop in Bern.',
          canonical: `${originOf(c.req.url)}/`,
          noindex: true,
        },
        renderSignupUnavailable(),
      ),
      503,
    )
  }

  const workshop = workshops.find((entry) => entry.id === c.req.param('id'))

  if (!workshop) return c.notFound()

  const origin = originOf(c.req.url)
  const date = formatWorkshopDate(workshop.date)

  return c.html(
    layout(
      {
        title: `Anmeldung Workshop ${date} — ${BUSINESS.name}`,
        description: `Anmeldung zum Tufting-Workshop am ${date} in ${BUSINESS.locality}.`,
        canonical: `${origin}${signupPath(workshop.id)}`,
        tally: true,
      },
      renderSignup(workshop),
    ),
  )
})

/**
 * Kontaktformular, derselbe Weg wie die Anmeldung. Ohne ID gibt es die Seite
 * nicht — dann steht auch auf der Startseite kein Link dorthin.
 */
app.get(CONTACT_PATH, (c) => {
  if (!CONTACT_FORM_ID) return c.notFound()

  return c.html(
    layout(
      {
        title: `Schreibe mir — ${BUSINESS.name}`,
        description: `Kein passender Termin? Schreibe ${BUSINESS.person} für eine Alternative.`,
        canonical: `${originOf(c.req.url)}${CONTACT_PATH}`,
        tally: true,
      },
      renderContactPage(CONTACT_FORM_ID),
    ),
  )
})

app.get('/impressum', (c) =>
  c.html(
    layout(
      {
        title: `Impressum — ${BUSINESS.name}`,
        description: `Impressum und Kontaktangaben von ${BUSINESS.name} in ${BUSINESS.locality}.`,
        canonical: `${originOf(c.req.url)}/impressum`,
      },
      renderImprint(),
    ),
  ),
)

app.get('/datenschutz', (c) =>
  c.html(
    layout(
      {
        title: `Datenschutz — ${BUSINESS.name}`,
        description: 'Welche Daten diese Seite bearbeitet, wozu und wie lange.',
        canonical: `${originOf(c.req.url)}/datenschutz`,
      },
      renderPrivacy(),
    ),
  ),
)

/**
 * robots.txt und sitemap.xml kommen aus dem Worker statt aus ./public, weil
 * beide absolute URLs enthalten. So stimmen sie auf jeder Domain — auch bevor
 * die Custom Domain steht — statt eine hartcodierte Herkunft zu behaupten.
 */
app.get('/robots.txt', async (c) =>
  c.text(`User-agent: *\nAllow: /\n\nSitemap: ${originOf(c.req.url)}/sitemap.xml\n`),
)

/**
 * Nur die festen Seiten. Die Anmeldeseiten stehen bewusst nicht drin: sie
 * hier aufzuzählen hiesse, bei jedem Abruf der Sitemap die Tally-API zu
 * befragen — die bei 100 Anfragen pro Minute dichtmacht und pro Seitenaufbau
 * schon eine Anfrage je Formular kostet. Gefunden werden sie über die Links
 * auf der Startseite.
 */
const SITEMAP_PATHS = ['/', '/impressum', '/datenschutz']

app.get('/sitemap.xml', async (c) => {
  const origin = originOf(c.req.url)
  const urls = SITEMAP_PATHS.map((path) => `  <url><loc>${origin}${path}</loc></url>`).join('\n')

  return c.body(
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
    200,
    { 'Content-Type': 'application/xml; charset=utf-8' },
  )
})

// Gestaltete 404 statt Honos nacktem Text — und noindex, damit Tippfehler in
// verlinkten Adressen nicht als Seite im Index landen.
app.notFound((c) =>
  c.html(
    layout(
      {
        title: `Seite nicht gefunden — ${BUSINESS.name}`,
        description: 'Diese Adresse gibt es auf dieser Seite nicht.',
        canonical: `${originOf(c.req.url)}/`,
        noindex: true,
      },
      renderNotFound(),
    ),
    404,
  ),
)

export default app
