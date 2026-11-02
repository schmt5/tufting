/**
 * Der Admin von aussen, über echte Requests an die App und eine lokale D1:
 * Login, Sperre, CSRF, Termine und Anmeldungen.
 */

import assert from 'node:assert/strict'
import { after, afterEach, before, beforeEach, describe, it, mock } from 'node:test'
import type { PlatformProxy } from 'wrangler'
import { MAX_LOGIN_FAILURES } from './auth.ts'
import {
  createWorkshop,
  getSignup,
  getWorkshop,
  insertSignup,
  listSignups,
  type WorkshopInput,
} from './db.ts'
import type { Env } from './env.ts'
import { app } from './index.ts'
import { resetDatabase, testDatabase } from './test-support.ts'

const PASSWORD = 'test-passwort-nur-fuer-die-tests'
const ORIGIN = 'http://localhost'
/** Weit genug in der Zukunft, dass kein Testdatum je vergangen ist. */
const DATE = '2099-01-10'

let proxy: PlatformProxy<{ DB: D1Database }>
let env: Env

interface RequestOptions {
  method?: 'GET' | 'POST'
  form?: Record<string, string>
  cookie?: string
  origin?: string | null
  ip?: string
}

function request(path: string, options: RequestOptions = {}) {
  const headers: Record<string, string> = {}
  if (options.cookie) headers.cookie = options.cookie
  if (options.ip) headers['cf-connecting-ip'] = options.ip

  let body: URLSearchParams | undefined
  if (options.form) {
    body = new URLSearchParams(options.form)
    headers['content-type'] = 'application/x-www-form-urlencoded'
    if (options.origin !== null) headers.origin = options.origin ?? ORIGIN
  }

  return app.request(path, { method: options.method ?? (options.form ? 'POST' : 'GET'), headers, body }, env)
}

async function login(): Promise<string> {
  const res = await request('/admin/login', { form: { password: PASSWORD } })
  assert.equal(res.status, 303)
  const cookie = res.headers.get('set-cookie')?.split(';')[0]
  assert.ok(cookie)
  return cookie
}

function workshopForm(overrides: Record<string, string> = {}): Record<string, string> {
  return { date: DATE, start_time: '10:00', end_time: '17:00', capacity: '4', note: '', status: 'published', ...overrides }
}

/** Derselbe Termin, direkt in die Datenbank statt über das Formular. */
function workshopInput(capacity: number): WorkshopInput {
  return { date: DATE, start_time: '10:00', end_time: '17:00', capacity, note: null, status: 'published' }
}

function signupForm(workshopId: string, overrides: Record<string, string> = {}): Record<string, string> {
  return {
    workshop_id: workshopId,
    first_name: 'Lisa',
    last_name: 'Muster',
    email: 'lisa@example.com',
    persons: '1',
    comment: '',
    ...overrides,
  }
}

before(async () => {
  proxy = await testDatabase()
  env = {
    DB: proxy.env.DB,
    ADMIN_PASSWORD: PASSWORD,
    SESSION_SECRET: 'k'.repeat(40),
  }
})

afterEach(() => {
  mock.restoreAll()
})

after(async () => {
  await proxy.dispose()
})

beforeEach(async () => {
  await resetDatabase(env.DB)
})

