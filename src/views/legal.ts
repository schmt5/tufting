import { html } from 'hono/html'
import { BUSINESS, hasAddress } from '../site.ts'
import type { Html } from './layout.ts'

/**
 * Impressum und Datenschutzerklärung.
 *
 * Was sich aus dem Code ergibt, steht hier ausformuliert: die Seite lädt das
 * Embed-Script von Tally und läuft auf Cloudflare Workers — beides sind
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

export function renderPrivacy(): Html {
  return html`<section class="section">
      <div class="wrap prose prose--narrow">
        <h1 class="page-title">Datenschutzerklärung</h1>

        <p>
          Diese Seite bearbeitet so wenige Personendaten wie möglich. Es gibt keine
          Analyse-Werkzeuge, keine Werbenetzwerke und keine Cookies, die zur
          Wiedererkennung dienen.
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

        <h2 class="section__title">Anmeldung und Kontakt über Tally</h2>
        <p>
          Die Anmeldeformulare stammen von Tally (Tally BV, Belgien). Erst wenn du einen
          Anmelde- oder Kontakt-Button anklickst, lädt dein Browser das Formular von
          <span translate="no">tally.so</span> und stellt dabei eine Verbindung zu diesem
          Anbieter her. Vor dem Klick werden dorthin keine Formulardaten übertragen.
        </p>
        <p>
          Was du im Formular einträgst – ${todo('Felder auflisten, z.B. Name, E-Mail, Nachricht')} –
          wird bei Tally gespeichert und dient ausschliesslich der Organisation des
          Workshops und der Antwort auf deine Anfrage. Grundlage ist die Erfüllung des
          Vertrags beziehungsweise dein Ersuchen um Kontakt.
        </p>
        <p>
          Die Angaben werden ${todo('Aufbewahrungsdauer')} aufbewahrt und danach gelöscht.
          Datenschutzerklärung des Anbieters:
          <a href="https://tally.so/help/privacy-policy" rel="noopener">tally.so/help/privacy-policy</a>.
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
