import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  deriveState,
  formatTimeRange,
  fromDatabase,
  todayInZurich,
  zurichDateTime,
  zurichOffset,
} from './workshops.ts'

describe('deriveState', () => {
  it('ist an den Grenzen 0/1/2/3 korrekt', () => {
    assert.equal(deriveState(0), 'soldOut')
    assert.equal(deriveState(1), 'low')
    assert.equal(deriveState(2), 'low')
    assert.equal(deriveState(3), 'open')
    assert.equal(deriveState(4), 'open')
  })
})

describe('todayInZurich', () => {
  it('liefert ISO YYYY-MM-DD', () => {
    assert.match(todayInZurich(), /^\d{4}-\d{2}-\d{2}$/)
  })

  it('rechnet UTC auf Schweizer Zeit um', () => {
    // 22:30 UTC ist in Zürich (Sommerzeit) bereits der nächste Tag.
    assert.equal(todayInZurich(new Date('2026-08-11T22:30:00Z')), '2026-08-12')
    // 21:30 UTC noch nicht.
    assert.equal(todayInZurich(new Date('2026-08-11T21:30:00Z')), '2026-08-11')
  })
})

describe('zurichOffset', () => {
  it('kennt Winter- und Sommerzeit', () => {
    assert.equal(zurichOffset('2026-11-28', '10:00'), '+01:00')
    assert.equal(zurichOffset('2027-06-12', '10:00'), '+02:00')
  })

  it('wechselt mit der Umstellung Ende Oktober', () => {
    assert.equal(zurichOffset('2026-10-24', '10:00'), '+02:00')
    assert.equal(zurichOffset('2026-10-25', '10:00'), '+01:00')
  })
})

describe('zurichDateTime', () => {
  it('setzt Datum, Uhrzeit und Abstand zusammen', () => {
    assert.equal(zurichDateTime('2026-11-28', '17:30'), '2026-11-28T17:30:00+01:00')
  })
})

describe('fromDatabase', () => {
  const row = {
    id: 'abc',
    date: '2026-11-28',
    start_time: '10:00',
    end_time: '17:00',
    capacity: 4,
    note: 'Mit Apéro',
    status: 'published' as const,
    created_at: 0,
    updated_at: 0,
    booked: 2,
    free: 2,
  }

  it('übernimmt Uhrzeit, Plätze und Hinweis und leitet den Zustand ab', () => {
    const workshop = fromDatabase(row)

    assert.equal(workshop.freeSpots, 2)
    assert.equal(workshop.state, 'low')
    assert.equal(workshop.startTime, '10:00')
    assert.equal(workshop.capacity, 4)
    assert.equal(workshop.note, 'Mit Apéro')
    assert.equal(formatTimeRange(workshop), '10:00–17:00')
  })

  it('ist ausgebucht, wenn nichts mehr frei ist', () => {
    assert.equal(fromDatabase({ ...row, booked: 4, free: 0 }).state, 'soldOut')
  })
})

describe('formatTimeRange', () => {
  it('verbindet Beginn und Ende mit einem Halbgeviertstrich', () => {
    assert.equal(formatTimeRange({ startTime: '10:00', endTime: '17:00' }), '10:00–17:00')
  })
})
