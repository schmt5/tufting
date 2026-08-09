import { html } from 'hono/html'
import { WORKSHOP } from '../site.ts'
import type { Html } from './layout.ts'

/**
 * Section "Tufting-Workshops in Bern": Titel, Einleitung, Fakten, Preise und
 * das 2×2-Bildraster. Der Text steht hier als Konstante — es gibt kein CMS
 * (siehe plan.md §8), Änderungen sind ein Deploy.
 *
 * Preis und Gruppengrösse kommen aus site.ts, weil dieselben Zahlen im JSON-LD
 * stehen und nicht auseinanderlaufen dürfen.
 */

const LEAD = 'Tufte deinen eigenen Teppich!'

const PARAGRAPHS = [
  'Ich bin Naira und in meinem Studio in Bern zeige ich dir, wie du deinen eigenen Teppich/Wandbild/Kissen tuftest.',
  'Tufte dein gewünschtes Motiv oder einfach freestyle drauf los.',
]

const FACTS = [
  'Teppichwerk ca. 70 × 50 cm',
  'Keine Vorkenntnisse nötig',
  'Material inklusive',
  `In kleiner Runde, max. ${WORKSHOP.maxAttendees} Personen`,
]

const PRICES = [
  `${WORKSHOP.price} ${WORKSHOP.currency}: für dich alleine.`,
  '270 CHF: bring deine Freund*in mit – beide zahlen je 270 CHF.',
  '260 CHF: kommt zu viert und ihr bezahlt je 260 CHF.',
]

const DETAILS = ['Dauer: 6–7 Stunden', 'Ort: Bern Eigerplatz']

/**
 * Bilder des Rasters. Sie zeigen dieselbe Sache wie der Text daneben und sind
 * damit dekorativ: alt="" statt viermal derselbe Satz, den ein Screenreader
 * sonst viermal vorliest.
 *
 * Echte Fotos ersetzen die Liste 1:1, Seitenverhältnis 4:3 — und bekommen dann
 * je einen eigenen, beschreibenden Alt-Text.
 */
const IMAGES = [
  { src: '/img/workshop-1.svg', alt: '' },
  { src: '/img/workshop-2.svg', alt: '' },
  { src: '/img/workshop-3.svg', alt: '' },
  { src: '/img/workshop-4.svg', alt: '' },
]

export function renderIntro(title: string): Html {
  return html`<section class="section" id="workshops">
      <div class="wrap intro">
        <div class="intro__text prose">
          <h1 class="page-title">${title}</h1>
          <p class="lead">${LEAD}</p>
          ${PARAGRAPHS.map((text) => html`<p>${text}</p>`)}

          <ul class="facts" role="list">
            ${FACTS.map((fact) => html`<li>${fact}</li>`)}
          </ul>

          <h2 class="subheading">Kosten</h2>
          <ul class="facts" role="list">
            ${PRICES.map((price) => html`<li>${price}</li>`)}
          </ul>

          <ul class="facts" role="list">
            ${DETAILS.map((detail) => html`<li>${detail}</li>`)}
          </ul>
        </div>

        <div class="intro__media">
          ${IMAGES.map(
            (image) =>
              html`<img class="media" src="${image.src}" alt="${image.alt}" width="400" height="300" loading="lazy" decoding="async" />`,
          )}
        </div>
      </div>
    </section>`
}
