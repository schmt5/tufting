/**
 * Login für das eine Admin-Konto: Passwort aus einem Secret, Session als
 * signiertes Cookie, Sperre nach Fehlversuchen. Begründungen in plan.md §6.
 */

import type { Context } from 'hono'
import { deleteCookie, getSignedCookie, setSignedCookie } from 'hono/cookie'
import { countLoginFailures } from './db.ts'
import type { Env } from './env.ts'

/** Mit `prefix: 'host'` heisst das Cookie im Browser `__Host-session`. */
const SESSION_COOKIE = 'session'

/**
 * 90 Tage: Naira soll die App auf dem Handy nicht jede Woche neu entsperren.
 * Wer alle Sessions beenden will, wechselt SESSION_SECRET.
 */
export const SESSION_SECONDS = 90 * 24 * 60 * 60

/** So viele Fehlversuche pro IP im Zeitfenster, dann ist der Login zu. */
export const MAX_LOGIN_FAILURES = 5
export const LOCKOUT_SECONDS = 15 * 60

/** Kürzer wäre ein Session-Schlüssel, den man durchprobieren kann. */
const MIN_SECRET_LENGTH = 32

export interface AdminSecrets {
  password: string
  sessionSecret: string
}

/**
 * Beide Secrets oder keines. Fehlt eines, bleibt der Admin zu — ein leeres
 * Passwort darf nie bedeuten, dass jedes Passwort passt.
 */
export function adminSecrets(env: Env): AdminSecrets | null {
  const password = env.ADMIN_PASSWORD ?? ''
  const sessionSecret = env.SESSION_SECRET ?? ''

  if (!password || sessionSecret.length < MIN_SECRET_LENGTH) return null
  return { password, sessionSecret }
}

async function hmac(key: string, value: string): Promise<Uint8Array> {
  const encoder = new TextEncoder()
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )

  return new Uint8Array(await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(value)))
}

/**
 * Vergleich in konstanter Zeit. Beide Seiten werden vorher per HMAC auf 32
 * Byte gebracht, damit weder Inhalt noch Länge des Passworts über die Laufzeit
 * herauszulesen sind.
 *
 * Von Hand statt `crypto.subtle.timingSafeEqual`: das gibt es nur in Workers,
 * die Tests laufen in Node. Bei gleich langen Digests ist die XOR-Schleife
 * genauso konstant.
 */
export async function passwordMatches(input: string, secrets: AdminSecrets): Promise<boolean> {
  const [given, expected] = await Promise.all([
    hmac(secrets.sessionSecret, input),
    hmac(secrets.sessionSecret, secrets.password),
  ])

  let difference = 0
  for (let index = 0; index < expected.length; index++) {
    difference |= (given[index] ?? 0) ^ (expected[index] ?? 0)
  }

  return difference === 0
}

/** Die IP des Besuchers, wie Cloudflare sie meldet. Lokal gibt es keine. */
export function clientIp(c: Context): string {
  return c.req.header('cf-connecting-ip') ?? 'lokal'
}

/** true, wenn diese IP gerade gesperrt ist. */
export async function isLockedOut(db: D1Database, ip: string, now: number): Promise<boolean> {
  return (await countLoginFailures(db, ip, now - LOCKOUT_SECONDS)) >= MAX_LOGIN_FAILURES
}

/**
 * Im Cookie steht nur der Ablaufzeitpunkt, signiert mit SESSION_SECRET. Mehr
 * braucht es nicht: es gibt genau ein Konto, und wer ein gültig signiertes
 * Cookie hat, ist eingeloggt.
 *
 * `SameSite=Lax` statt `Strict`: ein Link von ausserhalb, etwa aus einer
 * Mail, öffnet den Admin. Mit `Strict` käme das Cookie dabei nicht mit. Gegen fremde Formulare schützt die csrf()-Middleware.
 */
export async function startSession(c: Context, secrets: AdminSecrets, now: number): Promise<void> {
  await setSignedCookie(c, SESSION_COOKIE, String(now + SESSION_SECONDS), secrets.sessionSecret, {
    prefix: 'host',
    path: '/',
    secure: true,
    httpOnly: true,
    sameSite: 'Lax',
    maxAge: SESSION_SECONDS,
  })
}

export async function hasSession(c: Context, secrets: AdminSecrets, now: number): Promise<boolean> {
  const value = await getSignedCookie(c, secrets.sessionSecret, SESSION_COOKIE, 'host')

  // false heisst: Signatur falsch, das Cookie ist manipuliert oder alt.
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return false
  return Number(value) > now
}

export function endSession(c: Context): void {
  deleteCookie(c, SESSION_COOKIE, { prefix: 'host', path: '/', secure: true })
}
