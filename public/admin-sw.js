/**
 * Service Worker des Admins: zeigt Push-Mitteilungen und öffnet beim Tipp den
 * Termin. Sonst nichts — bewusst kein Offline-Cache: die Seiten enthalten
 * Personendaten, die nicht auf dem Gerät liegen bleiben sollen, und eine alte
 * Belegung wäre schlimmer als „offline“ (plan.md §6).
 *
 * Liegt im Wurzelverzeichnis statt unter /admin/, damit er für den Bereich
 * `/admin` gelten darf — ein Service Worker unter /admin/ reichte nur bis
 * `/admin/…`, die Übersicht `/admin` selbst läge ausserhalb.
 */

const FALLBACK = { title: 'Naira Admin', body: '', url: '/admin' }

self.addEventListener('install', () => {
  // Eine neue Version sofort übernehmen statt erst nach dem Schliessen aller Tabs.
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('push', (event) => {
  let message = FALLBACK

  try {
    message = { ...FALLBACK, ...event.data?.json() }
  } catch {
    // Unlesbarer Inhalt: trotzdem eine Mitteilung zeigen. Safari entzieht die
    // Push-Erlaubnis, wenn ein Push ohne sichtbare Mitteilung endet.
  }

  event.waitUntil(
    self.registration.showNotification(message.title, {
      body: message.body,
      icon: '/admin/icon-192.png',
      lang: 'de-CH',
      data: { url: message.url },
    }),
  )
})

/** Nur Adressen des Admins öffnen — nie eine fremde aus dem Inhalt der Mitteilung. */
function adminUrl(value) {
  const url = new URL(value ?? '/admin', self.location.origin)
  return url.origin === self.location.origin && url.pathname.startsWith('/admin') ? url.href : `${self.location.origin}/admin`
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = adminUrl(event.notification.data?.url)

  event.waitUntil(
    (async () => {
      // Ist der Admin schon offen, dorthin wechseln statt ein zweites Fenster zu öffnen.
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      const open = windows.find((client) => new URL(client.url).pathname.startsWith('/admin'))

      if (open) {
        await open.focus()
        return open.navigate(target)
      }
      return self.clients.openWindow(target)
    })(),
  )
})
