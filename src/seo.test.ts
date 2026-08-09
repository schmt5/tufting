import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { buildGraph, jsonLd } from './seo.ts'
import type { Workshop } from './workshops.ts'

const ORIGIN = 'https://example.ch'

function workshop(overrides: Partial<Workshop> = {}): Workshop {
  return {
    id: 'VLa1Rj',
    name: 'Workshop August',
    date: '2026-08-12',
    freeSpots: 4,
    state: 'open',
    ...overrides,
  }
}

/** Findet den ersten Knoten eines Typs im @graph. */
function node(graph: object, type: string): Record<string, unknown> {
  const entries = (graph as { '@graph': Record<string, unknown>[] })['@graph']
  const found = entries.find((entry) => entry['@type'] === type)
  assert.ok(found, `kein ${type} im Graph`)
  return found
}

describe('jsonLd', () => {
  it('escapt < — sonst beendet ein Wert aus der API das Script vorzeitig', () => {
    const out = String(jsonLd({ name: '</script><img src=x onerror=alert(1)>' }))

    assert.ok(!out.includes('</script><img'))
    assert.ok(out.includes('\\u003c/script'))
    // Genau ein schliessendes Tag: das eigene.
    assert.equal(out.match(/<\/script>/g)?.length, 1)
  })

  it('bleibt gültiges JSON', () => {
    const out = String(jsonLd({ name: 'a < b' }))
    const json = out.slice(out.indexOf('>') + 1, out.lastIndexOf('</script>'))

    assert.deepEqual(JSON.parse(json), { name: 'a < b' })
  })
})

describe('buildGraph', () => {
  it('enthält das Studio und ein Event pro Workshop', () => {
    const graph = buildGraph([workshop(), workshop({ id: 'abc123', date: '2026-09-02' })], ORIGIN)
    const entries = (graph as { '@graph': unknown[] })['@graph']

    assert.equal(entries.length, 3)
    assert.equal(node(graph, 'LocalBusiness')['@id'], `${ORIGIN}/#business`)
  })

  it('verweist vom Event auf das Studio statt die Adresse zu wiederholen', () => {
    const event = node(buildGraph([workshop()], ORIGIN), 'Event')

    assert.deepEqual(event.location, { '@id': `${ORIGIN}/#business` })
    assert.deepEqual(event.organizer, { '@id': `${ORIGIN}/#business` })
  })

  it('meldet ausgebucht über die Verfügbarkeit des Angebots', () => {
    const open = node(buildGraph([workshop()], ORIGIN), 'Event')
    const sold = node(buildGraph([workshop({ freeSpots: 0, state: 'soldOut' })], ORIGIN), 'Event')

    assert.equal((open.offers as Record<string, unknown>).availability, 'https://schema.org/InStock')
    assert.equal((sold.offers as Record<string, unknown>).availability, 'https://schema.org/SoldOut')
  })

  it('lässt die Restplätze weg, wenn sie unbekannt sind', () => {
    const known = node(buildGraph([workshop({ freeSpots: 2, state: 'low' })], ORIGIN), 'Event')
    const unknown = node(buildGraph([workshop({ freeSpots: null })], ORIGIN), 'Event')

    assert.equal(known.remainingAttendeeCapacity, 2)
    assert.ok(!('remainingAttendeeCapacity' in unknown))
  })

  it('führt das Angebot auf die eigene Anmeldeseite', () => {
    const event = node(buildGraph([workshop({ id: 'VLa1Rj' })], ORIGIN), 'Event')

    assert.equal((event.offers as Record<string, unknown>).url, `${ORIGIN}/anmeldung/VLa1Rj`)
  })

  it('ist ohne Workshops immer noch ein gültiger Graph', () => {
    const graph = buildGraph([], ORIGIN)

    assert.equal((graph as { '@graph': unknown[] })['@graph'].length, 1)
    assert.doesNotThrow(() => JSON.parse(JSON.stringify(graph)))
  })
})
