/**
 * Script des Admins: registriert den Service Worker, meldet auf der Seite
 * „Mitteilungen“ das Gerät für Push an und bietet bei den Anmeldungen
 * „Mail mit Kalender“ und „Text kopieren“ an. Alles andere im Admin
 * funktioniert ohne JavaScript.
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

for (const button of document.querySelectorAll('[data-copy]')) setupCopy(button)
for (const button of document.querySelectorAll('[data-invite]')) setupInvite(button)

/** Kurze Rückmeldung auf dem Button selbst, danach wieder der alte Text. */
function flashButton(button, text) {
  const original = button.textContent
  button.textContent = text
  setTimeout(() => {
    button.textContent = original
  }, 2000)
}

/**
 * „Text kopieren“: für Mail-Apps, die mit einem langen mailto-Link nicht
 * zurechtkommen. Nur sichtbar, wo es die Zwischenablage gibt.
 */
function setupCopy(button) {
  if (!navigator.clipboard?.writeText) return
  button.hidden = false

  button.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(button.dataset.copy)
      flashButton(button, 'Kopiert')
    } catch (error) {
      console.error('Kopieren fehlgeschlagen', error)
      flashButton(button, 'Ging nicht')
    }
  })
}

/** Kann dieses Gerät Dateien über das Teilen-Menü weitergeben? Meist nur Handys und Safari. */
function canShareFiles() {
  const probe = new File([''], 'probe.ics', { type: 'text/calendar' })
  return Boolean(navigator.canShare?.({ files: [probe] }))
}

/**
 * „Mail mit Kalender“: öffnet das Teilen-Menü mit dem ausgefüllten Text und der
 * Einladung als Anhang. In Mail gewählt, kommt der Text in die Nachricht und die
 * Einladung als Datei dazu — so schlagen Gmail und Outlook den Termin vor.
 *
 * Die Datei wird schon beim Laden geholt: iOS öffnet das Teilen-Menü nur
 * direkt aus dem Tippen heraus, und ein Download dazwischen kostet genau diese
 * Erlaubnis. Den Empfänger kann das Teilen-Menü nicht setzen — die Adresse
 * landet deshalb in der Zwischenablage, zum Einfügen ins Feld „An“.
 */
async function setupInvite(button) {
  if (!canShareFiles()) return

  let file
  try {
    const response = await fetch(button.dataset.invite)
    if (!response.ok) throw new Error(`Einladung: ${response.status}`)
    file = new File([await response.blob()], button.dataset.inviteName, { type: 'text/calendar' })
  } catch (error) {
    // Ohne Datei bleibt es bei „E-Mail schreiben“ mit dem Link im Text.
    console.error('Einladung nicht geladen', error)
    return
  }

  button.hidden = false
  // Wo der Anhang geht, ist er der Hauptweg; der mailto-Link tritt zurück.
  button.parentElement?.querySelector('[data-mail-fallback]')?.classList.add('button--secondary')
  for (const hint of document.querySelectorAll('[data-invite-hint]')) hint.hidden = false

  button.addEventListener('click', async () => {
    // Nicht abwarten: die Zwischenablage darf das Teilen nicht verzögern.
    navigator.clipboard?.writeText(button.dataset.mailTo).catch(() => {})

    try {
      await navigator.share({
        files: [file],
        title: button.dataset.mailSubject,
        text: button.dataset.mailBody,
      })
    } catch (error) {
      // Abbrechen im Teilen-Menü ist kein Fehler.
      if (error?.name !== 'AbortError') {
        console.error('Teilen fehlgeschlagen', error)
        flashButton(button, 'Ging nicht')
      }
    }
  })
}

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
