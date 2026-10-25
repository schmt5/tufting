/**
 * Admin unter /admin: Login, Termine, Anmeldungen. Eine eigene Hono-Instanz,
 * in index.ts gemountet — so gelten die Middlewares unten nur hier.
 *
 * Alle Formulare sind normale POSTs mit Redirect danach (Post/Redirect/Get):
 * ein Neuladen schickt nichts doppelt ab. Routen und Begründungen in plan.md
 * §3 und §6.
 */

import { type Context, Hono } from 'hono'
import { csrf } from 'hono/csrf'
import { html } from 'hono/html'
import { HTTPException } from 'hono/http-exception'
import {
  adminSecrets,
  clientIp,
  endSession,
  hasSession,
  isLockedOut,
  LOCKOUT_SECONDS,
  passwordMatches,
  startSession,
} from './auth.ts'
import {
  cancelSignup,
  clearLoginFailures,
  countNewSignups,
  createWorkshop,
  deletePushSubscription,
  deleteSignup,
  deleteTemplate,
  getSignup,
  getTemplate,
  getWorkshop,
  insertAdminSignup,
  listPastWorkshops,
  listPushSubscriptions,
  listSignups,
  listUpcomingWorkshops,
  markContacted,
  nowSeconds,
  recordLoginFailure,
  savePushSubscription,
  saveTemplate,
  updateWorkshop,
  type WorkshopWithSeats,
} from './db.ts'
import type { Env } from './env.ts'
import { icsFilename } from './ics.ts'
import { notifyAdmin } from './notify.ts'
import { isPlausibleSubscription, vapidConfig } from './push.ts'
import {
  field,
  type FieldErrors,
  MAX_CAPACITY,
  parseSignupForm,
  parseTemplateForm,
  parseWorkshopForm,
  WORKSHOP_FIELDS,
} from './forms.ts'
import { originOf } from './seo.ts'
import { WORKSHOP } from './site.ts'
import {
  calendarPath,
  CONFIRMATION,
  DEFAULT_TEMPLATE,
  signupMail,
  type Template,
  unknownPlaceholders,
} from './template.ts'
import { weekdayDate } from './views/admin/format.ts'
import { adminLayout } from './views/admin/layout.ts'
import { renderNotifications } from './views/admin/notifications.ts'
import { renderTemplateForm } from './views/admin/template.ts'
import { renderLogin, renderNotConfigured } from './views/admin/login.ts'
import { renderOverview, workshopPath } from './views/admin/overview.ts'
import {
  type MailContext,
  type ManualSignupOptions,
  renderWorkshop,
  renderWorkshopForm,
} from './views/admin/workshop.ts'
import type { Html } from './views/layout.ts'
import { todayInZurich } from './workshops.ts'

type AdminContext = Context<{ Bindings: Env }>

const LOGIN_PATH = '/admin/login'

/** So viele vergangene Termine zeigt die Übersicht. */
const PAST_LIMIT = 10

/**
 * Rückmeldungen nach einer Aktion. Im Redirect steht nur der Schlüssel, nie
 * der Text — sonst liesse sich über einen Link beliebiger Text in den Admin
 * schreiben.
 */
const FLASH: Record<string, string> = {
  angelegt: 'Termin angelegt.',
  gespeichert: 'Termin gespeichert.',
  eingetragen: 'Anmeldung eingetragen.',
  geschrieben: 'Als geschrieben markiert.',
  storniert: 'Anmeldung storniert, die Plätze sind wieder frei.',
  geloescht: 'Anmeldung gelöscht.',
  'test-gesendet': 'Testmitteilung gesendet. Sie sollte in wenigen Sekunden ankommen.',
  'test-fehler': 'Die Testmitteilung kam nicht an. Die Ursache steht in den Logs.',
  'test-keine': 'Kein Gerät angemeldet.',
  'geraet-entfernt': 'Gerät entfernt.',
  'vorlage-gespeichert': 'Vorlage gespeichert.',
  'vorlage-zurueckgesetzt': 'Der Standardtext gilt wieder.',
}

function flash(c: AdminContext): string | null {
  return FLASH[c.req.query('meldung') ?? ''] ?? null
}

function page(c: AdminContext, title: string, content: Html, status: 200 | 401 | 404 | 409 | 422 | 429 | 503 = 200) {
  return c.html(adminLayout({ title, flash: flash(c), signedIn: c.req.path !== LOGIN_PATH }, content), status)
}

function notFound(c: AdminContext) {
  return page(c, 'Nicht gefunden', html`<p class="note">Diesen Eintrag gibt es nicht (mehr).</p>`, 404)
}

const admin = new Hono<{ Bindings: Env }>()

