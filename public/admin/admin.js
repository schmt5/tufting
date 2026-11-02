/**
 * Script des Admins: bietet bei den Anmeldungen „Mail mit Kalender“ und
 * „Text kopieren“ an und macht Menüs und Rückmeldung bequemer. Alles andere
 * im Admin funktioniert ohne JavaScript.
 */

// Früher zeigte ein Service Worker Push-Mitteilungen. Wo er noch installiert
// ist, abmelden — damit endet auch die Push-Anmeldung des Geräts.
navigator.serviceWorker?.getRegistrations().then((registrations) => {
  for (const registration of registrations) registration.unregister()
})

for (const button of document.querySelectorAll('[data-copy]')) setupCopy(button)
for (const button of document.querySelectorAll('[data-invite]')) setupInvite(button)
setupMenus()
setupToast()

/**
 * Die Menüs „⋮“ sind <details> und gehen auch ohne Script auf und zu. Hier
 * nur, was ein Menü sonst noch tut: ein Klick daneben oder Escape schliesst
 * es, und es ist immer nur eines offen.
 */
function setupMenus() {
  const menus = [...document.querySelectorAll('[data-menu]')]
  if (menus.length === 0) return

  const closeAll = (except) => {
    for (const menu of menus) if (menu !== except) menu.open = false
  }

  for (const menu of menus) {
    menu.addEventListener('toggle', () => {
      if (menu.open) closeAll(menu)
    })
  }

  document.addEventListener('click', (event) => {
    if (!event.target.closest('[data-menu]')) closeAll()
  })

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return
    const open = menus.find((menu) => menu.open)
    if (!open) return
    open.open = false
    open.querySelector('summary')?.focus()
  })
}

/** Die Rückmeldung unten rechts lässt sich wegklicken. */
function setupToast() {
  const toast = document.querySelector('[data-toast]')
  const close = toast?.querySelector('[data-toast-close]')
  if (!close) return

  close.hidden = false
  close.addEventListener('click', () => toast.remove())
}

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
