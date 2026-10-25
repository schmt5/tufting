import { html } from 'hono/html'
import { BUSINESS, hasAddress } from '../site.ts'
import type { Html } from './layout.ts'

/**
 * Impressum und Datenschutzerklärung.
 *
 * Was sich aus dem Code ergibt, steht hier ausformuliert: Hosting auf
 * Cloudflare Workers, die Anmeldung über Tally oder die eigene Datenbank je
 * nach SIGNUP_BACKEND, Turnstile, die Mitteilung an die Betreiberin — alles
 * Bearbeitungen, die genannt werden müssen. Alles, was nur die Betreiberin
 * weiss, steht als sichtbarer Platzhalter da und nicht als erfundener Satz.
 *
 * Das ist eine Vorlage, keine Rechtsberatung. Vor dem Aufschalten prüfen lassen.
 */

/** Sichtbarer Platzhalter — fällt beim Korrekturlesen auf, anders als eine Lücke. */
function todo(what: string): Html {
  return html`<mark class="todo">[${what} ergänzen]</mark>`
}

function contactBlock(): Html {
  return html`<p>
      ${BUSINESS.name}<br />
      ${BUSINESS.person}<br />
      ${hasAddress()
        ? html`${BUSINESS.street}<br />${BUSINESS.postalCode} ${BUSINESS.locality}<br />`
        : html`${todo('Strasse, PLZ und Ort')}<br />`}
      ${BUSINESS.email
        ? html`<a href="mailto:${BUSINESS.email}">${BUSINESS.email}</a>`
        : todo('E-Mail-Adresse')}
    </p>`
}

/**
 * Kein Abschnitt zu Rechtsform und Register: es gibt keinen
 * Handelsregistereintrag, und ein Registerabschnitt ohne Eintrag behauptet
 * das Gegenteil. Kommt einer dazu, gehören Firmenname, UID und Sitz zwischen
 * Kontakt und Haftung.
 *
 * Der Hinweis steht hier und nicht als HTML-Kommentar im Markup — der würde
 * mit ausgeliefert.
 */
export function renderImprint(): Html {
  return html`<section class="section">
      <div class="wrap prose prose--narrow">
        <h1 class="page-title">Impressum</h1>

        <h2 class="section__title">Verantwortlich für den Inhalt</h2>
        ${contactBlock()}

        <h2 class="section__title">Haftung</h2>
        <p>
          Die Inhalte dieser Seite werden mit Sorgfalt erstellt. Für Richtigkeit,
          Vollständigkeit und Aktualität wird keine Gewähr übernommen. Für Inhalte
          externer Seiten, auf die verlinkt wird, sind deren Betreiber verantwortlich.
        </p>

        <h2 class="section__title">Urheberrecht</h2>
        <p>
          Texte, Bilder und Gestaltung dieser Seite sind urheberrechtlich geschützt.
          Eine Verwendung ausserhalb der gesetzlichen Schranken bedarf der schriftlichen
          Zustimmung.
        </p>
      </div>
    </section>`
}

/** Anmeldung über die eingebetteten Tally-Formulare (SIGNUP_BACKEND=tally). */
function tallySignup(): Html {
  return html`<h2 class="section__title">Anmeldung über Tally</h2>
    <p>
      Die Anmeldeformulare stammen von Tally (Tally BV, Belgien). Sie stehen auf eigenen
      Unterseiten: erst wenn du einen Anmelde-Button anklickst und diese Seite öffnest, lädt
      dein Browser das Formular von <span translate="no">tally.so</span> und stellt dabei eine
      Verbindung zu diesem Anbieter her. Auf der Startseite und in den Rechtstexten passiert
      das nicht.
    </p>
    <p>
      Was du im Formular einträgst – die Angaben für deine Kursanmeldung – wird bei Tally
      gespeichert und dient ausschliesslich der Organisation des Workshops. Grundlage ist die
      Erfüllung des Vertrags.
    </p>
    <p>
      Die Angaben werden so lange aufbewahrt, wie es dafür nötig ist, und danach gelöscht.
      Datenschutzerklärung des Anbieters:
      <a href="https://tally.so/help/privacy-policy" rel="noopener">tally.so/help/privacy-policy</a>.
    </p>`
}

/**
 * Eigene Anmeldung (SIGNUP_BACKEND=d1): Datenbank, Mitteilung an die
 * Betreiberin, Spam-Schutz. Was hier steht, ergibt sich aus dem Code —
 * plan.md §9.
 */