// Personendaten gehören in keinen Cache und in keinen Index — auch nicht
// Antworten ohne HTML, die das Meta-Tag nicht hätten.
admin.use('*', async (c, next) => {
  await next()
  c.res.headers.set('Cache-Control', 'no-store')
  c.res.headers.set('X-Robots-Tag', 'noindex, nofollow')
})

// Lehnt POSTs ab, die nicht von dieser Seite kommen (Origin / Sec-Fetch-Site).
admin.use('*', csrf())

// Ohne Secrets kein Admin. Geprüft vor dem Login, damit ein leeres Passwort
// nie „eingeloggt“ heissen kann.
admin.use('*', async (c, next) => {
  if (!adminSecrets(c.env)) {
    return c.html(adminLayout({ title: 'Nicht eingerichtet', signedIn: false }, renderNotConfigured()), 503)
  }
  await next()
})

// Alles ausser dem Login braucht eine Session.
admin.use('*', async (c, next) => {
  if (c.req.path === LOGIN_PATH) return next()

  const secrets = adminSecrets(c.env)
  if (!secrets || !(await hasSession(c, secrets, nowSeconds()))) {
    // 303 auch für GET: nach einem POST ohne Session soll der Browser den
    // Login mit GET laden, nicht das Formular erneut senden.
    return c.redirect(LOGIN_PATH, 303)
  }
  await next()
})

admin.get('/login', async (c) => {
  const secrets = adminSecrets(c.env)
  if (secrets && (await hasSession(c, secrets, nowSeconds()))) return c.redirect('/admin', 303)

  return page(c, 'Anmelden', renderLogin())
})

admin.post('/login', async (c) => {
  const secrets = adminSecrets(c.env)
  if (!secrets) return notFound(c)

  const ip = clientIp(c)
  const now = nowSeconds()
  const lockedMinutes = LOCKOUT_SECONDS / 60

  // Gesperrt heisst gesperrt — auch das richtige Passwort wird dann nicht geprüft.
  if (await isLockedOut(c.env.DB, ip, now)) {
    return page(c, 'Anmelden', renderLogin({ lockedMinutes }), 429)
  }

  const body = await c.req.parseBody()

  if (await passwordMatches(field(body, 'password'), secrets)) {
    await clearLoginFailures(c.env.DB, ip)
    await startSession(c, secrets, now)
    return c.redirect('/admin', 303)
  }

  await recordLoginFailure(c.env.DB, ip, now)

  if (await isLockedOut(c.env.DB, ip, now)) {
    return page(c, 'Anmelden', renderLogin({ lockedMinutes }), 429)
  }

  return page(c, 'Anmelden', renderLogin({ error: 'Das Passwort stimmt nicht.' }), 401)
})

admin.post('/logout', (c) => {
  endSession(c)
  return c.redirect(LOGIN_PATH, 303)
})

admin.get('/', async (c) => {
  const today = todayInZurich()
  const [upcoming, past, newCounts] = await Promise.all([
    listUpcomingWorkshops(c.env.DB, today),
    listPastWorkshops(c.env.DB, today, PAST_LIMIT),
    countNewSignups(c.env.DB),
  ])

  return page(c, 'Termine', renderOverview(upcoming, past, newCounts))
})

admin.get('/workshops/neu', (c) => {
  const today = todayInZurich()
  // Beginn und Ende bleiben leer, bis es eine übliche Zeit gibt (plan.md §13).
  const values = { date: '', start_time: '', end_time: '', capacity: String(WORKSHOP.maxAttendees), note: '', status: 'published' }

  return page(c, 'Neuer Termin', renderWorkshopForm({ values, today }))
})

admin.post('/workshops', async (c) => {
  const today = todayInZurich()
  const result = parseWorkshopForm(await c.req.parseBody(), { today, isNew: true })

  if (!result.ok) {
    return page(c, 'Neuer Termin', renderWorkshopForm({ values: result.values, errors: result.errors, today }), 422)
  }

  const id = await createWorkshop(c.env.DB, result.value)
  return c.redirect(`${workshopPath(id)}?meldung=angelegt`, 303)
})

/** Die eigene Fassung der Vorlage, sonst der Standardtext. */
async function currentTemplate(db: D1Database): Promise<Template> {
  return (await getTemplate(db, CONFIRMATION)) ?? DEFAULT_TEMPLATE
}

