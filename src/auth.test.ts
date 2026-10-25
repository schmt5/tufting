import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { Hono } from 'hono'
import { adminSecrets, hasSession, passwordMatches, SESSION_SECONDS, startSession } from './auth.ts'
import { nowSeconds } from './db.ts'
import type { Env } from './env.ts'

const SECRETS = { password: 'richtig-und-lang', sessionSecret: 's'.repeat(32) }

function env(overrides: Partial<Env>): Env {
  return { DB: undefined as unknown as D1Database, TALLY_TOKEN: '', ...overrides }
}

describe('adminSecrets', () => {
  it('verlangt Passwort und einen langen Session-Schlüssel', () => {
    assert.deepEqual(adminSecrets(env({ ADMIN_PASSWORD: 'pw', SESSION_SECRET: 'x'.repeat(32) })), {
      password: 'pw',
      sessionSecret: 'x'.repeat(32),
    })
    assert.equal(adminSecrets(env({ ADMIN_PASSWORD: '', SESSION_SECRET: 'x'.repeat(32) })), null)
    assert.equal(adminSecrets(env({ ADMIN_PASSWORD: 'pw', SESSION_SECRET: 'kurz' })), null)
    assert.equal(adminSecrets(env({})), null)
  })
})

describe('passwordMatches', () => {
  it('erkennt das richtige Passwort und nur das', async () => {
    assert.equal(await passwordMatches('richtig-und-lang', SECRETS), true)
    assert.equal(await passwordMatches('richtig-und-lan', SECRETS), false)
    assert.equal(await passwordMatches('richtig-und-lang ', SECRETS), false)
    assert.equal(await passwordMatches('', SECRETS), false)
  })
})

/** Eine Mini-App, die eine Session setzt und eine prüft — wie admin.ts. */
function sessionApp(issuedAt: number) {
  const app = new Hono()
  app.get('/setzen', async (c) => {
    await startSession(c, SECRETS, issuedAt)
    return c.text('ok')
  })
  app.get('/pruefen', async (c) => c.text(String(await hasSession(c, SECRETS, nowSeconds()))))
  return app
}

async function cookieFrom(app: Hono): Promise<string> {
  const res = await app.request('/setzen')
  return res.headers.get('set-cookie')?.split(';')[0] ?? ''
}

describe('Session-Cookie', () => {
  it('setzt ein sicheres Host-Cookie', async () => {
    const res = await sessionApp(nowSeconds()).request('/setzen')
    const header = res.headers.get('set-cookie') ?? ''

    assert.match(header, /^__Host-session=/)
    assert.match(header, /HttpOnly/)
    assert.match(header, /Secure/)
    assert.match(header, /SameSite=Lax/)
    assert.match(header, /Path=\//)
  })

  it('gilt mit gültiger Signatur', async () => {
    const app = sessionApp(nowSeconds())
    const res = await app.request('/pruefen', { headers: { cookie: await cookieFrom(app) } })
    assert.equal(await res.text(), 'true')
  })

  it('gilt nicht mehr nach Ablauf', async () => {
    const app = sessionApp(nowSeconds() - SESSION_SECONDS - 60)
    const res = await app.request('/pruefen', { headers: { cookie: await cookieFrom(app) } })
    assert.equal(await res.text(), 'false')
  })

  it('gilt nicht, wenn jemand den Ablauf verlängert', async () => {
    const app = sessionApp(nowSeconds())
    const cookie = await cookieFrom(app)
    // Den Zeitstempel vor der Signatur ersetzen, die Signatur stehen lassen.
    const forged = cookie.replace(/=(\d+)\./, '=9999999999.')

    const res = await app.request('/pruefen', { headers: { cookie: forged } })
    assert.equal(await res.text(), 'false')
  })
})
