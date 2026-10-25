/**
 * Bindings und Secrets des Workers. Von Hand gepflegt statt aus
 * worker-configuration.d.ts, weil die generierte Datei die Secrets aus der
 * lokalen .dev.vars liest — auf einem Rechner ohne diese Datei fehlten sie.
 */
export interface Env {
  DB: D1Database
  TALLY_TOKEN: string
  /**
   * Passwort des einzigen Admin-Kontos (`wrangler secret put ADMIN_PASSWORD`).
   * Fehlt es, ist der Admin gesperrt statt offen.
   */
  ADMIN_PASSWORD?: string
  /**
   * Schlüssel für das Session-Cookie, mindestens 32 Zeichen. Ihn zu wechseln
   * beendet alle Sessions auf allen Geräten.
   */
  SESSION_SECRET?: string
  /**
   * Woher die öffentliche Seite Termine und Anmeldung nimmt: `tally` (bisher)
   * oder `d1` (eigene Anmeldung). Alles ausser `d1` heisst Tally — so bleibt
   * ein Tippfehler bei der alten, funktionierenden Seite.
   */
  SIGNUP_BACKEND?: string
  /** Öffentlicher Schlüssel des Turnstile-Widgets (Var). */
  TURNSTILE_SITE_KEY?: string
  /** Geheimer Schlüssel für siteverify (`wrangler secret put TURNSTILE_SECRET_KEY`). */
  TURNSTILE_SECRET_KEY?: string
  /**
   * Hostnamen, von denen ein Token kommen darf, kommagetrennt. In Produktion
   * nur die echte Domain, nie localhost.
   */
  TURNSTILE_HOSTNAMES?: string
  /** Öffentlicher VAPID-Schlüssel für Web Push (Var), base64url. */
  VAPID_PUBLIC_KEY?: string
  /** Privater VAPID-Schlüssel (`wrangler secret put VAPID_PRIVATE_KEY`), base64url. */
  VAPID_PRIVATE_KEY?: string
  /** Kontakt für die Push-Dienste, z.B. `mailto:…` (Var). */
  VAPID_SUBJECT?: string
}

export function usesDatabase(env: Env): boolean {
  return env.SIGNUP_BACKEND === 'd1'
}