async function showWorkshop(c: AdminContext, workshop: WorkshopWithSeats, manual: ManualSignupOptions = {}, status: 200 | 409 | 422 = 200) {
  const [signups, template] = await Promise.all([listSignups(c.env.DB, workshop.id), currentTemplate(c.env.DB)])
  const origin = originOf(c.req.url)

  const context: MailContext = {
    mails: new Map(signups.map((signup) => [signup.id, signupMail(template, workshop, signup, origin)])),
    calendarUrl: `${origin}${calendarPath(workshop.id)}`,
    calendarFilename: icsFilename(workshop.date),
  }

  return page(c, `Termin ${weekdayDate(workshop.date)}`, renderWorkshop(workshop, signups, context, manual), status)
}

admin.get('/workshops/:id', async (c) => {
  const workshop = await getWorkshop(c.env.DB, c.req.param('id'))
  return workshop ? showWorkshop(c, workshop) : notFound(c)
})

admin.get('/workshops/:id/bearbeiten', async (c) => {
  const workshop = await getWorkshop(c.env.DB, c.req.param('id'))
  if (!workshop) return notFound(c)

  const values = Object.fromEntries(
    WORKSHOP_FIELDS.map((name) => [name, String(workshop[name as keyof WorkshopWithSeats] ?? '')]),
  )

  return page(c, 'Termin bearbeiten', renderWorkshopForm({ workshop, values, today: todayInZurich() }))
})

admin.post('/workshops/:id', async (c) => {
  const workshop = await getWorkshop(c.env.DB, c.req.param('id'))
  if (!workshop) return notFound(c)

  const today = todayInZurich()
  const result = parseWorkshopForm(await c.req.parseBody(), { today, isNew: false, booked: workshop.booked })

  if (!result.ok) {
    return page(
      c,
      'Termin bearbeiten',
      renderWorkshopForm({ workshop, values: result.values, errors: result.errors, today }),
      422,
    )
  }

  await updateWorkshop(c.env.DB, workshop.id, result.value)
  return c.redirect(`${workshopPath(workshop.id)}?meldung=gespeichert`, 303)
})

admin.post('/anmeldungen', async (c) => {
  const body = await c.req.parseBody()
  const workshop = await getWorkshop(c.env.DB, field(body, 'workshop_id'))
  if (!workshop) return notFound(c)

  const overbook = field(body, 'overbook') === '1'
  const result = parseSignupForm(body, { workshopId: workshop.id, maxPersons: MAX_CAPACITY })

  if (!result.ok) {
    return showWorkshop(c, workshop, { values: { ...result.values, overbook: overbook ? '1' : '' }, errors: result.errors, open: true }, 422)
  }

  const inserted = await insertAdminSignup(c.env.DB, result.value, { overbook })

  if (!inserted.ok) {
    const errors: FieldErrors = {
      seats:
        workshop.status === 'cancelled'
          ? 'Der Termin ist abgesagt und nimmt keine Anmeldungen mehr an.'
          : `Dafür ist nicht genug Platz frei (noch ${workshop.free}). Um bewusst zu überbuchen, das Häkchen unten setzen.`,
    }
    const values = Object.fromEntries(Object.entries(body).map(([key, value]) => [key, typeof value === 'string' ? value : '']))
    return showWorkshop(c, workshop, { values, errors, open: true }, 409)
  }

  return c.redirect(`${workshopPath(workshop.id)}?meldung=eingetragen#anmeldung-${inserted.id}`, 303)
})

/**
 * Die Aktionen auf einer Anmeldung führen alle zurück auf ihren Termin, an
 * die Stelle der Anmeldung — Naira soll nicht suchen müssen, wo sie war.
 */
const SIGNUP_ACTIONS = {
  kontaktiert: { run: markContacted, flash: 'geschrieben', anchor: true },
  storniert: { run: cancelSignup, flash: 'storniert', anchor: true },
  loeschen: { run: deleteSignup, flash: 'geloescht', anchor: false },
} as const

admin.post('/anmeldungen/:id/:action', async (c) => {
  const action = SIGNUP_ACTIONS[c.req.param('action') as keyof typeof SIGNUP_ACTIONS]
  if (!action) return notFound(c)

  const signup = await getSignup(c.env.DB, c.req.param('id'))
  if (!signup) return notFound(c)

  await action.run(c.env.DB, signup.id)

  const anchor = action.anchor ? `#anmeldung-${signup.id}` : '#anmeldungen'
  return c.redirect(`${workshopPath(signup.workshop_id)}?meldung=${action.flash}${anchor}`, 303)
})

/** Beispielwerte für die Vorschau der Vorlage. */
const PREVIEW = {
  workshop: { id: 'beispiel', date: '2026-11-28', start_time: '10:00', end_time: '17:00' },
  signup: { first_name: 'Mia', last_name: 'Beispiel', email: 'mia@example.com', persons: 2 },
}

