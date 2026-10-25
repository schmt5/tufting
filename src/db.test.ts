/**
 * Tests gegen eine echte lokale D1 (workerd über getPlatformProxy), nicht
 * gegen ein Mock: der Platz-Check steckt im SQL, und genau das soll geprüft
 * werden. Die Datenbank liegt nur im Speicher und startet leer.
 */

import assert from 'node:assert/strict'
import { after, before, beforeEach, describe, it } from 'node:test'
import type { PlatformProxy } from 'wrangler'
import {
  cancelSignup,
  createWorkshop,
  deleteSignup,
  getPublishedWorkshop,
  getWorkshop,
  insertAdminSignup,
  insertSignup,
  listPublishedWorkshops,
  listSignups,
  listUpcomingWorkshops,
  markContacted,
  newId,
  type SignupInput,
  type WorkshopInput,
} from './db.ts'
import { resetDatabase, testDatabase } from './test-support.ts'

const TODAY = '2026-11-01'

let proxy: PlatformProxy<{ DB: D1Database }>
let db: D1Database

function workshop(overrides: Partial<WorkshopInput> = {}): WorkshopInput {
  return {
    date: '2026-11-22',
    start_time: '10:00',
    end_time: '17:00',
    capacity: 4,
    note: null,
    status: 'published',
    ...overrides,
  }
}

