/**
 * Script des Admins: registriert den Service Worker und meldet auf der Seite
 * „Mitteilungen“ das Gerät für Push an. Alles andere im Admin funktioniert
 * ohne JavaScript.
 */

const SERVICE_WORKER = '/admin-sw.js'
const SCOPE = '/admin'

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register(SERVICE_WORKER, { scope: SCOPE }).catch((error) => {
    console.error('Service Worker nicht registriert', error)
  })
}

const root = document.querySelector('[data-push]')
if (root) setupPush(root)

function base64urlToBytes(value) {
  const base64 = value.replaceAll('-', '+').replaceAll('_', '/')
  const binary = atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4))
  return Uint8Array.from(binary, (char) => char.charCodeAt(0))
}

function sameBytes(a, b) {
  if (!a || !b || a.byteLength !== b.byteLength) return false
  const left = new Uint8Array(a)
  const right = new Uint8Array(b)
  return left.every((byte, index) => byte === right[index])
}

/** Ein Name, an dem Naira das Gerät in der Liste wiedererkennt. */
function deviceLabel() {
  const agent = navigator.userAgent
  if (/iPhone/.test(agent)) return 'iPhone'
  if (/iPad/.test(agent) || (/Macintosh/.test(agent) && navigator.maxTouchPoints > 1)) return 'iPad'
  if (/Android/.test(agent)) return 'Android'
  if (/Macintosh/.test(agent)) return 'Mac'
  if (/Windows/.test(agent)) return 'Windows'
  return 'Gerät'
}

function isIos() {
  return /iPhone|iPad|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1)
}

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true
}

async function setupPush(root) {
  const status = root.querySelector('[data-push-status]')
  const button = root.querySelector('[data-push-enable]')
  const iosHint = root.querySelector('[data-push-ios]')
  const serverKey = base64urlToBytes(root.dataset.vapidKey)

  const supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window

  if (!supported) {
    // Auf dem iPhone gibt es Push erst in der installierten App.
    if (isIos() && !isStandalone()) {
      status.textContent = 'In Safari geht das nicht — nur in der App auf dem Home-Bildschirm.'
      iosHint.hidden = false
    } else {
      status.textContent = 'Dieser Browser kann keine Mitteilungen empfangen.'
    }
    return
  }

  if (Notification.permission === 'denied') {
    status.textContent = 'Mitteilungen sind für den Admin blockiert. In den Einstellungen des Geräts erlauben, dann diese Seite neu laden.'
    return
  }

  const registration = await navigator.serviceWorker.ready
  let existing = await registration.pushManager.getSubscription()

  // Neue VAPID-Schlüssel auf dem Server: die alte Anmeldung gilt nicht mehr.
  if (existing && !sameBytes(existing.options.applicationServerKey, serverKey)) {
    await existing.unsubscribe()
    existing = null
  }

  if (existing && Notification.permission === 'granted') {
    status.textContent = 'Auf diesem Gerät sind Mitteilungen aktiv.'
    button.textContent = 'Dieses Gerät neu anmelden'
  } else {
    status.textContent = 'Auf diesem Gerät sind Mitteilungen noch nicht aktiv.'
  }
  button.hidden = false

  button.addEventListener('click', async () => {
    button.disabled = true

    try {
      // Muss direkt aus dem Klick kommen, sonst fragt Safari gar nicht erst.
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        status.textContent = 'Ohne Erlaubnis gibt es keine Mitteilungen.'
        return
      }

      const subscription =
        existing ?? (await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: serverKey }))
      const { endpoint, keys } = subscription.toJSON()

      const response = await fetch('/admin/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint, keys, label: deviceLabel() }),
      })
      if (!response.ok) throw new Error(`Server antwortet ${response.status}`)

      window.location.reload()
    } catch (error) {
      console.error('Push-Anmeldung fehlgeschlagen', error)
      status.textContent = 'Das hat nicht geklappt. Bitte nochmals versuchen.'
    } finally {
      button.disabled = false
    }
  })
}
