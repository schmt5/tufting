/**
 * Öffnet die Tally-Formulare als Popup und hält den Button so lange im
 * Ladezustand, bis das Formular wirklich da ist.
 *
 * Warum nicht `data-tally-open`: embed.js bindet sich selbst an dieses Attribut,
 * kennt aber keinen Ladezustand — und ein Klick, der vor dem Laden von embed.js
 * passiert, geht dort ersatzlos verloren. Hier gehört der Klick uns: er setzt
 * zuerst den Zustand, lädt das Embed nach und öffnet danach.
 *
 * Nebeneffekt und Absicht zugleich: tally.so wird erst beim Klick kontaktiert —
 * genau so steht es in der Datenschutzerklärung (views/legal.ts).
 */

const EMBED = 'https://tally.so/widgets/embed.js'

/** Öffentliche Adresse eines Formulars — der Weg ohne Popup, siehe openForm(). */
const HOSTED = 'https://tally.so/r/'

/** Popup-Parameter, für alle Formulare dieselben (plan.md §Phase 3). */
const POPUP = { width: 420, hideTitle: true }

/** Notausstieg, falls das iframe nie meldet, dass es geladen ist. */
const TIMEOUT = 15000

const BUSY_LABEL = 'Öffnet …'

/** Das Embed wird einmal geladen und danach wiederverwendet. */
let embed = null

function loadEmbed() {
  if (embed) return embed

  embed = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = EMBED
    script.async = true
    script.addEventListener('load', () => resolve())
    script.addEventListener('error', () => {
      // Zurücksetzen, damit ein zweiter Klick es erneut versuchen darf.
      embed = null
      reject(new Error('Tally-Embed nicht ladbar'))
    })
    document.head.append(script)
  })

  return embed
}

/**
 * Wartet, bis das Popup fertig ist. Tallys eigenes `onOpen` feuert schon, wenn
 * das iframe eingehängt wird — da ist das Formular noch eine weisse Fläche.
 * Gewartet wird deshalb auf dessen `load`.
 *
 * Die Form-ID steckt in der iframe-Adresse; sie ist serverseitig geprüft
 * (workshops.ts, hasUsableId) und damit als Selektor unbedenklich.
 */
function whenLoaded(formId) {
  const selector = `iframe[src*="${formId}"]`

  // Beim zweiten Öffnen hängt das iframe noch im Dokument und wird nur wieder
  // hergezeigt. Dann gibt es nichts zu warten.
  if (document.querySelector(selector)) return Promise.resolve()

  return new Promise((resolve) => {
    const observer = new MutationObserver(() => {
      const frame = document.querySelector(selector)
      if (!frame) return

      observer.disconnect()
      frame.addEventListener('load', resolve, { once: true })
    })

    observer.observe(document.body, { childList: true, subtree: true })

    setTimeout(() => {
      observer.disconnect()
      resolve()
    }, TIMEOUT)
  })
}

/**
 * `aria-busy` statt einer Zustandsklasse: derselbe Weg wie `data-state` an der
 * Card — der Zustand steht im Markup und die Hilfstechnik liest ihn mit.
 * Die Beschriftung wechselt mit, weil ein Screenreader das `aria-label` des
 * Buttons vorliest und die Fläche allein nichts über das Warten sagt.
 */
function setBusy(button, busy, label) {
  if (busy) {
    button.setAttribute('aria-busy', 'true')
    button.textContent = BUSY_LABEL
    return
  }

  button.removeAttribute('aria-busy')
  button.textContent = label
}

async function openForm(button, formId) {
  if (button.getAttribute('aria-busy') === 'true') return

  const label = button.textContent

  setBusy(button, true, label)

  try {
    await loadEmbed()

    // Der Beobachter steht, bevor das Popup existiert — sonst entginge uns das
    // Einhängen des iframes.
    const loaded = whenLoaded(formId)
    window.Tally.openPopup(formId, POPUP)
    await loaded
    setBusy(button, false, label)
  } catch (error) {
    // Blockiert jemand tally.so, kommt das Popup nie. Statt eines Buttons, der
    // nichts tut, führt der Weg dann auf das Formular selbst.
    console.error(error)
    window.location.href = HOSTED + formId
  }
}

document.addEventListener('click', (event) => {
  const button = event.target instanceof Element ? event.target.closest('[data-form-id]') : null
  if (!button) return

  openForm(button, button.dataset.formId)
})
