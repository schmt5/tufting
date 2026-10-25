import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { TallyQuestion } from './tally.ts'
import {
  deriveState,
  formatTimeRange,
  fromDatabase,
  zurichDateTime,
  zurichOffset,
  hasUsableId,
  parseFreeSpots,
  parseHiddenFields,
  parseWorkshopDate,
  todayInZurich,
} from './workshops.ts'

function hiddenFieldsQuestion(titles: (string | null)[], isDeleted = false): TallyQuestion {
  return {
    id: 'gZgG5l',
    type: 'HIDDEN_FIELDS',
    title: null,
    formId: 'VLa1Rj',
    isDeleted,
    numberOfResponses: 0,
    fields: titles.map((title, index) => ({
      uuid: `uuid-${index}`,
      type: 'HIDDEN_FIELD',
      blockGroupUuid: 'group',
      title,
    })),
  }
}

describe('parseHiddenFields', () => {
  it('liest key=value aus den HIDDEN_FIELDS', () => {
    const values = parseHiddenFields([hiddenFieldsQuestion(['date=12-08-2026', 'freeSpots=4'])])

    assert.equal(values.get('date'), '12-08-2026')
    assert.equal(values.get('freespots'), '4')
  })

  it('trennt nur am ersten = — Werte dürfen weitere enthalten', () => {
    const values = parseHiddenFields([hiddenFieldsQuestion(['utm=a=b&c=d'])])

    assert.equal(values.get('utm'), 'a=b&c=d')
  })

  it('ignoriert gelöschte Blöcke', () => {
    const values = parseHiddenFields([hiddenFieldsQuestion(['date=12-08-2026'], true)])

    assert.equal(values.size, 0)
  })

  it('ignoriert andere Fragetypen', () => {
    const question: TallyQuestion = {
      ...hiddenFieldsQuestion(['date=12-08-2026']),
      type: 'INPUT_TEXT',
    }

    assert.equal(parseHiddenFields([question]).size, 0)
  })

  it('ignoriert Titel ohne =, leere Keys und null', () => {
    const values = parseHiddenFields([hiddenFieldsQuestion(['Name', '=4', null, ''])])

    assert.equal(values.size, 0)
  })

  it('trimmt Key und Wert und ist beim Key case-insensitiv', () => {
    const values = parseHiddenFields([hiddenFieldsQuestion([' FreeSpots = 2 '])])

    assert.equal(values.get('freespots'), '2')
  })
})

describe('parseWorkshopDate', () => {
  it('liest DD-MM-YYYY', () => {
    assert.equal(parseWorkshopDate('12-08-2026'), '2026-08-12')
  })

  it('liest das kompakte Altformat DDMMYYYY', () => {
    assert.equal(parseWorkshopDate('12082026'), '2026-08-12')
  })

  it('verwirft nicht existierende Kalendertage statt sie zu verschieben', () => {
    assert.equal(parseWorkshopDate('31-02-2026'), null)
    assert.equal(parseWorkshopDate('00-01-2026'), null)
    assert.equal(parseWorkshopDate('01-13-2026'), null)
  })

  it('kennt Schaltjahre', () => {
    assert.equal(parseWorkshopDate('29-02-2028'), '2028-02-29')
    assert.equal(parseWorkshopDate('29-02-2026'), null)
  })

  it('verwirft Müll, Leerstring und undefined', () => {
    assert.equal(parseWorkshopDate(''), null)
    assert.equal(parseWorkshopDate(undefined), null)
    assert.equal(parseWorkshopDate('bald'), null)
    assert.equal(parseWorkshopDate('2026-08-12'), null)
    assert.equal(parseWorkshopDate('1-8-2026'), null)
  })
})

describe('parseFreeSpots', () => {
  it('liest ganze Zahlen inklusive 0', () => {
    assert.equal(parseFreeSpots('4'), 4)
    assert.equal(parseFreeSpots('0'), 0)
    assert.equal(parseFreeSpots(' 2 '), 2)
  })

  it('gibt null für alles andere — unbekannt, nicht 0', () => {
    assert.equal(parseFreeSpots(undefined), null)
    assert.equal(parseFreeSpots(''), null)
    assert.equal(parseFreeSpots('viele'), null)
    assert.equal(parseFreeSpots('-1'), null)
    assert.equal(parseFreeSpots('2.5'), null)
  })
})

describe('deriveState', () => {
  it('ist an den Grenzen 0/1/2/3 korrekt', () => {
    assert.equal(deriveState(0), 'soldOut')
    assert.equal(deriveState(1), 'low')
    assert.equal(deriveState(2), 'low')
    assert.equal(deriveState(3), 'open')
    assert.equal(deriveState(4), 'open')
  })

  it('behandelt unbekannt als offen', () => {
    assert.equal(deriveState(null), 'open')
  })
})

describe('hasUsableId', () => {
  it('lässt Tally-IDs durch', () => {
    assert.equal(hasUsableId('VLa1Rj'), true)
    assert.equal(hasUsableId('form_id-2'), true)
  })

  it('verwirft alles, was nicht in eine URL gehört', () => {
    assert.equal(hasUsableId(''), false)
    assert.equal(hasUsableId('../andere'), false)
    assert.equal(hasUsableId('a b'), false)
    assert.equal(hasUsableId('"><script>'), false)
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
  it('bleibt leer, solange die Uhrzeit unbekannt ist', () => {
    assert.equal(formatTimeRange({ startTime: null, endTime: null }), null)
  })
})
