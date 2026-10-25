import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { DEFAULT_TEMPLATE, fillTemplate, mailtoLink, unknownPlaceholders } from './template.ts'

const VALUES = {
  vorname: 'Mia',
  nachname: 'Beispiel',
  datum: '28.11.2026',
  zeit: '10:00–17:00',
  personen: '2 Personen',
  adresse: 'Eigerplatz, 3007 Bern',
  kalender: 'https://naira-tufting.ch/termin/abc.ics',
}

describe('fillTemplate', () => {
  it('ersetzt alle bekannten Platzhalter, auch mehrfach', () => {
    assert.equal(fillTemplate('{vorname} am {datum}, {datum}', VALUES), 'Mia am 28.11.2026, 28.11.2026')
  })

  it('lässt unbekannte Platzhalter sichtbar stehen', () => {
    assert.equal(fillTemplate('Hallo {vornahme}', VALUES), 'Hallo {vornahme}')
  })

  it('füllt den Standardtext ohne Reste', () => {
    const body = fillTemplate(DEFAULT_TEMPLATE.body, VALUES)
    assert.doesNotMatch(body, /\{[a-z]+\}/)
    assert.match(body, /Hallo Mia/)
    assert.match(body, /termin\/abc\.ics/)
  })

  it('nimmt Werte wörtlich, auch mit Sonderzeichen', () => {
    assert.equal(fillTemplate('{vorname}', { ...VALUES, vorname: '$& {datum}' }), '$& {datum}')
  })
})

describe('unknownPlaceholders', () => {
  it('findet Tippfehler, jeden nur einmal', () => {
    assert.deepEqual(unknownPlaceholders('{vorname} {vornahme} {vornahme} {zeit} {ort}'), ['vornahme', 'ort'])
    assert.deepEqual(unknownPlaceholders(DEFAULT_TEMPLATE.body), [])
  })
})

describe('mailtoLink', () => {
  it('kodiert Empfänger, Betreff und Text mit CRLF-Zeilenumbrüchen', () => {
    const link = mailtoLink('mia+kurs@example.com', 'Dein Workshop & mehr', 'Hallo Mia\n\nBis bald')

    assert.equal(
      link,
      'mailto:mia%2Bkurs%40example.com?subject=Dein%20Workshop%20%26%20mehr&body=Hallo%20Mia%0D%0A%0D%0ABis%20bald',
    )
  })

  it('macht aus vorhandenen CRLF keine doppelten', () => {
    assert.match(mailtoLink('a@b.ch', 'x', 'a\r\nb'), /body=a%0D%0Ab$/)
  })
})
