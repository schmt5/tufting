import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { newSignupMessage } from './notify.ts'
import type { Workshop } from './workshops.ts'

const workshop: Workshop = {
  id: 'abc',
  name: '',
  date: '2026-11-28',
  freeSpots: 3,
  state: 'open',
  startTime: '10:00',
  endTime: '17:00',
  capacity: 4,
  note: null,
}

const signup = { workshop_id: 'abc', first_name: 'Mia', last_name: 'Beispiel', email: 'mia@example.com', persons: 2, comment: null }

describe('newSignupMessage', () => {
  it('nennt Tag, Vorname mit Initial, Personen und die Plätze danach', () => {
    assert.deepEqual(newSignupMessage(workshop, signup, 'xyz'), {
      title: 'Neue Anmeldung 28.11.',
      body: 'Mia B., 2 Personen. Noch 1 Platz frei.',
      url: '/admin/workshops/abc#anmeldung-xyz',
    })
  })

  it('sagt, wenn der Termin damit voll ist', () => {
    const message = newSignupMessage(workshop, { ...signup, persons: 3 }, 'xyz')
    assert.equal(message.body, 'Mia B., 3 Personen. Jetzt ausgebucht.')
  })

  it('verrät weder Nachnamen noch E-Mail', () => {
    const { title, body } = newSignupMessage(workshop, signup, 'xyz')
    assert.doesNotMatch(`${title} ${body}`, /Beispiel|mia@example\.com/)
  })
})