function ownSignup(): Html {
  return html`<h2 class="section__title">Anmeldung</h2>
    <p>
      Wenn du dich für einen Workshop anmeldest, werden die Angaben für deine Kursanmeldung in
      einer Datenbank bei Cloudflare gespeichert. Die Daten liegen und werden verarbeitet nur
      in der EU. Sie dienen ausschliesslich der Organisation des Workshops und der
      Kontaktaufnahme durch ${BUSINESS.person}. Grundlage ist die Erfüllung des Vertrags.
    </p>
    <p>Die Angaben werden so lange aufbewahrt, wie es dafür nötig ist, und danach gelöscht.</p>
    <p>
      Über eine neue Anmeldung bekommt ${BUSINESS.person} eine Mitteilung auf ihr Gerät. Sie
      enthält deinen Vornamen, den ersten Buchstaben deines Nachnamens und die Anzahl Personen
      und wird verschlüsselt über den Mitteilungsdienst von Apple oder Google zugestellt, der
      den Inhalt nicht lesen kann.
    </p>

    <h2 class="section__title">Schutz vor automatisierten Anmeldungen</h2>
    <p>
      Damit sich keine Programme anmelden, prüft Cloudflare Turnstile beim Absenden, ob ein
      Mensch das Formular ausfüllt. Dafür lädt nur die Anmeldeseite ein Script von
      <span translate="no">challenges.cloudflare.com</span>, das technische Merkmale deines
      Browsers auswertet. Diese Daten dienen nur der Prüfung. Datenschutzerklärung des
      Anbieters:
      <a href="https://www.cloudflare.com/privacypolicy/" rel="noopener">cloudflare.com/privacypolicy</a>.
    </p>`
}

export interface PrivacyOptions {
  /** true mit SIGNUP_BACKEND=d1 — die Erklärung beschreibt, was die Seite gerade tut. */
  ownSignup: boolean
}

export function renderPrivacy(options: PrivacyOptions): Html {
  return html`<section class="section">
      <div class="wrap prose prose--narrow">
        <h1 class="page-title">Datenschutzerklärung</h1>

        <p>
          Diese Seite bearbeitet so wenige Personendaten wie möglich. Es gibt keine
          Analyse-Werkzeuge, keine Werbenetzwerke und keine Cookies, die zur
          Wiedererkennung dienen. Ein Cookie gibt es nur für die Anmeldung im
          Verwaltungsbereich, den ausschliesslich die Betreiberin nutzt.
        </p>

        <h2 class="section__title">Verantwortliche Stelle</h2>
        ${contactBlock()}

        <h2 class="section__title">Hosting</h2>
        <p>
          Die Seite wird von Cloudflare, Inc. betrieben (Cloudflare Workers). Beim Aufruf
          fallen technisch notwendige Serverdaten an – IP-Adresse, Zeitpunkt, aufgerufene
          Adresse, Browser- und Gerätekennung. Sie dienen dem sicheren Betrieb und der
          Abwehr von Angriffen und werden nicht mit anderen Daten zusammengeführt.
          Cloudflare kann diese Daten auch ausserhalb der Schweiz und der EU bearbeiten;
          die Übermittlung stützt sich auf die Standardvertragsklauseln.
        </p>

        ${options.ownSignup ? ownSignup() : tallySignup()}

        <h2 class="section__title">Kontakt per E-Mail</h2>
        <p>
          Wenn du über „Schreibe mir“ eine E-Mail schickst, landen deine Nachricht und deine
          Adresse im Postfach von ${BUSINESS.person}. Sie dienen nur der Antwort auf deine
          Anfrage.
        </p>

        <h2 class="section__title">Schriften und Bilder</h2>
        <p>
          Die verwendete Schrift liegt auf dem eigenen Server. Es werden keine Schriften,
          Karten oder Videos von Drittanbietern nachgeladen.
        </p>

        <h2 class="section__title">Deine Rechte</h2>
        <p>
          Du kannst jederzeit Auskunft über die zu dir bearbeiteten Daten verlangen sowie
          deren Berichtigung oder Löschung. Eine Nachricht an die oben genannte Adresse
          genügt. Zuständige Aufsichtsbehörde in der Schweiz ist der Eidgenössische
          Datenschutz- und Öffentlichkeitsbeauftragte (EDÖB).
        </p>

        <h2 class="section__title">Änderungen</h2>
        <p>
          Diese Erklärung gilt in der jeweils auf dieser Seite veröffentlichten Fassung.
        </p>
      </div>
    </section>`
}

export function renderNotFound(): Html {
  return html`<section class="section">
      <div class="wrap prose prose--narrow">
        <h1 class="page-title">Seite nicht gefunden</h1>
        <p>
          Diese Adresse gibt es nicht – vielleicht ist der Link veraltet oder hat sich ein
          Zeichen verirrt.
        </p>
        <p><a href="/">Zurück zur Startseite</a></p>
      </div>
    </section>`
}
