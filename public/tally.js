/**
 * Startet die Embeds auf den Formularseiten.
 *
 * Das Formular meldet seine Höhe über iframe-resizer. Die Gegenstelle dazu
 * steckt in `embed.js` und wird erst von `Tally.loadEmbeds()` an ein iframe
 * gehängt — ohne diesen Aufruf bleibt das Formular auf seiner Anfangshöhe
 * stehen und scrollt in sich selbst. Genau das war der Grund, weg vom Popup zu
 * gehen, also muss der Aufruf hier stehen.
 *
 * `loadEmbeds()` kennt zwei Wege. Ein iframe mit `data-tally-src` und ohne
 * `src` wird über einen IntersectionObserver gestartet, also erst kurz bevor es
 * sichtbar wird. Ein iframe mit gesetztem `src` bekommt den Resizer sofort —
 * diesen Weg nimmt views/signup.ts, weil das Formular dort der Inhalt der
 * Seite ist und nicht auf Sichtbarkeit warten soll. Trägt ein iframe beide
 * Attribute, greift keiner der beiden Wege.
 */

const EMBED = 'https://tally.so/widgets/embed.js'

function attach() {
  // Mehrfach aufzurufen ist ungefährlich: embed.js merkt sich pro iframe, dass
  // es schon initialisiert ist.
  window.Tally?.loadEmbeds()
}

if (window.Tally) {
  attach()
} else {
  const script = document.createElement('script')
  script.src = EMBED
  script.async = true
  script.addEventListener('load', attach)
  document.body.append(script)
}
