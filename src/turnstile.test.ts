import assert from 'node:assert/strict'
import { afterEach, describe, it, mock } from 'node:test'
import { turnstileConfig, verifyTurnstile } from './turnstile.ts'

const CONFIG = { siteKey: 'site', secretKey: 'secret', hostnames: new Set(['naira-tufting.ch']) }

/** Ersetzt fetch durch eine feste siteverify-Antwort und merkt sich den Request. */
function siteverifyAnswers(body: unknown, status = 200) {
  return mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify(body), { status }))
}

afterEach(() => {
  mock.restoreAll()
})

describe('turnstileConfig', () => {
  it('verlangt Sitekey, Secret und mindestens einen Hostnamen', () => {
    const env = { TURNSTILE_SITE_KEY: 'site', TURNSTILE_SECRET_KEY: 'secret', TURNSTILE_HOSTNAMES: ' a.ch , b.ch ' }

    assert.deepEqual(turnstileConfig(env)?.hostnames, new Set(['a.ch', 'b.ch']))
    assert.equal(turnstileConfig({ ...env, TURNSTILE_SECRET_KEY: '' }), null)
    assert.equal(turnstileConfig({ ...env, TURNSTILE_HOSTNAMES: ' , ' }), null)
  })
})

describe('verifyTurnstile', () => {
  it('besteht mit Erfolg, passender Aktion und erlaubtem Hostnamen', async () => {
    const fetchMock = siteverifyAnswers({ success: true, action: 'signup', hostname: 'naira-tufting.ch' })

    assert.equal(await verifyTurnstile(CONFIG, 'token', '203.0.113.7', 'signup'), true)

    const [url, init] = fetchMock.mock.calls[0]?.arguments ?? []
    assert.equal(url, 'https://challenges.cloudflare.com/turnstile/v0/siteverify')
    const sent = new URLSearchParams(String((init as RequestInit).body))
    assert.equal(sent.get('secret'), 'secret')
    assert.equal(sent.get('response'), 'token')
    assert.equal(sent.get('remoteip'), '203.0.113.7')
  })

  it('fällt bei falscher Aktion, fremdem Hostnamen oder Misserfolg durch', async () => {
    siteverifyAnswers({ success: true, action: 'login', hostname: 'naira-tufting.ch' })
    assert.equal(await verifyTurnstile(CONFIG, 'token', null, 'signup'), false)

    mock.restoreAll()
    siteverifyAnswers({ success: true, action: 'signup', hostname: 'localhost' })
    assert.equal(await verifyTurnstile(CONFIG, 'token', null, 'signup'), false)

    mock.restoreAll()
    siteverifyAnswers({ success: false, 'error-codes': ['timeout-or-duplicate'] })
    assert.equal(await verifyTurnstile(CONFIG, 'token', null, 'signup'), false)
  })

  it('fällt durch, wenn siteverify nicht antwortet', async () => {
    mock.method(globalThis, 'fetch', async () => {
      throw new Error('offline')
    })
    mock.method(console, 'error', () => {})

    assert.equal(await verifyTurnstile(CONFIG, 'token', null, 'signup'), false)
  })

  it('fällt durch bei einer Fehlerantwort', async () => {
    siteverifyAnswers({}, 500)
    mock.method(console, 'error', () => {})

    assert.equal(await verifyTurnstile(CONFIG, 'token', null, 'signup'), false)
  })

  it('fragt ohne Token gar nicht erst nach', async () => {
    const fetchMock = siteverifyAnswers({ success: true })

    assert.equal(await verifyTurnstile(CONFIG, '', null, 'signup'), false)
    assert.equal(await verifyTurnstile(CONFIG, 'x'.repeat(2049), null, 'signup'), false)
    assert.equal(fetchMock.mock.callCount(), 0)
  })

  it('lässt die Test-Schlüssel ohne Aktion durch, aber nur mit erlaubtem Hostnamen', async () => {
    const local = { ...CONFIG, hostnames: new Set(['example.com']) }
    siteverifyAnswers({ success: true, hostname: 'example.com', metadata: { result_with_testing_key: true } })

    assert.equal(await verifyTurnstile(local, 'XXXX.DUMMY.TOKEN.XXXX', null, 'signup'), true)
    assert.equal(await verifyTurnstile(CONFIG, 'XXXX.DUMMY.TOKEN.XXXX', null, 'signup'), false)
  })
})
