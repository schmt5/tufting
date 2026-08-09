import { html } from 'hono/html'
import type { Html } from './layout.ts'

export interface GalleryImage {
  src: string
  /** Bildbeschreibung für Screenreader. */
  alt: string
  /** Kurzer Name des Bildes — wird zum zugänglichen Namen seines Scroll-Markers. */
  label: string
}

/**
 * Platzhalter. Echte Bilder ersetzen diese Liste 1:1 — Seitenverhältnis 3:2,
 * die Datei kommt nach public/img/.
 */
export const GALLERY: GalleryImage[] = [
  { src: '/img/carousel-1.svg', alt: 'Platzhalter für ein Bild aus der Werkstatt', label: 'Bild 1' },
  { src: '/img/carousel-2.svg', alt: 'Platzhalter für ein Bild aus der Werkstatt', label: 'Bild 2' },
  { src: '/img/carousel-3.svg', alt: 'Platzhalter für ein Bild aus der Werkstatt', label: 'Bild 3' },
  { src: '/img/carousel-4.svg', alt: 'Platzhalter für ein Bild aus der Werkstatt', label: 'Bild 4' },
]

/**
 * Das erste Bild ist above the fold und in der Regel das LCP-Element: es lädt
 * eager und mit hoher Priorität, die übrigen erst beim Scrollen.
 *
 * CSS-only Carousel als erste Section der Seite: horizontal scrollende Liste
 * mit Scroll-Snap. Pfeile und Punkte entstehen in unterstützenden Browsern aus
 * ::scroll-button() und ::scroll-marker — kein JavaScript, kein zusätzliches
 * Markup dafür.
 *
 * Die Section trägt keine sichtbare Überschrift, aber ein aria-label: sonst
 * wäre der Bereich für Screenreader namenlos.
 *
 * data-label liefert dem Marker seinen zugänglichen Namen (content: attr()),
 * sonst hätten die Punkte keinen.
 *
 * tabindex="0" am Streifen ist nicht optional: wo ::scroll-button() fehlt
 * (Safari, Firefox), sind die Pfeiltasten der einzige Weg zu Bild 2 und
 * folgenden. Chrome fokussiert Scroller inzwischen von selbst und erzeugt mit
 * dem expliziten Attribut keinen zweiten Tabstopp.
 *
 * role="list" ist nötig, weil list-style:none der ul in Safari die
 * Listensemantik nimmt.
 */
export function renderGallery(images: GalleryImage[] = GALLERY): Html | string {
  if (images.length === 0) return ''

  return html`<section class="section section--flush" aria-label="Impressionen">
      <div class="wrap">
        <ul class="carousel" role="list" tabindex="0">
          ${images.map(
            (image, index) => html`<li class="carousel__item" data-label="${image.label}">
              <img
                class="media"
                src="${image.src}"
                alt="${image.alt}"
                width="600"
                height="400"
                decoding="async"
                loading="${index === 0 ? 'eager' : 'lazy'}"
                fetchpriority="${index === 0 ? 'high' : 'auto'}"
              />
            </li>`,
          )}
        </ul>
      </div>
    </section>`
}
