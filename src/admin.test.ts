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
  listPushSubscriptions,
  listSignups,
  savePushSubscription,
  type WorkshopInput,
} from './db.ts'
import type { Env } from './env.ts'
import { app } from './index.ts'
import { resetDatabase, testDatabase, testDeviceKeys, testVapidKeys } from './test-support.ts'

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
    ...(await testVapidKeys()),
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

describe('Mitteilungen', () => {
  function postJson(path: string, body: unknown, cookie: string) {
    return app.request(
      path,
      { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify(body) },
      env,
    )
  }

  it('meldet ein Gerät an und zeigt es in der Liste', async () => {
    const cookie = await login()
    const keys = await testDeviceKeys()

    const res = await postJson('/admin/push', { endpoint: 'https://web.push.apple.com/abc', keys, label: 'iPhone' }, cookie)
    assert.equal(res.status, 204)

    const [device] = await listPushSubscriptions(env.DB)
    assert.equal(device?.label, 'iPhone')

    const text = await (await request('/admin/mitteilungen', { cookie })).text()
    assert.match(text, /iPhone/)
    assert.match(text, /data-vapid-key="[A-Za-z0-9_-]{87}"/)
  })

  it('nimmt keine unbrauchbaren Subscriptions an', async () => {
    const cookie = await login()
    const keys = await testDeviceKeys()

    assert.equal((await postJson('/admin/push', { endpoint: 'http://unsicher.example/abc', keys }, cookie)).status, 400)
    assert.equal((await postJson('/admin/push', { endpoint: 'https://push.example/abc' }, cookie)).status, 400)
    assert.deepEqual(await listPushSubscriptions(env.DB), [])
  })

  it('lässt ohne Session niemanden ein Gerät anmelden', async () => {
    const keys = await testDeviceKeys()
    const res = await postJson('/admin/push', { endpoint: 'https://push.example/abc', keys }, '')

    assert.equal(res.status, 303)
    assert.deepEqual(await listPushSubscriptions(env.DB), [])
  })

  it('schickt eine Testmitteilung und räumt abgemeldete Geräte weg', async () => {
    const cookie = await login()
    await savePushSubscription(env.DB, { endpoint: 'https://push.example/aktiv', ...(await testDeviceKeys()), label: 'Mac' })
    await savePushSubscription(env.DB, { endpoint: 'https://push.example/weg', ...(await testDeviceKeys()), label: 'Alt' })

    const fetchMock = mock.method(globalThis, 'fetch', async (url: string) =>
      new Response(null, { status: url.endsWith('/weg') ? 410 : 201 }),
    )

    const res = await request('/admin/push/test', { form: {}, cookie })
    assert.match(res.headers.get('location') ?? '', /meldung=test-gesendet/)
    assert.equal(fetchMock.mock.callCount(), 2)
    assert.deepEqual((await listPushSubscriptions(env.DB)).map((device) => device.label), ['Mac'])
  })

  it('sagt es, wenn kein Gerät angemeldet ist', async () => {
    const res = await request('/admin/push/test', { form: {}, cookie: await login() })
    assert.match(res.headers.get('location') ?? '', /meldung=test-keine/)
  })

  it('entfernt ein Gerät', async () => {
    const cookie = await login()
    await savePushSubscription(env.DB, { endpoint: 'https://push.example/1', ...(await testDeviceKeys()), label: null })

    await request('/admin/push/entfernen', { form: { endpoint: 'https://push.example/1' }, cookie })
    assert.deepEqual(await listPushSubscriptions(env.DB), [])
  })

  it('zeigt ohne VAPID-Schlüssel, was fehlt, statt eines Knopfs', async () => {
    const cookie = await login()
    const saved = env
    env = { ...env, VAPID_PRIVATE_KEY: '' }
    try {
      const text = await (await request('/admin/mitteilungen', { cookie })).text()
      assert.match(text, /nicht eingerichtet/)
      assert.doesNotMatch(text, /data-push-enable/)
    } finally {
      env = saved
    }
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
    assert.match(text, new RegExp(`data-share-ics="http://localhost/termin/${id}\\.ics"`))
  })
})