function signup(workshopId: string, persons = 1): SignupInput {
  return {
    workshop_id: workshopId,
    first_name: 'Lisa',
    last_name: 'Muster',
    email: 'lisa@example.com',
    persons,
    comment: null,
  }
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

describe('insertSignup', () => {
  it('nimmt eine Anmeldung an, solange die Plätze reichen', async () => {
    const id = await createWorkshop(db, workshop({ capacity: 4 }))

    assert.equal((await insertSignup(db, signup(id, 3), TODAY)).ok, true)
    assert.equal((await insertSignup(db, signup(id, 1), TODAY)).ok, true)

    const result = await getWorkshop(db, id)
    assert.equal(result?.booked, 4)
    assert.equal(result?.free, 0)
  })

  it('lehnt mehr Personen ab, als Plätze frei sind, und speichert nichts', async () => {
    const id = await createWorkshop(db, workshop({ capacity: 4 }))
    await insertSignup(db, signup(id, 2), TODAY)

    assert.deepEqual(await insertSignup(db, signup(id, 3), TODAY), { ok: false })
    assert.equal((await listSignups(db, id)).length, 1)
  })

  it('vergibt den letzten Platz bei zwei gleichzeitigen Anmeldungen nur einmal', async () => {
    const id = await createWorkshop(db, workshop({ capacity: 4 }))
    await insertSignup(db, signup(id, 3), TODAY)

    const results = await Promise.all([
      insertSignup(db, signup(id, 1), TODAY),
      insertSignup(db, signup(id, 1), TODAY),
    ])

    assert.equal(results.filter((result) => result.ok).length, 1)
    assert.equal((await getWorkshop(db, id))?.booked, 4)
  })

  it('überbucht auch bei vielen gleichzeitigen Anmeldungen nicht', async () => {
    const id = await createWorkshop(db, workshop({ capacity: 4 }))

    const results = await Promise.all(
      Array.from({ length: 12 }, () => insertSignup(db, signup(id, 1), TODAY)),
    )

    assert.equal(results.filter((result) => result.ok).length, 4)
    assert.equal((await getWorkshop(db, id))?.booked, 4)
  })

  it('nimmt für Entwürfe, abgesagte, vergangene und unbekannte Termine nichts an', async () => {
    const draft = await createWorkshop(db, workshop({ status: 'draft' }))
    const cancelled = await createWorkshop(db, workshop({ status: 'cancelled' }))
    const past = await createWorkshop(db, workshop({ date: '2026-10-31' }))

    for (const id of [draft, cancelled, past, 'gibtsnicht']) {
      assert.deepEqual(await insertSignup(db, signup(id), TODAY), { ok: false }, id)
    }
  })

  it('nimmt am Tag des Workshops noch an', async () => {
    const id = await createWorkshop(db, workshop({ date: TODAY }))
    assert.equal((await insertSignup(db, signup(id), TODAY)).ok, true)
  })
})

describe('cancelSignup', () => {
  it('gibt die Plätze wieder frei', async () => {
    const id = await createWorkshop(db, workshop({ capacity: 2 }))
    const first = await insertSignup(db, signup(id, 2), TODAY)
    assert.ok(first.ok)

    assert.equal((await insertSignup(db, signup(id, 1), TODAY)).ok, false)
    assert.equal(await cancelSignup(db, first.id), true)
    assert.equal((await insertSignup(db, signup(id, 2), TODAY)).ok, true)
  })
})

describe('insertAdminSignup', () => {
  it('hält sich ohne Überbuchen an die freien Plätze', async () => {
    const id = await createWorkshop(db, workshop({ capacity: 1 }))
    await insertSignup(db, signup(id), TODAY)

    assert.deepEqual(await insertAdminSignup(db, signup(id), { overbook: false }), { ok: false })
  })

  it('überbucht bewusst, und frei bleibt bei 0 statt negativ', async () => {
    const id = await createWorkshop(db, workshop({ capacity: 1 }))
    await insertSignup(db, signup(id), TODAY)

    assert.equal((await insertAdminSignup(db, signup(id, 2), { overbook: true })).ok, true)

    const result = await getWorkshop(db, id)
    assert.equal(result?.booked, 3)
    assert.equal(result?.free, 0)
  })

  it('darf in Entwürfe und vergangene Termine nachtragen, nie in abgesagte', async () => {
    const draft = await createWorkshop(db, workshop({ status: 'draft' }))
    const past = await createWorkshop(db, workshop({ date: '2026-10-01' }))
    const cancelled = await createWorkshop(db, workshop({ status: 'cancelled' }))

    assert.equal((await insertAdminSignup(db, signup(draft), { overbook: false })).ok, true)
    assert.equal((await insertAdminSignup(db, signup(past), { overbook: false })).ok, true)
    assert.equal((await insertAdminSignup(db, signup(cancelled), { overbook: true })).ok, false)
  })

  it('markiert die Herkunft', async () => {
    const id = await createWorkshop(db, workshop())
    await insertAdminSignup(db, signup(id), { overbook: false })

    assert.equal((await listSignups(db, id))[0]?.source, 'admin')
  })
})

describe('listPublishedWorkshops', () => {
  it('zeigt nur veröffentlichte Termine ab heute, nach Datum und Startzeit', async () => {
    const late = await createWorkshop(db, workshop({ date: '2026-11-22', start_time: '14:00' }))
    const early = await createWorkshop(db, workshop({ date: '2026-11-22', start_time: '09:00' }))
    const first = await createWorkshop(db, workshop({ date: '2026-11-08' }))
    await createWorkshop(db, workshop({ status: 'draft' }))
    await createWorkshop(db, workshop({ status: 'cancelled' }))
    await createWorkshop(db, workshop({ date: '2026-10-31' }))

    const ids = (await listPublishedWorkshops(db, TODAY)).map((entry) => entry.id)
    assert.deepEqual(ids, [first, early, late])
  })

  it('zählt stornierte Anmeldungen nicht mit', async () => {
    const id = await createWorkshop(db, workshop({ capacity: 4 }))
    const kept = await insertSignup(db, signup(id, 1), TODAY)
    const dropped = await insertSignup(db, signup(id, 2), TODAY)
    assert.ok(kept.ok && dropped.ok)
    await cancelSignup(db, dropped.id)

    const [entry] = await listPublishedWorkshops(db, TODAY)
    assert.equal(entry?.booked, 1)
    assert.equal(entry?.free, 3)
  })
})

describe('getPublishedWorkshop', () => {
  it('liefert null für alles, was von aussen nicht sichtbar ist', async () => {
    const open = await createWorkshop(db, workshop())
    const draft = await createWorkshop(db, workshop({ status: 'draft' }))
    const past = await createWorkshop(db, workshop({ date: '2026-10-31' }))

    assert.equal((await getPublishedWorkshop(db, open, TODAY))?.id, open)
    assert.equal(await getPublishedWorkshop(db, draft, TODAY), null)
    assert.equal(await getPublishedWorkshop(db, past, TODAY), null)
    assert.equal(await getPublishedWorkshop(db, 'gibtsnicht', TODAY), null)
  })
})

describe('listUpcomingWorkshops', () => {
  it('zeigt dem Admin auch Entwürfe und abgesagte, aber keine vergangenen', async () => {
    await createWorkshop(db, workshop({ status: 'draft' }))
    await createWorkshop(db, workshop({ status: 'cancelled' }))
    await createWorkshop(db, workshop({ date: '2026-10-31' }))

    const statuses = (await listUpcomingWorkshops(db, TODAY)).map((entry) => entry.status).sort()
    assert.deepEqual(statuses, ['cancelled', 'draft'])
  })
})

describe('markContacted', () => {
  it('behält den ersten Zeitpunkt', async () => {
    const id = await createWorkshop(db, workshop())
    const result = await insertSignup(db, signup(id), TODAY)
    assert.ok(result.ok)

    await markContacted(db, result.id, 1000)
    await markContacted(db, result.id, 2000)

    assert.equal((await listSignups(db, id))[0]?.contacted_at, 1000)
  })
})

describe('deleteSignup', () => {
  it('entfernt die Anmeldung', async () => {
    const id = await createWorkshop(db, workshop())
    const result = await insertSignup(db, signup(id), TODAY)
    assert.ok(result.ok)

    assert.equal(await deleteSignup(db, result.id), true)
    assert.equal(await deleteSignup(db, result.id), false)
    assert.deepEqual(await listSignups(db, id), [])
  })
})

describe('newId', () => {
  it('liefert die gewünschte Länge aus dem lesbaren Alphabet', () => {
    const id = newId(16)

    assert.equal(id.length, 16)
    assert.match(id, /^[a-km-np-z2-9]+$/)
  })
})
