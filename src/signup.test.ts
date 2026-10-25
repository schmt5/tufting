/**
 * Die öffentliche Anmeldung von aussen: echte Requests
 * an die App, eine lokale D1, siteverify durch einen Mock ersetzt.
 */

import assert from 'node:assert/strict'
import { after, afterEach, before, beforeEach, describe, it, mock } from 'node:test'
import type { PlatformProxy } from 'wrangler'
import {
  createWorkshop,
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

const DATE = '2099-01-10'
const HOST = 'localhost'

let proxy: PlatformProxy<{ DB: D1Database }>
let env: Env

function workshopInput(overrides: Partial<WorkshopInput> = {}): WorkshopInput {
  return { date: DATE, start_time: '10:00', end_time: '17:00', capacity: 4, note: null, status: 'published', ...overrides }
}

function signupForm(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    first_name: 'Lisa',
    last_name: 'Muster',
    email: 'lisa@example.com',
    persons: '1',
    comment: '',
    'cf-turnstile-response': 'token',
    ...overrides,
  }
}

function post(path: string, form: Record<string, string>) {
  return app.request(
    path,
    {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(form),
    },
    env,
  )
}

function get(path: string) {
  return app.request(path, {}, env)
}

/**
 * siteverify antwortet mit `answer`. `during` läuft, während der Worker auf
 * die Antwort wartet — so lässt sich eine zweite Anmeldung dazwischenschieben.
 */
function siteverify(answer: object, during?: () => Promise<void>) {
  return mock.method(globalThis, 'fetch', async () => {
    await during?.()
    return new Response(JSON.stringify(answer))
  })
}

const PASSES = { success: true, action: 'signup', hostname: HOST }

before(async () => {
  proxy = await testDatabase()
  env = {
    DB: proxy.env.DB,
    TURNSTILE_SITE_KEY: 'sitekey-test',
    TURNSTILE_SECRET_KEY: 'secret-test',
    TURNSTILE_HOSTNAMES: HOST,
    ...(await testVapidKeys()),
  }
})

after(async () => {
  await proxy.dispose()
})

beforeEach(async () => {
  await resetDatabase(env.DB)
})

afterEach(() => {
  mock.restoreAll()
})

describe('Startseite aus der D1', () => {
  it('zeigt veröffentlichte Termine mit Uhrzeit und Hinweis, Entwürfe nicht', async () => {
    await createWorkshop(env.DB, workshopInput({ note: 'Mit Apéro' }))
    await createWorkshop(env.DB, workshopInput({ date: '2099-02-01', status: 'draft' }))

    const text = await (await get('/')).text()

    assert.match(text, /10\.01\.2099/)
    assert.match(text, /10:00–17:00/)
    assert.match(text, /Mit Apéro/)
    assert.doesNotMatch(text, /01\.02\.2099/)
    assert.match(text, /"startDate":"2099-01-10T10:00:00\+01:00"/)
  })

  it('führt die Anmeldeseiten in der Sitemap', async () => {
    const id = await createWorkshop(env.DB, workshopInput())
    const text = await (await get('/sitemap.xml')).text()

    assert.match(text, new RegExp(`/anmeldung/${id}</loc>`))
  })
})

describe('Anmeldeseite', () => {
  it('zeigt das Formular mit so vielen Personen, wie frei sind, und das Widget', async () => {
    const id = await createWorkshop(env.DB, workshopInput({ capacity: 4 }))
    await insertSignup(env.DB, { workshop_id: id, first_name: 'A', last_name: 'B', email: 'a@b.ch', persons: 1, comment: null }, '2026-01-01')

    const text = await (await get(`/anmeldung/${id}`)).text()

    assert.match(text, /<option value="3"/)
    assert.doesNotMatch(text, /<option value="4"/)
    assert.match(text, /class="cf-turnstile"\s+data-sitekey="sitekey-test"\s+data-action="signup"/)
    assert.match(text, /challenges\.cloudflare\.com\/turnstile\/v0\/api\.js/)
  })

  it('kennt keine Entwürfe und keine unbekannten Termine', async () => {
    const draft = await createWorkshop(env.DB, workshopInput({ status: 'draft' }))

    assert.equal((await get(`/anmeldung/${draft}`)).status, 404)
    assert.equal((await get('/anmeldung/gibtsnicht')).status, 404)
  })

  it('zeigt bei ausgebuchten Terminen den Grund statt des Formulars', async () => {
    const id = await createWorkshop(env.DB, workshopInput({ capacity: 1 }))
    await insertSignup(env.DB, { workshop_id: id, first_name: 'A', last_name: 'B', email: 'a@b.ch', persons: 1, comment: null }, '2026-01-01')

    const text = await (await get(`/anmeldung/${id}`)).text()
    assert.match(text, /ausgebucht/)
    assert.doesNotMatch(text, /<form/)
    assert.doesNotMatch(text, /turnstile\/v0\/api\.js/)
  })

  it('bleibt ohne Turnstile-Konfiguration zu, statt ungeschützt anzunehmen', async () => {
    const id = await createWorkshop(env.DB, workshopInput())
    const saved = env
    env = { ...env, TURNSTILE_SECRET_KEY: '' }
    mock.method(console, 'error', () => {})

    try {
      assert.equal((await get(`/anmeldung/${id}`)).status, 503)
      assert.equal((await post(`/anmeldung/${id}`, signupForm())).status, 503)
    } finally {
      env = saved
    }
    assert.deepEqual(await listSignups(env.DB, id), [])
  })
})

