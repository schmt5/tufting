/**
 * Gemeinsame Hilfen der Tests, die eine echte lokale D1 brauchen. Wird nur aus
 * *.test.ts importiert und landet nie im Worker.
 */

import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { getPlatformProxy, type PlatformProxy } from 'wrangler'

/**
 * Eine leere D1 nur im Speicher (workerd über getPlatformProxy), mit allen
 * Migrationen eingespielt. Ohne Login und ohne Zugriff auf die echte
 * Datenbank.
 */
export async function testDatabase(): Promise<PlatformProxy<{ DB: D1Database }>> {
  const proxy = await getPlatformProxy<{ DB: D1Database }>({ persist: false, remoteBindings: false })
  await migrate(proxy.env.DB)
  return proxy
}

/** Spielt alle Migrationen ein, wie `wrangler d1 migrations apply` es täte. */
async function migrate(database: D1Database): Promise<void> {
  // Pfade statt URL: Worker- und Node-Typen definieren URL je anders, und
  // readFile erwartet die von Node.
  const dir = join(import.meta.dirname, '..', 'migrations')
  const files = (await readdir(dir)).filter((file) => file.endsWith('.sql')).sort()

  for (const file of files) {
    const sql = await readFile(join(dir, file), 'utf8')
    const statements = sql
      .split('\n')
      .filter((line) => !line.trimStart().startsWith('--'))
      .join('\n')
      .split(';')
      .map((statement) => statement.trim())
      .filter(Boolean)

    await database.batch(statements.map((statement) => database.prepare(statement)))
  }
}

/** Leert alle Tabellen mit Inhalt, damit jeder Test bei null beginnt. */
export async function resetDatabase(db: D1Database): Promise<void> {
  await db.batch([
    db.prepare('DELETE FROM signups'),
    db.prepare('DELETE FROM workshops'),
    db.prepare('DELETE FROM login_failures'),
    db.prepare('DELETE FROM push_subscriptions'),
  ])
}

/** Ein VAPID-Paar nur für die Tests, im Format der Env-Variablen. */
export async function testVapidKeys(): Promise<{ VAPID_PUBLIC_KEY: string; VAPID_PRIVATE_KEY: string; VAPID_SUBJECT: string }> {
  const pair = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign'])) as CryptoKeyPair
  const raw = new Uint8Array((await crypto.subtle.exportKey('raw', pair.publicKey)) as ArrayBuffer)
  const jwk = (await crypto.subtle.exportKey('jwk', pair.privateKey)) as JsonWebKey
  return { VAPID_PUBLIC_KEY: Buffer.from(raw).toString('base64url'), VAPID_PRIVATE_KEY: jwk.d ?? '', VAPID_SUBJECT: 'mailto:test@example.com' }
}

/** Schlüssel eines Geräts, wie sie im Browser aus pushManager.subscribe() kämen. */
export async function testDeviceKeys(): Promise<{ p256dh: string; auth: string }> {
  const pair = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair
  const raw = new Uint8Array((await crypto.subtle.exportKey('raw', pair.publicKey)) as ArrayBuffer)
  return { p256dh: Buffer.from(raw).toString('base64url'), auth: Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString('base64url') }
}