describe('Zugang', () => {
  it('schickt ohne Session auf den Login', async () => {
    const res = await request('/admin')
    assert.equal(res.status, 303)
    assert.equal(res.headers.get('location'), '/admin/login')
  })

  it('bleibt ohne Secrets zu, auch für den Login', async () => {
    const saved = env
    env = { ...env, ADMIN_PASSWORD: '' }
    try {
      assert.equal((await request('/admin/login')).status, 503)
      assert.equal((await request('/admin/login', { form: { password: '' } })).status, 503)
    } finally {
      env = saved
    }
  })

  it('lässt mit dem richtigen Passwort hinein', async () => {
    const res = await request('/admin', { cookie: await login() })
    assert.equal(res.status, 200)
    assert.match(await res.text(), /Termine/)
  })

  it('weist ein falsches Passwort ab', async () => {
    const res = await request('/admin/login', { form: { password: 'falsch' } })
    assert.equal(res.status, 401)
    assert.equal(res.headers.get('set-cookie'), null)
    assert.match(await res.text(), /Das Passwort stimmt nicht/)
  })

  it('sperrt nach zu vielen Fehlversuchen, auch für das richtige Passwort', async () => {
    const ip = '203.0.113.7'
    for (let attempt = 1; attempt < MAX_LOGIN_FAILURES; attempt++) {
      assert.equal((await request('/admin/login', { form: { password: 'falsch' }, ip })).status, 401)
    }
    assert.equal((await request('/admin/login', { form: { password: 'falsch' }, ip })).status, 429)
    assert.equal((await request('/admin/login', { form: { password: PASSWORD }, ip })).status, 429)

    // Eine andere IP ist davon nicht betroffen.
    assert.equal((await request('/admin/login', { form: { password: PASSWORD }, ip: '203.0.113.8' })).status, 303)
  })

  it('setzt die Fehlversuche nach einem erfolgreichen Login zurück', async () => {
    const ip = '203.0.113.9'
    for (let attempt = 1; attempt < MAX_LOGIN_FAILURES; attempt++) {
      await request('/admin/login', { form: { password: 'falsch' }, ip })
    }
    assert.equal((await request('/admin/login', { form: { password: PASSWORD }, ip })).status, 303)
    assert.equal((await request('/admin/login', { form: { password: 'falsch' }, ip })).status, 401)
  })

  it('verwirft ein verfälschtes Cookie', async () => {
    const cookie = (await login()).replace(/=(\d+)\./, '=9999999999.')
    assert.equal((await request('/admin', { cookie })).status, 303)
  })

  it('beendet die Session beim Abmelden', async () => {
    const res = await request('/admin/logout', { form: {}, cookie: await login() })
    assert.equal(res.status, 303)
    assert.match(res.headers.get('set-cookie') ?? '', /__Host-session=;.*Max-Age=0/)
  })

  it('lehnt Formulare von fremden Seiten ab', async () => {
    const cookie = await login()
    const foreign = await request('/admin/workshops', { form: workshopForm(), cookie, origin: 'https://boese.example' })
    const missing = await request('/admin/workshops', { form: workshopForm(), cookie, origin: null })

    assert.equal(foreign.status, 403)
    assert.equal(missing.status, 403)
  })

  it('zeigt einen Datenbankfehler als Fehlerseite des Admins', async () => {
    const cookie = await login()
    const saved = env
    const broken = { prepare: () => { throw new Error('D1 nicht erreichbar') } } as unknown as D1Database
    env = { ...env, DB: broken }

    // Der Fehler wird absichtlich geloggt; im Testlauf soll er nicht stören.
    const original = console.error
    console.error = () => {}
    try {
      const res = await request('/admin', { cookie })
      assert.equal(res.status, 500)
      assert.match(await res.text(), /Etwas ist schiefgelaufen/)
    } finally {
      console.error = original
      env = saved
    }
  })

  it('verbietet Caches und Suchmaschinen', async () => {
    const res = await request('/admin', { cookie: await login() })
    assert.equal(res.headers.get('cache-control'), 'no-store')
    assert.equal(res.headers.get('x-robots-tag'), 'noindex, nofollow')
  })

  it('antwortet auf unbekannte Admin-Adressen mit der 404 des Admins', async () => {
    const res = await request('/admin/gibtsnicht', { cookie: await login() })
    assert.equal(res.status, 404)
    assert.match(await res.text(), /Admin/)
  })
})

