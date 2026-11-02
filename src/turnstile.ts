/**
 * Serverseitige Prüfung des Turnstile-Tokens (siteverify). Der Browser holt
 * das Token, der Worker prüft es bei Cloudflare — nie umgekehrt.
 *
 * Schlägt irgendetwas fehl (Netz, Antwort, Inhalt), gilt die Prüfung als
 * nicht bestanden: lieber eine echte Anmeldung, die es nochmals versuchen
 * muss, als eine Spam-Anmeldung in Nairas Eingang.
 *
 * Doku: https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
 */

const SITEVERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'

/** Längere Tokens gibt es laut Doku nicht; alles darüber ist kein Token. */
const MAX_TOKEN_LENGTH = 2048

/** Siteverify antwortet sonst in Millisekunden; mehr Geduld hat das Formular nicht. */
const TIMEOUT_MS = 10_000

/** Feldname, unter dem das Widget sein Token ins Formular legt. */
export const TOKEN_FIELD = 'cf-turnstile-response'

/** Aktion des Anmeldeformulars — steht als data-action am Widget und wird hier verlangt. */
export const SIGNUP_ACTION = 'signup'

export interface TurnstileConfig {
  siteKey: string
  secretKey: string
  /** Hostnamen, von denen ein gültiges Token kommen darf. */
  hostnames: Set<string>
}

/**
 * Konfiguration aus Vars und Secret. Fehlt etwas, gibt es keine — und damit
 * auch keine Anmeldung, statt einer ungeschützten.
 */
export function turnstileConfig(env: {
  TURNSTILE_SITE_KEY?: string
  TURNSTILE_SECRET_KEY?: string
  TURNSTILE_HOSTNAMES?: string
}): TurnstileConfig | null {
  const siteKey = env.TURNSTILE_SITE_KEY?.trim() ?? ''
  const secretKey = env.TURNSTILE_SECRET_KEY?.trim() ?? ''
  const hostnames = new Set(
    (env.TURNSTILE_HOSTNAMES ?? '')
      .split(',')
      .map((hostname) => hostname.trim())
      .filter(Boolean),
  )

  if (!siteKey || !secretKey || hostnames.size === 0) return null
  return { siteKey, secretKey, hostnames }
}

interface SiteverifyResult {
  success?: boolean
  action?: string
  hostname?: string
  metadata?: { result_with_testing_key?: boolean }
}

export async function verifyTurnstile(
  config: TurnstileConfig,
  token: string,
  remoteIp: string | null,
  expectedAction: string,
): Promise<boolean> {
  if (!token || token.length > MAX_TOKEN_LENGTH) return false

  const body = new URLSearchParams({ secret: config.secretKey, response: token })
  if (remoteIp) body.set('remoteip', remoteIp)

  let result: SiteverifyResult

  try {
    const response = await fetch(SITEVERIFY, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!response.ok) throw new Error(`siteverify ${response.status}`)
    result = (await response.json()) as SiteverifyResult
  } catch (error) {
    console.error('Turnstile: siteverify nicht erreichbar', error)
    return false
  }

  if (result.success !== true) return false
  if (!result.hostname || !config.hostnames.has(result.hostname)) return false

  // Die Test-Schlüssel von Cloudflare (lokal, siehe .dev.vars.example) liefern
  // keine Aktion. Mit einem echten Secret steht das Flag nie — dort gilt die
  // Prüfung immer.
  if (result.metadata?.result_with_testing_key === true) return true

  return result.action === expectedAction
}
