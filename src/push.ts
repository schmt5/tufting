/**
 * Web Push an Nairas Geräte, ohne Bibliothek: Verschlüsselung nach RFC 8291
 * (aes128gcm) und Anmeldung beim Push-Dienst nach RFC 8292 (VAPID), beides mit
 * WebCrypto. Läuft so in Workers und in Node (Tests).
 *
 * Der Push-Dienst (Apple, Google, Mozilla) sieht nur verschlüsselte Bytes; den
 * Inhalt kann nur das Gerät lesen, das die Subscription angelegt hat.
 */

export interface PushSubscriptionKeys {
  endpoint: string
  /** Öffentlicher Schlüssel des Geräts, base64url (65 Byte, unkomprimiert). */
  p256dh: string
  /** Auth-Secret des Geräts, base64url (16 Byte). */
  auth: string
}

export interface VapidConfig {
  /** Öffentlicher Schlüssel, base64url (65 Byte) — auch applicationServerKey im Browser. */
  publicKey: string
  /** Privater Schlüssel, base64url (32 Byte, das `d` der JWK). */
  privateKey: string
  /** Kontakt für die Push-Dienste, `mailto:` oder `https:`. */
  subject: string
}

/** Was der Service Worker anzeigt (public/admin-sw.js). */
export interface PushMessage {
  title: string
  body: string
  /** Wohin ein Tipp auf die Mitteilung führt. */
  url: string
}

export type PushResult = 'sent' | 'gone' | 'failed'

/** Ohne alle drei Werte gibt es keinen Versand — und keinen Knopf dafür. */
export function vapidConfig(env: {
  VAPID_PUBLIC_KEY?: string
  VAPID_PRIVATE_KEY?: string
  VAPID_SUBJECT?: string
}): VapidConfig | null {
  const publicKey = env.VAPID_PUBLIC_KEY?.trim() ?? ''
  const privateKey = env.VAPID_PRIVATE_KEY?.trim() ?? ''
  const subject = env.VAPID_SUBJECT?.trim() ?? ''

  if (!publicKey || !privateKey || !subject) return null
  return { publicKey, privateKey, subject }
}

/** Eine Mitteilung lebt beim Push-Dienst höchstens einen Tag, falls das Gerät offline ist. */
const TTL_SECONDS = 24 * 60 * 60

/** Gültigkeit der VAPID-Signatur. Erlaubt sind höchstens 24 Stunden. */
const JWT_SECONDS = 12 * 60 * 60

const RECORD_SIZE = 4096
const TIMEOUT_MS = 10_000

const encoder = new TextEncoder()

/** UTF-8-Bytes mit eigenem ArrayBuffer, wie WebCrypto sie verlangt. */
function utf8(text: string): Uint8Array<ArrayBuffer> {
  return new Uint8Array(encoder.encode(text))
}

export function base64urlEncode(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
}

export function base64urlDecode(value: string): Uint8Array<ArrayBuffer> {
  const base64 = value.replaceAll('-', '+').replaceAll('_', '/')
  const binary = atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4))
  return Uint8Array.from(binary, (char) => char.charCodeAt(0))
}

function concat(...parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const result = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0))
  let offset = 0
  for (const part of parts) {
    result.set(part, offset)
    offset += part.length
  }
  return result
}

/**
 * P-256-Schlüssel als JWK. Der öffentliche Teil steht unkomprimiert da: ein
 * Byte 0x04, dann 32 Byte x, 32 Byte y.
 */
function p256Jwk(publicRaw: Uint8Array, privateD?: Uint8Array): JsonWebKey {
  if (publicRaw.length !== 65 || publicRaw[0] !== 0x04) throw new Error('kein unkomprimierter P-256-Schlüssel')

  return {
    kty: 'EC',
    crv: 'P-256',
    x: base64urlEncode(publicRaw.slice(1, 33)),
    y: base64urlEncode(publicRaw.slice(33, 65)),
    ...(privateD ? { d: base64urlEncode(privateD) } : {}),
  }
}

/** HKDF-SHA-256 (Extract und Expand in einem), `length` in Byte. */
async function hkdf(salt: Uint8Array<ArrayBuffer>, ikm: Uint8Array<ArrayBuffer>, info: Uint8Array<ArrayBuffer>, length: number) {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits'])
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, length * 8))
}

/**
 * Für die Tests: der Testvektor aus RFC 8291 Anhang A legt Schlüssel und Salt
 * fest. Im Betrieb sind beide bei jeder Mitteilung neu und zufällig.
 */
export interface EncryptionFixture {
  /** Öffentlicher Wegwerf-Schlüssel des Servers, roh (65 Byte). */
  serverPublic: Uint8Array<ArrayBuffer>
  /** Privater Wegwerf-Schlüssel des Servers, das `d` (32 Byte). */
  serverPrivate: Uint8Array<ArrayBuffer>
  salt: Uint8Array<ArrayBuffer>
}

/**
 * Verschlüsselt eine Nachricht für ein Gerät (RFC 8291, ein einziger Record).
 * Ergebnis ist der fertige Request-Body: Header (Salt, Record-Grösse,
 * Server-Schlüssel) und Chiffrat.
 */