describe('Termine', () => {
  it('legt einen Termin an und zeigt ihn', async () => {
    const cookie = await login()
    const res = await request('/admin/workshops', { form: workshopForm(), cookie })

    assert.equal(res.status, 303)
    const location = res.headers.get('location') ?? ''
    assert.match(location, /^\/admin\/workshops\/[a-z2-9]{10}\?meldung=angelegt$/)

    const page = await request(location, { cookie })
    const text = await page.text()
    assert.match(text, /Termin angelegt\./)
    assert.match(text, /10:00–17:00/)
  })

  it('zeigt bei Fehlern das Formular mit den Eingaben und Meldungen', async () => {
    const res = await request('/admin/workshops', {
      form: workshopForm({ end_time: '09:00', note: 'Mit <b>Apéro</b>' }),
      cookie: await login(),
    })
    const text = await res.text()

    assert.equal(res.status, 422)
    assert.match(text, /Das Ende muss nach dem Beginn liegen/)
    assert.match(text, /aria-invalid="true"/)
    // Die Eingabe kommt zurück — und zwar escaped.
    assert.match(text, /Mit &lt;b&gt;Apéro&lt;\/b&gt;/)
  })

  it('speichert Änderungen, aber nicht weniger Plätze als gebucht', async () => {
    const cookie = await login()
    const id = await createWorkshop(env.DB, workshopInput(4))
    await insertSignup(env.DB, { workshop_id: id, first_name: 'A', last_name: 'B', email: 'a@b.ch', persons: 3, comment: null }, '2026-01-01')

    const tooSmall = await request(`/admin/workshops/${id}`, { form: workshopForm({ capacity: '2' }), cookie })
    assert.equal(tooSmall.status, 422)

    const ok = await request(`/admin/workshops/${id}`, { form: workshopForm({ capacity: '5', status: 'draft' }), cookie })
    assert.equal(ok.status, 303)

    const saved = await getWorkshop(env.DB, id)
    assert.equal(saved?.capacity, 5)
    assert.equal(saved?.status, 'draft')
  })

  it('zeigt neue Anmeldungen in der Übersicht', async () => {
    const cookie = await login()
    const id = await createWorkshop(env.DB, workshopInput(4))
    await insertSignup(env.DB, { workshop_id: id, first_name: 'A', last_name: 'B', email: 'a@b.ch', persons: 2, comment: null }, '2026-01-01')

    const text = await (await request('/admin', { cookie })).text()
    assert.match(text, /2 von 4 belegt/)
    assert.match(text, /1 neu/)
  })

  it('lädt vergangene Termine erst auf Wunsch', async () => {
    const cookie = await login()
    const past = await createWorkshop(env.DB, { ...workshopInput(4), date: '2020-03-07' })
    const inList = new RegExp(`href="/admin/workshops/${past}"`)

    const plain = await (await request('/admin', { cookie })).text()
    assert.doesNotMatch(plain, inList)
    assert.match(plain, /href="\/admin\?vergangen#vergangen"/)

    const shown = await (await request('/admin?vergangen', { cookie })).text()
    assert.match(shown, inList)
    assert.match(shown, /href="\/admin">Ausblenden/)

    // Ist ein vergangener Termin offen, steht die Liste da, ohne Ausblenden.
    const selected = await (await request(`/admin/workshops/${past}`, { cookie })).text()
    assert.match(selected, new RegExp(`href="/admin/workshops/${past}" aria-current="page"`))
    assert.doesNotMatch(selected, /Ausblenden/)
  })

  it('zeigt im Eingang nur Anmeldungen, denen noch niemand geschrieben hat', async () => {
    const cookie = await login()
    const id = await createWorkshop(env.DB, workshopInput(4))
    await insertSignup(env.DB, { workshop_id: id, first_name: 'Offen', last_name: 'B', email: 'a@b.ch', persons: 1, comment: null }, '2026-01-01')
    await insertSignup(env.DB, { workshop_id: id, first_name: 'Erledigt', last_name: 'B', email: 'c@d.ch', persons: 1, comment: null }, '2026-01-01')
    const done = (await listSignups(env.DB, id)).find((signup) => signup.first_name === 'Erledigt')
    await request(`/admin/anmeldungen/${done?.id}/kontaktiert`, { form: {}, cookie })

    const text = await (await request('/admin', { cookie })).text()
    assert.match(text, /Neue Anmeldungen/)
    assert.match(text, /Offen B/)
    assert.doesNotMatch(text, /Erledigt B/)
  })

  it('sagt im leeren Eingang, dass alles beantwortet ist', async () => {
    const text = await (await request('/admin', { cookie: await login() })).text()
    assert.match(text, /Alles beantwortet/)
  })
})