function templatePage(
  c: AdminContext,
  values: Template,
  options: { isDefault: boolean; errors?: FieldErrors },
  status: 200 | 422 = 200,
) {
  const preview = signupMail(values, PREVIEW.workshop, PREVIEW.signup, originOf(c.req.url))
  const unknown = unknownPlaceholders(`${values.subject}\n${values.body}`)

  return page(c, 'E-Mail-Vorlage', renderTemplateForm({ values, preview, unknown, ...options }), status)
}

admin.get('/vorlage', async (c) => {
  const saved = await getTemplate(c.env.DB, CONFIRMATION)
  return templatePage(c, saved ?? DEFAULT_TEMPLATE, { isDefault: !saved })
})

admin.post('/vorlage', async (c) => {
  const result = parseTemplateForm(await c.req.parseBody())

  if (!result.ok) {
    const values = { subject: result.values.subject ?? '', body: result.values.body ?? '' }
    return templatePage(c, values, { isDefault: false, errors: result.errors }, 422)
  }

  await saveTemplate(c.env.DB, CONFIRMATION, result.value)
  return c.redirect('/admin/vorlage?meldung=vorlage-gespeichert', 303)
})

admin.post('/vorlage/zuruecksetzen', async (c) => {
  await deleteTemplate(c.env.DB, CONFIRMATION)
  return c.redirect('/admin/vorlage?meldung=vorlage-zurueckgesetzt', 303)
})

admin.get('/mitteilungen', async (c) => {
  const devices = await listPushSubscriptions(c.env.DB)
  return page(c, 'Mitteilungen', renderNotifications(devices, vapidConfig(c.env)?.publicKey ?? null))
})

/** Länger braucht kein Gerätename, und alles darüber ist kein Gerätename. */
const MAX_LABEL_LENGTH = 60

/**
 * Ein Gerät anmelden. Kommt als JSON von /admin/admin.js, nicht als Formular —
 * deshalb greift csrf() hier nicht. Ein fremdes Formular kann diesen Request
 * aber gar nicht stellen: JSON braucht einen CORS-Preflight, und das
 * Session-Cookie (SameSite=Lax) geht bei einem fremden POST nicht mit.
 */
admin.post('/push', async (c) => {
  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'kein JSON' }, 400)
  }

  const { endpoint, keys, label } = (body ?? {}) as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown }; label?: unknown }
  const subscription = { endpoint, p256dh: keys?.p256dh, auth: keys?.auth }

  if (!isPlausibleSubscription(subscription)) return c.json({ error: 'ungültige Subscription' }, 400)

  await savePushSubscription(c.env.DB, {
    ...subscription,
    label: typeof label === 'string' && label.trim() ? label.trim().slice(0, MAX_LABEL_LENGTH) : null,
  })
  return c.body(null, 204)
})

admin.post('/push/test', async (c) => {
  const result = await notifyAdmin(c.env, {
    title: 'Testmitteilung',
    body: 'So sieht eine Mitteilung bei einer neuen Anmeldung aus.',
    url: '/admin/mitteilungen',
  })

  const key = result.sent > 0 ? 'test-gesendet' : result.failed > 0 ? 'test-fehler' : 'test-keine'
  return c.redirect(`/admin/mitteilungen?meldung=${key}`, 303)
})

admin.post('/push/entfernen', async (c) => {
  await deletePushSubscription(c.env.DB, field(await c.req.parseBody(), 'endpoint'))
  return c.redirect('/admin/mitteilungen?meldung=geraet-entfernt', 303)
})

// Fehler (z.B. Datenbank nicht erreichbar) als Seite des Admins statt als
// nacktes „Internal Server Error“. Die Ursache steht in den Logs.
admin.onError((error, c) => {
  // Gewollte Antworten wie die 403 von csrf() bleiben, was sie sind.
  if (error instanceof HTTPException) return error.getResponse()

  console.error('Admin: Fehler bei', c.req.method, c.req.path, error)
  return c.html(
    adminLayout(
      { title: 'Fehler', signedIn: false },
      html`<div class="prose prose--narrow">
        <h1 class="page-title">Etwas ist schiefgelaufen</h1>
        <p>Die Aktion konnte nicht ausgeführt werden. Bitte später nochmals versuchen.</p>
        <p><a href="/admin">Zurück zur Übersicht</a></p>
      </div>`,
    ),
    500,
  )
})

// Unbekannte Admin-Adressen bekommen die 404 des Admins statt der öffentlichen
// Seite. Als Route statt admin.notFound(): eine gemountete Instanz fällt sonst
// auf den notFound-Handler der äusseren App zurück.
admin.all('*', notFound)

export default admin
