import { html } from 'hono/html'
import type { Html } from './layout.ts'

/** Section "Ich bin Naira": Porträt und Biografie. */

const TITLE = 'Ich bin Naira'

const PORTRAIT = {
  src: '/img/naira.svg',
  alt: 'Platzhalter für ein Porträtfoto von Naira',
}

const PARAGRAPHS = [
  'Künstlerin und Kunstpädagogin. Geboren und aufgewachsen in Luzern, lebe und arbeite ich heute in Bern.',
  'Nach meinem Kunststudium in Hamburg und Luzern arbeite ich intermedial mit Objektinstallationen, Performance und textilen Medien. In meiner künstlerischen Praxis setze ich mich mit Selbstbestimmung und feministischer Körperpolitik auseinander.',
  'Parallel dazu begleite ich seit vielen Jahren Menschen in kreativen Prozessen und unterrichte bildnerisches, technisches und textiles Gestalten in Schulen sowie Kunst, Tanz und Performance in unterschiedlichen sozialen Kontexten.',
  'Im Tufting habe ich ein Medium gefunden, das meine Leidenschaft für Formen, Farben und Strukturen auf besondere Weise vereint. Mit Tufting male ich Bilder – nicht mit Pinsel auf Leinwand, sondern mit Garn. Experimentell und intuitiv entstehen so Unikate, die sich zwischen Malerei, Objekt und Teppich bewegen und nicht nur betrachtet, sondern auch berührt und erlebt werden wollen.',
  'Diese Begeisterung möchte ich in meinen Workshops weitergeben. Ich wünsche mir einen Ort, an dem Menschen kreativ experimentieren, zur Ruhe kommen und die Freude am handwerklichen Gestalten entdecken können, ganz unabhängig von Vorkenntnissen.',
]

export function renderAbout(): Html {
  return html`<section class="section" id="ueber-mich">
      <div class="wrap about">
        <img
          class="media about__portrait"
          src="${PORTRAIT.src}"
          alt="${PORTRAIT.alt}"
          width="450"
          height="600"
          loading="lazy"
          decoding="async"
        />
        <div class="about__text prose">
          <h2 class="section__title">${TITLE}</h2>
          ${PARAGRAPHS.map((text) => html`<p>${text}</p>`)}
        </div>
      </div>
    </section>`
}
