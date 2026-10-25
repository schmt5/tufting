import assert from 'node:assert/strict'
import { afterEach, describe, it, mock } from 'node:test'
import {
  base64urlDecode,
  base64urlEncode,
  encryptPayload,
  isPlausibleSubscription,
  sendPush,
  vapidAuthorization,
} from './push.ts'

/** RFC 8291, Anhang A. Leerzeichen aus dem RFC entfernt. */
const RFC = {
  plaintext: 'V2hlbiBJIGdyb3cgdXAsIEkgd2FudCB0byBiZSBhIHdhdGVybWVsb24',
  asPublic: 'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8',
  asPrivate: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw',
  uaPublic: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
  salt: 'DGv6ra1nlYgDCS1FRnbzlw',
  auth: 'BTBZMqHH6r4Tts7J_aSIgg',
  result:
    'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN',
}

async function vapidKeys() {
  const pair = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])) as CryptoKeyPair
  const publicRaw = new Uint8Array((await crypto.subtle.exportKey('raw', pair.publicKey)) as ArrayBuffer)
  const jwk = (await crypto.subtle.exportKey('jwk', pair.privateKey)) as JsonWebKey
  return {
    config: { publicKey: base64urlEncode(publicRaw), privateKey: jwk.d ?? '', subject: 'mailto:test@example.com' },
    verifyKey: pair.publicKey,
  }
}

async function deviceKeys() {
  const pair = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair
  const publicRaw = new Uint8Array((await crypto.subtle.exportKey('raw', pair.publicKey)) as ArrayBuffer)
  return { p256dh: base64urlEncode(publicRaw), auth: base64urlEncode(crypto.getRandomValues(new Uint8Array(16))) }
}

afterEach(() => {
  mock.restoreAll()
})

describe('encryptPayload', () => {
  it('ergibt Byte für Byte den Testvektor aus RFC 8291', async () => {
    const body = await encryptPayload(
      base64urlDecode(RFC.plaintext),
      { p256dh: RFC.uaPublic, auth: RFC.auth },
      {
        serverPublic: base64urlDecode(RFC.asPublic),
        serverPrivate: base64urlDecode(RFC.asPrivate),
        salt: base64urlDecode(RFC.salt),
      },
    )

    assert.equal(base64urlEncode(body), RFC.result)
  })

  it('nimmt für jede Mitteilung einen neuen Schlüssel und ein neues Salt', async () => {
    const device = await deviceKeys()
    const message = new Uint8Array(new TextEncoder().encode('hallo'))

    const [first, second] = await Promise.all([encryptPayload(message, device), encryptPayload(message, device)])
    assert.notEqual(base64urlEncode(first), base64urlEncode(second))
    // Header: 16 Salt + 4 Record-Grösse + 1 Länge + 65 Schlüssel = 86 Byte.
    assert.equal(first.length, 86 + message.length + 1 + 16)
  })
})

describe('vapidAuthorization', () => {
  it('signiert ein JWT für die Herkunft des Push-Dienstes', async () => {
    const { config, verifyKey } = await vapidKeys()
    const header = await vapidAuthorization('https://web.push.apple.com/abc/def', config, 1_000_000)

    const match = /^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/.exec(header)
    assert.ok(match)
    const [, head, claims, signature, key] = match

    assert.equal(key, config.publicKey)
    assert.deepEqual(JSON.parse(new TextDecoder().decode(base64urlDecode(claims ?? ''))), {
      aud: 'https://web.push.apple.com',
      exp: 1_000_000 + 12 * 60 * 60,
      sub: 'mailto:test@example.com',
    })

    const valid = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      verifyKey,
      base64urlDecode(signature ?? ''),
      new Uint8Array(new TextEncoder().encode(`${head}.${claims}`)),
    )
    assert.equal(valid, true)
  })
})

describe('sendPush', () => {
  const message = { title: 'Neue Anmeldung', body: 'Lisa M., 2 Personen', url: '/admin' }

  it('schickt verschlüsselt mit den nötigen Headern', async () => {
    const { config } = await vapidKeys()
    const device = { endpoint: 'https://fcm.googleapis.com/fcm/send/xyz', ...(await deviceKeys()) }
    const fetchMock = mock.method(globalThis, 'fetch', async () => new Response(null, { status: 201 }))

    assert.equal(await sendPush(device, message, config, 1_000_000), 'sent')

    const [url, init] = fetchMock.mock.calls[0]?.arguments ?? []
    const headers = (init as RequestInit).headers as Record<string, string>
    assert.equal(url, device.endpoint)
    assert.equal(headers['Content-Encoding'], 'aes128gcm')
    assert.equal(headers.TTL, '86400')
    assert.match(headers.Authorization ?? '', /^vapid t=/)
    // Der Inhalt geht nie im Klartext mit.
    assert.ok(!new TextDecoder().decode((init as RequestInit).body as Uint8Array).includes('Lisa'))
  })

  it('meldet abgemeldete Geräte als weg und andere Fehler als fehlgeschlagen', async () => {
    const { config } = await vapidKeys()
    const device = { endpoint: 'https://fcm.googleapis.com/fcm/send/xyz', ...(await deviceKeys()) }
    mock.method(console, 'error', () => {})

    mock.method(globalThis, 'fetch', async () => new Response(null, { status: 410 }))
    assert.equal(await sendPush(device, message, config, 0), 'gone')

    mock.restoreAll()
    mock.method(console, 'error', () => {})
    mock.method(globalThis, 'fetch', async () => new Response('kaputt', { status: 500 }))
    assert.equal(await sendPush(device, message, config, 0), 'failed')

    mock.restoreAll()
    mock.method(console, 'error', () => {})
    mock.method(globalThis, 'fetch', async () => {
      throw new Error('offline')
    })
    assert.equal(await sendPush(device, message, config, 0), 'failed')
  })
})

describe('isPlausibleSubscription', () => {
  it('nimmt nur HTTPS-Endpunkte mit Schlüsseln der richtigen Länge', async () => {
    const keys = await deviceKeys()

    assert.equal(isPlausibleSubscription({ endpoint: 'https://push.example/1', ...keys }), true)
    assert.equal(isPlausibleSubscription({ endpoint: 'http://push.example/1', ...keys }), false)
    assert.equal(isPlausibleSubscription({ endpoint: 'https://push.example/1', ...keys, auth: 'kurz' }), false)
    assert.equal(isPlausibleSubscription({ endpoint: 'kein url', ...keys }), false)
    assert.equal(isPlausibleSubscription(null), false)
  })
})
