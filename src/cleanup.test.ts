import assert from 'node:assert/strict'
import { after, before, beforeEach, describe, it } from 'node:test'
import type { PlatformProxy } from 'wrangler'
import { cleanup, monthsBefore } from './cleanup.ts'
import { createWorkshop, getWorkshop, insertAdminSignup, listSignups, recordLoginFailure, type WorkshopInput } from './db.ts'
import worker from './index.ts'
import type { Env } from './env.ts'
import { resetDatabase, testDatabase } from './test-support.ts'

let proxy: PlatformProxy<{ DB: D1Database }>
let db: D1Database

const NOW = new Date('2026-11-01T12:00:00Z')

function workshop(date: string): WorkshopInput {
  return { date, start_time: '10:00', end_time: '17:00', capacity: 4, note: null, status: 'published' }
}

async function withSignup(date: string): Promise<string> {
  const id = await createWorkshop(db, workshop(date))
  await insertAdminSignup(db, { workshop_id: id, first_name: 'A', last_name: 'B', email: 'a@b.ch', persons: 1, comment: null }, { overbook: false })
  return id
}

before(async () => {
  proxy = await testDatabase()
  db = proxy.env.DB
})

after(async () => {
  await proxy.dispose()
})

beforeEach(async () => {
  await resetDatabase(db)
})

describe('monthsBefore', () => {
  it('rechnet Monate zurück, auch über den Jahreswechsel', () => {
    assert.equal(monthsBefore('2026-11-01', 3), '2026-08-01')
    assert.equal(monthsBefore('2027-02-15', 3), '2026-11-15')
  })

  it('nimmt den letzten Tag, wenn es den Tag im Zielmonat nicht gibt', () => {
    assert.equal(monthsBefore('2026-05-31', 3), '2026-02-28')
    assert.equal(monthsBefore('2028-05-31', 3), '2028-02-29')
  })
})

describe('cleanup', () => {
  it('löscht Anmeldungen von Workshops vor mehr als drei Monaten, die Workshops bleiben', async () => {
    const old = await withSignup('2026-07-31')
    const recent = await withSignup('2026-08-01')
    const upcoming = await withSignup('2026-12-05')

    const result = await cleanup(db, NOW)

    assert.equal(result.signups, 1)
    assert.deepEqual(await listSignups(db, old), [])
    assert.equal((await listSignups(db, recent)).length, 1)
    assert.equal((await listSignups(db, upcoming)).length, 1)
    assert.ok(await getWorkshop(db, old))
  })

  it('löscht Login-Fehlversuche, die älter als ein Tag sind', async () => {
    const now = Math.floor(NOW.getTime() / 1000)
    await recordLoginFailure(db, '203.0.113.1', now - 25 * 60 * 60)
    await recordLoginFailure(db, '203.0.113.1', now - 60)

    assert.equal((await cleanup(db, NOW)).loginFailures, 1)
  })
})

describe('Cron-Handler', () => {
  it('räumt auf, wenn der Trigger läuft', async () => {
    const old = await withSignup('2000-01-01')
    const pending: Promise<unknown>[] = []
    const ctx = { waitUntil: (task: Promise<unknown>) => pending.push(task), passThroughOnException() {} }
    const env = { DB: db } satisfies Env

    const log = console.log
    console.log = () => {}
    try {
      await worker.scheduled({} as ScheduledController, env, ctx as unknown as ExecutionContext)
      await Promise.all(pending)
    } finally {
      console.log = log
    }

    assert.deepEqual(await listSignups(db, old), [])
  })
})
