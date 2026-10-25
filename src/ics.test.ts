import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { buildIcs, escapeText, foldLine, icsUtc, type IcsWorkshop } from './ics.ts'

const ORIGIN = 'https://naira-tufting.ch'
const URL = `${ORIGIN}/anmeldung/abc`

function workshop(overrides: Partial<IcsWorkshop> = {}): IcsWorkshop {
  return {
    id: 'abc',
    date: '2026-11-28',
    start_time: '10:00',
    end_time: '17:00',
    note: null,
    status: 'published',
    updated_at: 1_800_000_000,
    ...overrides,
  }
}

/** Die Zeilen einer Datei, mit wieder zusammengesetzten Faltungen. */
function unfolded(ics: string): string[] {
  return ics.replaceAll('\r\n ', '').split('\r\n')
}

describe('buildIcs', () => {
  it('ist ein vollständiger Kalender mit CRLF, auch am Ende', () => {
    const ics = buildIcs(workshop(), ORIGIN, URL)

    assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\n'))
    assert.ok(ics.endsWith('END:VCALENDAR\r\n'))
    assert.doesNotMatch(ics.replaceAll('\r\n', ''), /\n/)
  })

  it('rechnet Schweizer Zeit in UTC um, im Winter und im Sommer', () => {
    const winter = unfolded(buildIcs(workshop(), ORIGIN, URL))
    const summer = unfolded(buildIcs(workshop({ date: '2027-06-12' }), ORIGIN, URL))

    assert.ok(winter.includes('DTSTART:20261128T090000Z'))
    assert.ok(winter.includes('DTEND:20261128T160000Z'))
    assert.ok(summer.includes('DTSTART:20270612T080000Z'))
  })

  it('behält die UID pro Workshop und zählt die Fassung über updated_at', () => {
    const first = unfolded(buildIcs(workshop(), ORIGIN, URL))
    const later = unfolded(buildIcs(workshop({ updated_at: 1_800_000_500 }), ORIGIN, URL))

    assert.ok(first.includes('UID:workshop-abc@naira-tufting.ch'))
    assert.ok(later.includes('UID:workshop-abc@naira-tufting.ch'))
    assert.ok(first.includes('SEQUENCE:1800000000'))
    assert.ok(later.includes('SEQUENCE:1800000500'))
  })

  it('liefert einen abgesagten Workshop als CANCELLED aus', () => {
    assert.ok(unfolded(buildIcs(workshop({ status: 'cancelled' }), ORIGIN, URL)).includes('STATUS:CANCELLED'))
    assert.ok(unfolded(buildIcs(workshop(), ORIGIN, URL)).includes('STATUS:CONFIRMED'))
  })

  it('nimmt den Hinweis maskiert in die Beschreibung', () => {
    const lines = unfolded(buildIcs(workshop({ note: 'Mit Apéro; bitte, alte Kleider' }), ORIGIN, URL))
    const description = lines.find((line) => line.startsWith('DESCRIPTION:'))

    assert.match(description ?? '', /Mit Apéro\\; bitte\\, alte Kleider/)
    assert.match(description ?? '', /\\nInfos: https:\/\/naira-tufting\.ch\/anmeldung\/abc/)
  })

  it('hält jede Zeile unter 75 Byte', () => {
    const ics = buildIcs(workshop({ note: 'Grössere Gruppen bitte vorher melden, für Teppiche über 60 cm — Ärmel hochkrempeln! '.repeat(3) }), ORIGIN, URL)

    for (const line of ics.split('\r\n')) {
      assert.ok(new TextEncoder().encode(line).length <= 75, line)
    }
  })
})

describe('foldLine', () => {
  it('lässt kurze Zeilen stehen', () => {
    assert.equal(foldLine('SUMMARY:Kurz'), 'SUMMARY:Kurz')
  })

  it('trennt nie mitten in einem Umlaut', () => {
    const folded = foldLine(`DESCRIPTION:${'ä'.repeat(60)}`)

    for (const line of folded.split('\r\n')) {
      assert.ok(new TextEncoder().encode(line).length <= 75)
      assert.doesNotMatch(line, /�/)
    }
    assert.equal(folded.replaceAll('\r\n ', ''), `DESCRIPTION:${'ä'.repeat(60)}`)
  })
})

describe('escapeText', () => {
  it('maskiert Backslash, Semikolon, Komma und Zeilenumbrüche', () => {
    assert.equal(escapeText('a\\b;c,d\ne\r\nf'), 'a\\\\b\\;c\\,d\\ne\\nf')
  })
})

describe('icsUtc', () => {
  it('schreibt die kompakte UTC-Form', () => {
    assert.equal(icsUtc('2026-11-28T10:00:00+01:00'), '20261128T090000Z')
  })
})

describe('buildIcs als Einladung', () => {
  const invite = {
    organizer: { name: 'Naira Ramos', email: 'tuftingstudio.bern@outlook.com' },
    attendee: { name: 'Mia "Mimi" Beispiel', email: 'mia@example.com' },
  }

  it('ist eine Einladung mit Veranstalterin und Gast, der antworten soll', () => {
    const lines = unfolded(buildIcs(workshop(), ORIGIN, URL, invite))

    assert.ok(lines.includes('METHOD:REQUEST'))
    assert.ok(lines.includes('ORGANIZER;CN="Naira Ramos":mailto:tuftingstudio.bern@outlook.com'))
    assert.ok(
      lines.includes(
        'ATTENDEE;CN="Mia Mimi Beispiel";CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:mia@example.com',
      ),
    )
  })

  it('behält die UID der öffentlichen Datei', () => {
    const uid = (ics: string) => unfolded(ics).find((line) => line.startsWith('UID:'))
    assert.equal(uid(buildIcs(workshop(), ORIGIN, URL, invite)), uid(buildIcs(workshop(), ORIGIN, URL)))
  })

  it('wird bei einem abgesagten Workshop zur Absage', () => {
    const lines = unfolded(buildIcs(workshop({ status: 'cancelled' }), ORIGIN, URL, invite))

    assert.ok(lines.includes('METHOD:CANCEL'))
    assert.ok(lines.includes('STATUS:CANCELLED'))
  })

  it('bleibt ohne Einladung eine Datei zum Importieren', () => {
    const lines = unfolded(buildIcs(workshop(), ORIGIN, URL))

    assert.ok(lines.includes('METHOD:PUBLISH'))
    assert.ok(!lines.some((line) => line.startsWith('ATTENDEE')))
  })

  it('faltet auch lange Teilnehmerzeilen unter 75 Byte', () => {
    const long = { ...invite, attendee: { name: 'Ä'.repeat(40), email: 'sehr.lange.adresse.fuer.den.test@example.com' } }

    for (const line of buildIcs(workshop(), ORIGIN, URL, long).split('\r\n')) {
      assert.ok(new TextEncoder().encode(line).length <= 75, line)
    }
  })
})
