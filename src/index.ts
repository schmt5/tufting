import { type Context, Hono } from 'hono'
import { html } from 'hono/html'
import admin from './admin.ts'
import { clientIp } from './auth.ts'
import { getPublishedWorkshop, insertSignup, listPublishedWorkshops } from './db.ts'
import { type Env, usesDatabase } from './env.ts'
import { field, parseSignupForm, SIGNUP_FIELDS } from './forms.ts'
import { newSignupMessage, notifyAdmin } from './notify.ts'
import { buildGraph, jsonLd, originOf } from './seo.ts'
import { BUSINESS, CONTACT_FORM_ID, CONTACT_PATH } from './site.ts'
import { SIGNUP_ACTION, TOKEN_FIELD, turnstileConfig, verifyTurnstile } from './turnstile.ts'
import {
  formatWorkshopDate,
  fromDatabase,
  loadWorkshops,
  loadWorkshopsFromDatabase,
  todayInZurich,
  type Workshop,
  type WorkshopsResult,
} from './workshops.ts'
import { renderAbout } from './views/about.ts'
import { renderCard } from './views/card.ts'
import { renderGallery } from './views/gallery.ts'
import { renderIntro } from './views/intro.ts'
import type { Html } from './views/layout.ts'
import { layout } from './views/layout.ts'
import { renderImprint, renderNotFound, renderPrivacy } from './views/legal.ts'
import { renderSchedule } from './views/schedule.ts'
import {
  renderContactPage,
  renderSignup,
  renderSignupForm,
  renderSignupUnavailable,
  renderThanks,
  type SignupFormOptions,
  signupPath,
} from './views/signup.ts'

type AppContext = Context<{ Bindings: Env }>

const TITLE = 'Tufting-Workshops in Bern'
const PAGE_TITLE = `Tufting-Workshops in Bern — ${BUSINESS.name}`
const DESCRIPTION =
  'Tufting-Workshops in Bern: Tufte deinen eigenen Teppich in kleiner Runde. Termine und Anmeldung.'

const app = new Hono<{ Bindings: Env }>()

// Admin mit eigenen Middlewares (Login, CSRF, no-store), siehe admin.ts.
app.route('/admin', admin)

/**
 * Läuft nach der Antwort weiter (waitUntil). Ohne ExecutionContext — in den
 * Tests, die die App direkt aufrufen — wird stattdessen gewartet.
 */
async function inBackground(c: AppContext, task: Promise<unknown>): Promise<void> {
  try {
    c.executionCtx.waitUntil(task)
  } catch {
    await task
  }
}

/** Termine aus der Quelle, die SIGNUP_BACKEND wählt (plan.md §12). */
function loadSchedule(env: Env): Promise<WorkshopsResult> {
  return usesDatabase(env) ? loadWorkshopsFromDatabase(env.DB) : loadWorkshops(env.TALLY_TOKEN)
}