export async function encryptPayload(
  plaintext: Uint8Array<ArrayBuffer>,
  subscription: Pick<PushSubscriptionKeys, 'p256dh' | 'auth'>,
  fixture?: EncryptionFixture,
): Promise<Uint8Array<ArrayBuffer>> {
  const uaPublic = base64urlDecode(subscription.p256dh)
  const authSecret = base64urlDecode(subscription.auth)

  let serverPublic: Uint8Array<ArrayBuffer>
  let serverPrivateKey: CryptoKey

  if (fixture) {
    serverPublic = fixture.serverPublic
    serverPrivateKey = await crypto.subtle.importKey(
      'jwk',
      p256Jwk(fixture.serverPublic, fixture.serverPrivate),
      { name: 'ECDH', namedCurve: 'P-256' },
      false,
      ['deriveBits'],
    )
  } else {
    const pair = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
      'deriveBits',
    ])) as CryptoKeyPair
    serverPublic = new Uint8Array((await crypto.subtle.exportKey('raw', pair.publicKey)) as ArrayBuffer)
    serverPrivateKey = pair.privateKey
  }

  const salt = fixture?.salt ?? crypto.getRandomValues(new Uint8Array(16))

  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, [])
  // Die Worker-Typen nennen das Feld `$public` (public ist dort ein reserviertes
  // Wort); zur Laufzeit heisst es in Workers wie in Node `public`.
  const ecdh = { name: 'ECDH', public: uaKey } as unknown as SubtleCryptoDeriveKeyAlgorithm
  const ecdhSecret = new Uint8Array(await crypto.subtle.deriveBits(ecdh, serverPrivateKey, 256))

  // RFC 8291 §3.4: erst Gerät und Server zu einem Schlüssel verbinden ...
  const keyInfo = concat(utf8('WebPush: info\0'), uaPublic, serverPublic)
  const ikm = await hkdf(authSecret, ecdhSecret, keyInfo, 32)

  // ... dann daraus Inhaltsschlüssel und Nonce (RFC 8188).
  const cek = await hkdf(salt, ikm, utf8('Content-Encoding: aes128gcm\0'), 16)
  const nonce = await hkdf(salt, ikm, utf8('Content-Encoding: nonce\0'), 12)

  // 0x02 markiert den letzten (und einzigen) Record, ohne weiteres Padding.
  const padded = concat(plaintext, new Uint8Array([0x02]))
  const aesKey = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt'])
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aesKey, padded))

  const recordSize = new Uint8Array(4)
  new DataView(recordSize.buffer).setUint32(0, RECORD_SIZE)

  return concat(salt, recordSize, new Uint8Array([serverPublic.length]), serverPublic, ciphertext)
}

/**
 * VAPID-Header (RFC 8292): ein ES256-signiertes JWT für die Herkunft des
 * Push-Dienstes, dazu der öffentliche Schlüssel. Daran erkennt der Dienst,
 * dass die Mitteilung von dem Server kommt, bei dem sich das Gerät angemeldet
 * hat.
 */
export async function vapidAuthorization(endpoint: string, vapid: VapidConfig, now: number): Promise<string> {
  const header = base64urlEncode(utf8(JSON.stringify({ typ: 'JWT', alg: 'ES256' })))
  const claims = base64urlEncode(
    utf8(JSON.stringify({ aud: new URL(endpoint).origin, exp: now + JWT_SECONDS, sub: vapid.subject })),
  )
  const unsigned = `${header}.${claims}`

  const key = await crypto.subtle.importKey(
    'jwk',
    p256Jwk(base64urlDecode(vapid.publicKey), base64urlDecode(vapid.privateKey)),
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  )
  // WebCrypto liefert r‖s (64 Byte) — genau das Format, das JWS verlangt.
  const signature = new Uint8Array(
    await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, utf8(unsigned)),
  )

  return `vapid t=${unsigned}.${base64urlEncode(signature)}, k=${vapid.publicKey}`
}

/**
 * Schickt eine Mitteilung an ein Gerät.
 *
 * `gone` heisst: das Gerät gibt es beim Push-Dienst nicht mehr (abgemeldet,
 * App gelöscht) — die Subscription gehört gelöscht. `failed` ist alles
 * andere; dann bleibt sie stehen und wird beim nächsten Mal wieder versucht.
 */
export async function sendPush(
  subscription: PushSubscriptionKeys,
  message: PushMessage,
  vapid: VapidConfig,
  now: number,
): Promise<PushResult> {
  try {
    const body = await encryptPayload(utf8(JSON.stringify(message)), subscription)
    const response = await fetch(subscription.endpoint, {
      method: 'POST',
      headers: {
        Authorization: await vapidAuthorization(subscription.endpoint, vapid, now),
        'Content-Encoding': 'aes128gcm',
        'Content-Type': 'application/octet-stream',
        TTL: String(TTL_SECONDS),
        Urgency: 'high',
      },
      body,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })

    if (response.status === 404 || response.status === 410) return 'gone'
    if (!response.ok) {
      console.error(`Push: ${new URL(subscription.endpoint).host} antwortet ${response.status}`, await response.text())
      return 'failed'
    }
    return 'sent'
  } catch (error) {
    console.error('Push: Versand fehlgeschlagen', error)
    return 'failed'
  }
}

/**
 * Nur Endpunkte über HTTPS mit vernünftiger Länge. Die Adresse kommt aus dem
 * Browser und wird später vom Worker aufgerufen — eine beliebige URL wäre eine
 * Einladung, den Worker anderswohin schicken zu lassen.
 */
export function isPlausibleSubscription(value: unknown): value is PushSubscriptionKeys {
  if (typeof value !== 'object' || value === null) return false
  const { endpoint, p256dh, auth } = value as Record<string, unknown>

  if (typeof endpoint !== 'string' || endpoint.length > 1024) return false
  if (typeof p256dh !== 'string' || typeof auth !== 'string') return false

  try {
    if (new URL(endpoint).protocol !== 'https:') return false
    return base64urlDecode(p256dh).length === 65 && base64urlDecode(auth).length === 16
  } catch {
    return false
  }
}