describe('Anmeldungen', () => {
  async function setup(capacity = 2) {
    const cookie = await login()
    const id = await createWorkshop(env.DB, workshopInput(capacity))
    return { cookie, id }
  }

  it('erfasst eine Anmeldung von Hand', async () => {
    const { cookie, id } = await setup()
    const res = await request('/admin/anmeldungen', { form: signupForm(id), cookie })

    assert.equal(res.status, 303)
    assert.match(res.headers.get('location') ?? '', /meldung=eingetragen#anmeldung-/)
    const [signup] = await listSignups(env.DB, id)
    assert.equal(signup?.source, 'admin')
  })

  it('überbucht nur mit Häkchen', async () => {
    const { cookie, id } = await setup(1)
    await request('/admin/anmeldungen', { form: signupForm(id), cookie })

    const refused = await request('/admin/anmeldungen', { form: signupForm(id), cookie })
    assert.equal(refused.status, 409)
    assert.match(await refused.text(), /nicht genug Platz frei/)

    const forced = await request('/admin/anmeldungen', { form: signupForm(id, { overbook: '1' }), cookie })
    assert.equal(forced.status, 303)
    assert.equal((await getWorkshop(env.DB, id))?.booked, 2)
  })

  it('markiert, storniert und löscht', async () => {
    const { cookie, id } = await setup()
    await request('/admin/anmeldungen', { form: signupForm(id), cookie })
    const [signup] = await listSignups(env.DB, id)
    assert.ok(signup)

    const contacted = await request(`/admin/anmeldungen/${signup.id}/kontaktiert`, { form: {}, cookie })
    assert.equal(contacted.status, 303)
    assert.ok((await getSignup(env.DB, signup.id))?.contacted_at)

    await request(`/admin/anmeldungen/${signup.id}/storniert`, { form: {}, cookie })
    assert.ok((await getSignup(env.DB, signup.id))?.cancelled_at)
    assert.equal((await getWorkshop(env.DB, id))?.booked, 0)

    const deleted = await request(`/admin/anmeldungen/${signup.id}/loeschen`, { form: {}, cookie })
    assert.match(deleted.headers.get('location') ?? '', /meldung=geloescht#anmeldungen$/)
    assert.equal(await getSignup(env.DB, signup.id), null)
  })

  it('führt aus dem Eingang zurück in den Eingang', async () => {
    const { cookie, id } = await setup()
    await request('/admin/anmeldungen', { form: signupForm(id), cookie })
    const [signup] = await listSignups(env.DB, id)

    const res = await request(`/admin/anmeldungen/${signup?.id}/kontaktiert`, { form: { ansicht: 'eingang' }, cookie })
    assert.equal(res.headers.get('location'), `/admin?meldung=geschrieben#eingang-${id}`)

    // Etwas anderes als „eingang“ führt wie bisher auf den Termin, nie anderswohin.
    const other = await request(`/admin/anmeldungen/${signup?.id}/storniert`, { form: { ansicht: 'https://example.com' }, cookie })
    assert.match(other.headers.get('location') ?? '', new RegExp(`^/admin/workshops/${id}\\?`))
  })

  it('kennt keine anderen Aktionen', async () => {
    const { cookie, id } = await setup()
    await request('/admin/anmeldungen', { form: signupForm(id), cookie })
    const [signup] = await listSignups(env.DB, id)

    assert.equal((await request(`/admin/anmeldungen/${signup?.id}/irgendwas`, { form: {}, cookie })).status, 404)
  })

  it('zeigt Namen und Bemerkungen escaped', async () => {
    const { cookie, id } = await setup()
    await request('/admin/anmeldungen', { form: signupForm(id, { first_name: '<script>alert(1)</script>' }), cookie })

    const text = await (await request(`/admin/workshops/${id}`, { cookie })).text()
    assert.doesNotMatch(text, /<script>alert/)
    assert.match(text, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/)
  })
})

describe('E-Mail-Vorlage', () => {
  it('zeigt zuerst den Standardtext mit Vorschau', async () => {
    const text = await (await request('/admin/vorlage', { cookie: await login() })).text()

    assert.match(text, /Noch der Standardtext/)
    assert.match(text, /Hallo Mia/)
    assert.doesNotMatch(text, /Standardtext wiederherstellen/)
  })

  it('speichert die eigene Fassung und warnt vor unbekannten Platzhaltern', async () => {
    const cookie = await login()
    const res = await request('/admin/vorlage', {
      form: { subject: 'Workshop am {datum}', body: 'Hoi {vorname}, {vornahme}' },
      cookie,
    })
    assert.equal(res.status, 303)

    const text = await (await request('/admin/vorlage', { cookie })).text()
    assert.match(text, /Hoi Mia, \{vornahme\}/)
    assert.match(text, /Diese Platzhalter gibt es nicht/)
    assert.match(text, /Standardtext wiederherstellen/)
  })

  it('verlangt Betreff und Text', async () => {
    const res = await request('/admin/vorlage', { form: { subject: '', body: '  ' }, cookie: await login() })
    const text = await res.text()

    assert.equal(res.status, 422)
    assert.match(text, /Bitte einen Betreff angeben/)
    assert.match(text, /Bitte einen Text angeben/)
  })

  it('stellt den Standardtext wieder her', async () => {
    const cookie = await login()
    await request('/admin/vorlage', { form: { subject: 'Eigen', body: 'Eigen' }, cookie })
    await request('/admin/vorlage/zuruecksetzen', { form: {}, cookie })

    assert.match(await (await request('/admin/vorlage', { cookie })).text(), /Noch der Standardtext/)
  })

  it('füllt die Vorlage pro Anmeldung in den mailto-Link', async () => {
    const cookie = await login()
    const id = await createWorkshop(env.DB, workshopInput(4))
    await request('/admin/vorlage', { form: { subject: 'Workshop am {datum}', body: 'Hoi {vorname}\n{kalender}' }, cookie })
    await request('/admin/anmeldungen', { form: signupForm(id, { first_name: 'Mia', email: 'mia@example.com' }), cookie })

    const text = await (await request(`/admin/workshops/${id}`, { cookie })).text()
    const href = /href="(mailto:[^"]+)"[^>]*>E-Mail schreiben/.exec(text)?.[1]?.replaceAll('&amp;', '&')
    assert.ok(href, 'kein E-Mail-Link')

    const link = new URL(href)
    assert.equal(decodeURIComponent(link.pathname), 'mia@example.com')
    assert.equal(link.searchParams.get('subject'), 'Workshop am 10.01.2099')
    assert.equal(link.searchParams.get('body'), `Hoi Mia\r\nhttp://localhost/termin/${id}.ics`)

    assert.match(text, /data-copy="Workshop am 10\.01\.2099/)
    assert.match(text, /data-invite="\/admin\/anmeldungen\/[a-z2-9]{16}\/einladung\.ics"/)
    assert.match(text, /data-mail-to="mia@example\.com"/)
    assert.match(text, /data-mail-subject="Workshop am 10\.01\.2099"/)
  })

  it('bietet pro Anmeldung die Einladung zum Herunterladen an, bei Absage als Absage', async () => {
    const cookie = await login()
    const id = await createWorkshop(env.DB, workshopInput(4))
    await request('/admin/anmeldungen', { form: signupForm(id), cookie })
    const [signup] = await listSignups(env.DB, id)
    const download = new RegExp(
      `href="/admin/anmeldungen/${signup?.id}/einladung\\.ics"\\s+download="einladung-2099-01-10\\.ics"[^>]*>\\s*<svg[^]*?</svg> (\\S+) herunterladen<`,
    )

    const text = await (await request(`/admin/workshops/${id}`, { cookie })).text()
    assert.equal(download.exec(text)?.[1], 'Einladung')
    assert.match(await (await request('/admin', { cookie })).text(), download)

    await request(`/admin/workshops/${id}`, { form: workshopForm({ status: 'cancelled' }), cookie })
    assert.equal(download.exec(await (await request(`/admin/workshops/${id}`, { cookie })).text())?.[1], 'Absage')
  })

  it('liefert pro Anmeldung eine Einladung mit der Person als Gast', async () => {
    const cookie = await login()
    const id = await createWorkshop(env.DB, workshopInput(4))
    await request('/admin/anmeldungen', { form: signupForm(id, { first_name: 'Mia', last_name: 'Beispiel', email: 'mia@example.com' }), cookie })
    const [signup] = await listSignups(env.DB, id)

    const res = await request(`/admin/anmeldungen/${signup?.id}/einladung.ics`, { cookie })
    const text = (await res.text()).replaceAll('\r\n ', '')

    assert.equal(res.status, 200)
    assert.equal(res.headers.get('content-type'), 'text/calendar; charset=utf-8; method=REQUEST')
    assert.match(res.headers.get('content-disposition') ?? '', /attachment; filename="einladung-2099-01-10\.ics"/)
    assert.match(text, /METHOD:REQUEST/)
    assert.match(text, /ORGANIZER;CN="Naira Ramos":mailto:tuftingstudio\.bern@outlook\.com/)
    assert.match(text, /ATTENDEE;CN="Mia Beispiel";[^:]*RSVP=TRUE:mailto:mia@example\.com/)
  })

  it('gibt die Einladung nur mit Login heraus', async () => {
    const cookie = await login()
    const id = await createWorkshop(env.DB, workshopInput(4))
    await request('/admin/anmeldungen', { form: signupForm(id), cookie })
    const [signup] = await listSignups(env.DB, id)

    const res = await request(`/admin/anmeldungen/${signup?.id}/einladung.ics`)
    assert.equal(res.status, 303)
    assert.equal((await request('/admin/anmeldungen/gibtsnicht/einladung.ics', { cookie })).status, 404)
  })
})