describe('Anmeldung absenden', () => {
  it('speichert die Anmeldung und führt auf die Danke-Seite', async () => {
    const id = await createWorkshop(env.DB, workshopInput())
    siteverify(PASSES)

    const res = await post(`/anmeldung/${id}`, signupForm({ persons: '2', comment: 'Wir freuen uns' }))

    assert.equal(res.status, 303)
    assert.equal(res.headers.get('location'), `/anmeldung/${id}/danke`)

    const [signup] = await listSignups(env.DB, id)
    assert.equal(signup?.persons, 2)
    assert.equal(signup?.source, 'web')
    assert.equal(signup?.comment, 'Wir freuen uns')

    const thanks = await get(`/anmeldung/${id}/danke`)
    const text = await thanks.text()
    assert.equal(thanks.status, 200)
    assert.match(text, /Danke für deine Anmeldung/)
    assert.match(text, /noindex/)
    assert.doesNotMatch(text, /Lisa/)
  })

  it('prüft zuerst das Formular und verbraucht dabei kein Token', async () => {
    const id = await createWorkshop(env.DB, workshopInput())
    const fetchMock = siteverify(PASSES)

    const res = await post(`/anmeldung/${id}`, signupForm({ email: 'kein-at', first_name: '<b>Lisa</b>' }))
    const text = await res.text()

    assert.equal(res.status, 422)
    assert.match(text, /gültige E-Mail-Adresse/)
    assert.match(text, /&lt;b&gt;Lisa&lt;\/b&gt;/)
    assert.equal(fetchMock.mock.callCount(), 0)
  })

  it('nimmt nicht mehr Personen an, als frei sind', async () => {
    const id = await createWorkshop(env.DB, workshopInput({ capacity: 2 }))
    siteverify(PASSES)

    const res = await post(`/anmeldung/${id}`, signupForm({ persons: '3' }))

    assert.equal(res.status, 422)
    assert.deepEqual(await listSignups(env.DB, id), [])
  })

  it('speichert nichts, wenn Turnstile nicht besteht', async () => {
    const id = await createWorkshop(env.DB, workshopInput())
    siteverify({ success: false, 'error-codes': ['invalid-input-response'] })

    const res = await post(`/anmeldung/${id}`, signupForm())

    assert.equal(res.status, 422)
    assert.match(await res.text(), /hat nicht geklappt/)
    assert.deepEqual(await listSignups(env.DB, id), [])
  })

  it('sagt ohne Token, dass die Prüfung JavaScript braucht', async () => {
    const id = await createWorkshop(env.DB, workshopInput())
    siteverify(PASSES)

    const res = await post(`/anmeldung/${id}`, signupForm({ 'cf-turnstile-response': '' }))

    assert.equal(res.status, 422)
    assert.match(await res.text(), /braucht JavaScript/)
  })

  it('meldet es, wenn jemand während der Prüfung den letzten Platz bekommt', async () => {
    const id = await createWorkshop(env.DB, workshopInput({ capacity: 1 }))
    siteverify(PASSES, async () => {
      await insertSignup(env.DB, { workshop_id: id, first_name: 'Schnell', last_name: 'X', email: 'x@y.ch', persons: 1, comment: null }, '2026-01-01')
    })

    const res = await post(`/anmeldung/${id}`, signupForm())

    assert.equal(res.status, 409)
    assert.match(await res.text(), /Inzwischen ist dieser Termin ausgebucht/)
    assert.equal((await getWorkshop(env.DB, id))?.booked, 1)
  })

  it('nimmt für einen inzwischen ausgebuchten Termin nichts mehr an', async () => {
    const id = await createWorkshop(env.DB, workshopInput({ capacity: 1 }))
    await insertSignup(env.DB, { workshop_id: id, first_name: 'A', last_name: 'B', email: 'a@b.ch', persons: 1, comment: null }, '2026-01-01')
    siteverify(PASSES)

    assert.equal((await post(`/anmeldung/${id}`, signupForm())).status, 409)
  })
})

