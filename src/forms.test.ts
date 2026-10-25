import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { isIsoDate, isPlausibleEmail, parseSignupForm, parseWorkshopForm } from './forms.ts'

const TODAY = '2026-11-01'

const validWorkshop = {
  date: '2026-11-22',
  start_time: '10:00',
  end_time: '17:00',
  capacity: '4',
  note: '',
  status: 'published',
}

describe('parseWorkshopForm', () => {
  it('liefert die Werte eines gültigen Termins', () => {
    const result = parseWorkshopForm(validWorkshop, { today: TODAY, isNew: true })

    assert.deepEqual(result, {
      ok: true,
      value: { date: '2026-11-22', start_time: '10:00', end_time: '17:00', capacity: 4, note: null, status: 'published' },
    })
  })

  it('meldet jeden Fehler an seinem Feld und gibt die Eingaben zurück', () => {
    const result = parseWorkshopForm(
      { date: '2026-02-31', start_time: '25:00', end_time: '17:00', capacity: '0', note: '', status: 'geheim' },
      { today: TODAY, isNew: true },
    )

    assert.equal(result.ok, false)
    assert.ok(!result.ok)
    assert.deepEqual(Object.keys(result.errors).sort(), ['capacity', 'date', 'start_time', 'status'])
    assert.equal(result.values.date, '2026-02-31')
  })

  it('verlangt ein Ende nach dem Beginn', () => {
    const result = parseWorkshopForm({ ...validWorkshop, end_time: '10:00' }, { today: TODAY, isNew: true })
    assert.ok(!result.ok && result.errors.end_time)
  })

  it('lehnt neue Termine in der Vergangenheit ab, erlaubt aber Korrekturen alter', () => {
    const past = { ...validWorkshop, date: '2026-10-31' }

    assert.ok(!parseWorkshopForm(past, { today: TODAY, isNew: true }).ok)
    assert.ok(parseWorkshopForm(past, { today: TODAY, isNew: false }).ok)
  })

  it('erlaubt nicht weniger Plätze als schon gebucht sind', () => {
    const result = parseWorkshopForm({ ...validWorkshop, capacity: '2' }, { today: TODAY, isNew: false, booked: 3 })
    assert.ok(!result.ok && result.errors.capacity?.includes('3 Personen'))
  })

  it('nimmt keine Zahl mit Text dahinter an', () => {
    const result = parseWorkshopForm({ ...validWorkshop, capacity: '4 Plätze' }, { today: TODAY, isNew: true })
    assert.ok(!result.ok && result.errors.capacity)
  })

  it('übernimmt den Hinweis getrimmt', () => {
    const result = parseWorkshopForm({ ...validWorkshop, note: '  Mit Apéro  ' }, { today: TODAY, isNew: true })
    assert.ok(result.ok && result.value.note === 'Mit Apéro')
  })
})

describe('parseSignupForm', () => {
  const context = { workshopId: 'abc', maxPersons: 2 }
  const valid = { first_name: 'Lisa', last_name: 'Muster', email: 'lisa@example.com', persons: '2', comment: '' }

  it('liefert die Anmeldung', () => {
    const result = parseSignupForm(valid, context)
    assert.ok(result.ok)
    assert.equal(result.value.workshop_id, 'abc')
    assert.equal(result.value.persons, 2)
    assert.equal(result.value.comment, null)
  })

  it('verlangt Namen, E-Mail und eine passende Personenzahl', () => {
    const result = parseSignupForm({ first_name: '', last_name: ' ', email: 'lisa', persons: '3', comment: '' }, context)

    assert.ok(!result.ok)
    assert.deepEqual(Object.keys(result.errors).sort(), ['email', 'first_name', 'last_name', 'persons'])
  })

  it('sagt es deutlich, wenn nur noch ein Platz frei ist', () => {
    const result = parseSignupForm({ ...valid, persons: '2' }, { workshopId: 'abc', maxPersons: 1 })
    assert.ok(!result.ok && result.errors.persons === 'Es ist nur noch 1 Platz frei.')
  })
})

describe('isIsoDate', () => {
  it('prüft Format und Kalender', () => {
    assert.equal(isIsoDate('2026-11-22'), true)
    assert.equal(isIsoDate('2026-02-29'), false)
    assert.equal(isIsoDate('22.11.2026'), false)
  })
})

describe('isPlausibleEmail', () => {
  it('lässt gewöhnliche und ungewöhnliche Adressen durch, offensichtlich falsche nicht', () => {
    assert.equal(isPlausibleEmail('naira+workshop@studio.ch'), true)
    assert.equal(isPlausibleEmail('a@b.co'), true)
    assert.equal(isPlausibleEmail('lisa@example'), false)
    assert.equal(isPlausibleEmail('lisa muster@example.com'), false)
    assert.equal(isPlausibleEmail(''), false)
  })
})