app.get('/', async (c) => {
  const origin = originOf(c.req.url)
  const { workshops, failed } = await loadSchedule(c.env)
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

/** Ohne Termine lässt sich die ID nicht prüfen — 503 statt einer 404, die etwas behauptete. */
function unavailable(c: AppContext) {
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

/**
 * Ein veröffentlichter Termin ab heute aus der D1; null, wenn es ihn nicht
 * (mehr) gibt, und `failed`, wenn die D1 nicht antwortet.
 */
async function databaseWorkshop(c: AppContext): Promise<Workshop | null | 'failed'> {
  try {
    const row = await getPublishedWorkshop(c.env.DB, c.req.param('id') ?? '', todayInZurich())
    return row ? fromDatabase(row) : null
  } catch (error) {
    console.error('D1: Termin konnte nicht geladen werden', error)
    return 'failed'
  }
}

function signupPage(c: AppContext, workshop: Workshop, content: Html, status: 200 | 409 | 422 = 200) {
  const date = formatWorkshopDate(workshop.date)

  return c.html(
    layout(
      {
        title: `Anmeldung Workshop ${date} — ${BUSINESS.name}`,
        description: `Anmeldung zum Tufting-Workshop am ${date} in ${BUSINESS.locality}.`,
        canonical: `${originOf(c.req.url)}${signupPath(workshop.id)}`,
        tally: !usesDatabase(c.env),
        turnstile: usesDatabase(c.env) && workshop.state !== 'soldOut',
        // Ein Formular mit Fehlermeldungen ist keine Seite für den Index.
        noindex: status !== 200,
      },
      content,
    ),
    status,
  )
}

/**
 * Anmeldung zu einem Termin. Eigene Seite statt Popup, weil das Formular länger
 * ist als ein Overlay hoch — Begründung in views/signup.ts.
 *
 * Die ID wird gegen die Termine geprüft, nicht bloss gegen ein Muster: sonst
 * bettete die Tally-Version jedes beliebige fremde Formular ein, und die
 * eigene nähme Anmeldungen für Entwürfe an. Vergangene Termine laufen in
 * beiden Quellen auf die 404.
 */
app.get('/anmeldung/:id', async (c) => {
  if (usesDatabase(c.env)) {
    const workshop = await databaseWorkshop(c)
    if (workshop === 'failed') return unavailable(c)
    if (!workshop) return c.notFound()

    const turnstile = turnstileConfig(c.env)
    if (!turnstile) {
      console.error('Turnstile: TURNSTILE_SITE_KEY, TURNSTILE_SECRET_KEY oder TURNSTILE_HOSTNAMES fehlt')
      return unavailable(c)
    }

    return signupPage(c, workshop, renderSignupForm(workshop, { siteKey: turnstile.siteKey }))
  }

  const { workshops, failed } = await loadWorkshops(c.env.TALLY_TOKEN)
  if (failed) return unavailable(c)

  const workshop = workshops.find((entry) => entry.id === c.req.param('id'))
  if (!workshop) return c.notFound()

  return signupPage(c, workshop, renderSignup(workshop))
})

/**
 * Anmeldung absenden (nur SIGNUP_BACKEND=d1).
 *
 * Reihenfolge: Termin, Formular, Turnstile, dann der Platz-Check in der D1.
 * Turnstile kommt erst nach dem Formular, weil ein Token nur einmal gilt — bei
 * einem Tippfehler im Formular wäre es sonst verbraucht, ohne dass etwas
 * gespeichert wurde.
 *
 * Danach ein Redirect (Post/Redirect/Get): Neuladen der Danke-Seite schickt
 * nichts ein zweites Mal.
 */
app.post('/anmeldung/:id', async (c) => {
  if (!usesDatabase(c.env)) return c.notFound()

  const workshop = await databaseWorkshop(c)
  if (workshop === 'failed') return unavailable(c)
  if (!workshop) return c.notFound()

  const turnstile = turnstileConfig(c.env)
  if (!turnstile) return unavailable(c)

  const render = (options: Omit<SignupFormOptions, 'siteKey'>, status: 200 | 409 | 422) =>
    signupPage(c, workshop, renderSignupForm(workshop, { ...options, siteKey: turnstile.siteKey }), status)

  // Ausgebucht, seit die Seite geladen wurde: renderSignupForm zeigt den Hinweis.
  if (!workshop.freeSpots) return render({}, 409)

  const body = await c.req.parseBody()
  const form = parseSignupForm(body, { workshopId: workshop.id, maxPersons: workshop.freeSpots })

  if (!form.ok) return render({ values: form.values, errors: form.errors }, 422)

  // Die Eingaben, falls das Formular nochmals erscheint.
  const values = Object.fromEntries(SIGNUP_FIELDS.map((name) => [name, field(body, name)]))
  const token = field(body, TOKEN_FIELD)
  const ip = c.req.header('cf-connecting-ip') ? clientIp(c) : null

  if (!(await verifyTurnstile(turnstile, token, ip, SIGNUP_ACTION))) {
    return render(
      {
        values,
        errors: {
          turnstile: token
            ? 'Die Prüfung, ob hier ein Mensch anmeldet, hat nicht geklappt. Bitte nochmals absenden.'
            : 'Die Prüfung, ob hier ein Mensch anmeldet, fehlt. Sie braucht JavaScript — bitte einschalten oder kurz warten, bis das Feld erscheint.',
        },
      },
      422,
    )
  }

  const result = await insertSignup(c.env.DB, form.value, todayInZurich())

  if (!result.ok) {
    // Jemand war schneller. Mit den aktuellen Plätzen neu zeigen, nicht mit denen
    // vom Laden der Seite.
    const fresh = await databaseWorkshop(c)
    if (fresh === 'failed') return unavailable(c)
    if (!fresh) return c.notFound()

    const seats =
      !fresh.freeSpots
        ? 'Inzwischen ist dieser Termin ausgebucht.'
        : fresh.freeSpots === 1
          ? 'Inzwischen ist nur noch 1 Platz frei.'
          : `Inzwischen sind nur noch ${fresh.freeSpots} Plätze frei.`

    return signupPage(
      c,
      fresh,
      renderSignupForm(fresh, { values: { ...values, persons: '1' }, errors: { seats }, siteKey: turnstile.siteKey }),
      409,
    )
  }

  // Mitteilung an Naira im Hintergrund: die Besucherin wartet nicht auf den
  // Push-Dienst, und ein Fehler dort kostet keine Anmeldung — sie steht schon
  // in der D1 und im Admin als neu.
  await inBackground(
    c,
    notifyAdmin(c.env, newSignupMessage(workshop, form.value, result.id)).catch((error) => {
      console.error('Push: Mitteilung zur Anmeldung fehlgeschlagen', error)
    }),
  )

  return c.redirect(`${signupPath(workshop.id)}/danke`, 303)
})

/** Bestätigung nach der Anmeldung. Ohne Personendaten in der Adresse — nur der Termin. */
app.get('/anmeldung/:id/danke', async (c) => {
  if (!usesDatabase(c.env)) return c.notFound()

  const workshop = await databaseWorkshop(c)
  if (workshop === 'failed') return unavailable(c)
  if (!workshop) return c.notFound()

  return c.html(
    layout(
      {
        title: `Danke für deine Anmeldung — ${BUSINESS.name}`,
        description: `Anmeldung zum Tufting-Workshop am ${formatWorkshopDate(workshop.date)}.`,
        canonical: `${originOf(c.req.url)}${signupPath(workshop.id)}`,
        noindex: true,
      },
      renderThanks(workshop),
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
 * Die festen Seiten, und mit SIGNUP_BACKEND=d1 auch die Anmeldeseiten: dort
 * kostet das eine einzige Abfrage. Aus Tally kommen sie nicht hinein — das
 * hiesse, bei jedem Abruf der Sitemap die Tally-API zu befragen, die bei 100
 * Anfragen pro Minute dichtmacht. Gefunden werden sie dann über die Links auf
 * der Startseite.
 */
const SITEMAP_PATHS = ['/', '/impressum', '/datenschutz']

async function signupPaths(env: Env): Promise<string[]> {
  if (!usesDatabase(env)) return []

  try {
    const rows = await listPublishedWorkshops(env.DB, todayInZurich())
    return rows.map((row) => signupPath(row.id))
  } catch (error) {
    // Ohne Anmeldeseiten ist die Sitemap immer noch richtig, nur kürzer.
    console.error('D1: Anmeldeseiten für die Sitemap nicht ladbar', error)
    return []
  }
}

app.get('/sitemap.xml', async (c) => {
  const origin = originOf(c.req.url)
  const paths = [...SITEMAP_PATHS, ...(await signupPaths(c.env))]
  const urls = paths.map((path) => `  <url><loc>${origin}${path}</loc></url>`).join('\n')

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