describe('Mitteilung an Naira', () => {
  /** siteverify besteht, Push-Dienste antworten mit `pushStatus`. */
  function services(pushStatus: number) {
    return mock.method(globalThis, 'fetch', async (url: string) =>
      url.startsWith('https://challenges.cloudflare.com/')
        ? new Response(JSON.stringify(PASSES))
        : new Response(null, { status: pushStatus }),
    )
  }

  it('geht nach einer Anmeldung an jedes angemeldete Gerät', async () => {
    const id = await createWorkshop(env.DB, workshopInput({ capacity: 4 }))
    await savePushSubscription(env.DB, { endpoint: 'https://web.push.apple.com/naira', ...(await testDeviceKeys()), label: 'iPhone' })
    const fetchMock = services(201)

    const res = await post(`/anmeldung/${id}`, signupForm({ persons: '3' }))
    assert.equal(res.status, 303)

    const pushCall = fetchMock.mock.calls.find((call) => call.arguments[0] === 'https://web.push.apple.com/naira')
    assert.ok(pushCall, 'keine Mitteilung verschickt')
    const headers = (pushCall.arguments[1] as RequestInit).headers as Record<string, string>
    assert.match(headers.Authorization ?? '', /^vapid t=/)
  })

  it('kostet keine Anmeldung, wenn der Push-Dienst ausfällt', async () => {
    const id = await createWorkshop(env.DB, workshopInput())
    await savePushSubscription(env.DB, { endpoint: 'https://web.push.apple.com/naira', ...(await testDeviceKeys()), label: null })
    services(500)
    mock.method(console, 'error', () => {})

    assert.equal((await post(`/anmeldung/${id}`, signupForm())).status, 303)
    assert.equal((await listSignups(env.DB, id)).length, 1)
    // Ein vorübergehender Fehler löscht das Gerät nicht.
    assert.equal((await listPushSubscriptions(env.DB)).length, 1)
  })
})

describe('Kalenderdatei', () => {
  it('liefert einen veröffentlichten Termin als iCalendar aus', async () => {
    const id = await createWorkshop(env.DB, workshopInput({ note: 'Mit Apéro' }))
    const res = await get(`/termin/${id}.ics`)
    const text = await res.text()

    assert.equal(res.status, 200)
    assert.equal(res.headers.get('content-type'), 'text/calendar; charset=utf-8')
    assert.match(res.headers.get('content-disposition') ?? '', /filename="workshop-2099-01-10\.ics"/)
    assert.match(text, /DTSTART:20990110T090000Z\r\n/)
    assert.match(text, /STATUS:CONFIRMED/)
  })

  it('liefert abgesagte Termine als CANCELLED, Entwürfe gar nicht', async () => {
    const cancelled = await createWorkshop(env.DB, workshopInput({ status: 'cancelled' }))
    const draft = await createWorkshop(env.DB, workshopInput({ status: 'draft' }))

    assert.match(await (await get(`/termin/${cancelled}.ics`)).text(), /STATUS:CANCELLED/)
    assert.equal((await get(`/termin/${draft}.ics`)).status, 404)
  })

  it('kennt nur IDs mit .ics', async () => {
    const id = await createWorkshop(env.DB, workshopInput())

    assert.equal((await get(`/termin/${id}`)).status, 404)
    assert.equal((await get('/termin/gibtsnicht.ics')).status, 404)
    assert.equal((await get('/termin/..%2Fadmin.ics')).status, 404)
  })
})

describe('Kontakt und Datenschutz', () => {
  it('führt „Schreibe mir“ als E-Mail-Link mit Betreff, ohne Kontaktseite', async () => {
    const text = await (await get('/')).text()

    assert.match(text, /href="mailto:tuftingstudio\.bern%40outlook\.com\?subject=Anfrage%20Tufting-Workshop"/)
    assert.equal((await get('/kontakt')).status, 404)
  })

  it('beschreibt Datenbank, Mitteilung und Turnstile in der Datenschutzerklärung', async () => {
    const text = await (await get('/datenschutz')).text()

    assert.match(text, /nur\s+in der EU/)
    assert.match(text, /Turnstile/)
    assert.match(text, /Mitteilung auf ihr Gerät/)
    assert.doesNotMatch(text, /tally\.so/)
  })
})
