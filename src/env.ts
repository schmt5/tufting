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
}
