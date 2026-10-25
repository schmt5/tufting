# Projektplan: Workshop-Anmeldung mit eigenem Admin (Hono auf Cloudflare Workers)

## 1. Ziel

Zwei Dinge, sonst nichts:

1. **Besucher melden sich einfach an.** Termine auf der Startseite, ein Klick
   auf den Termin, ein kurzes Formular, fertig. Ausgebuchte Termine nehmen keine
   Anmeldung mehr an — auch nicht, wenn zwei Leute in derselben Sekunde absenden.
2. **Naira hat den Überblick.** Ein kleiner Admin unter `/admin`, auf dem Handy
   als App installierbar: Workshops anlegen und pflegen, sehen, wer sich
   angemeldet hat, bei jeder neuen Anmeldung eine Push-Mitteilung bekommen.

Naira schreibt den Teilnehmenden **selbst**. Die Seite verschickt keine E-Mails
an Kundinnen und Kunden; sie hilft nur beim Schreiben — mit einer Textvorlage
und einer Kalenderdatei (`.ics`) pro Termin.

### Bisheriger Stand: die Tally-Version

Bis jetzt kamen Termine und Anmeldung aus Tally: jedes Formular ein Termin,
Datum und freie Plätze als Hidden Fields, das Formular als iframe auf
`/anmeldung/{formId}`. Das läuft (Phase 1–4 der alten Planung), hat aber drei
Grenzen, die sich in Tally nicht lösen lassen:

- **Plätze zählen nicht mit.** Tallys Limit zählt Einsendungen, das Formular
  fragt aber nach „Anzahl Personen“. Vier Einsendungen à drei Personen ergäben
  zwölf Leute in einem Workshop für vier. Deshalb wird `freeSpots` heute von
  Hand gepflegt.
- **Jeder Seitenaufbau kostet eine API-Anfrage pro Formular.** Tally drosselt
  bei 100 Anfragen pro Minute, und die Termine hängen am Tally-Workspace, in dem
  auch fremde Formulare liegen.
- **Naira sieht die Anmeldungen nur in Tally**, ohne Bezug zu Plätzen und
  Terminen.

Mit eigener Datenbank fallen alle drei weg. Tally verschwindet aus dem Projekt
(siehe §12, Phase 6).

## 2. Stack-Entscheidungen

| Baustein | Wahl | Begründung |
|---|---|---|
| Runtime | Cloudflare Workers | Free Plan deckt das Volumen um Grössenordnungen |
| Framework | Hono | Web-Standard-`fetch`, Cookie- und CSRF-Helfer eingebaut |
| Rendering | `hono/html` (server-side) | Öffentliche Seite wie Admin, ohne Client-Framework |
| Daten | Cloudflare D1 (SQLite) | Free Plan, echte Transaktionen für den Platz-Check |
| Spam-Schutz | Cloudflare Turnstile | Gratis, ohne Bilderrätsel, gleicher Anbieter wie das Hosting |
| Benachrichtigung | Web Push an die Admin-PWA | Gratis, braucht keine eigene Domain und keinen Mailversand |
| Geplante Jobs | Cron Trigger des Workers | Aufräumen alter Daten, ohne weiteren Dienst |
| Assets | Workers Assets (`./public`) | CSS, Fonts, Manifest, Service Worker ohne Worker-Invocation |
| Build | keiner | Client-JS bleibt bei wenigen kleinen Dateien in `public/` |
| Sprache | TypeScript | |

### Explizit nicht gewählt

- **Vite / React SPA, auch für den Admin**: Der Admin ist eine Handvoll Listen
  und Formulare. Server-Rendering mit normalen `<form>`-Posts reicht und
  funktioniert auf jedem Handy.
- **Workers KV als Datenspeicher**: Gewählt ist D1, nicht KV. Der Grund ist der
  letzte freie Platz: Melden sich zwei Personen in derselben Sekunde an, liest
  der Worker mit KV für beide „1 Platz frei“ und speichert beide Anmeldungen —
  zwei Leute auf einem Platz. KV kann nicht „nur speichern, wenn noch Platz
  ist“ in einem Schritt, und es liefert Werte bis etwa eine Minute alt aus. D1
  führt die Anmeldung als einen Befehl aus und arbeitet zwei Befehle
  nacheinander ab: die erste Person bekommt den Platz, bei der zweiten
  speichert D1 nichts, und sie sieht „ausgebucht“ (§5).
- **Durable Objects**: Könnten den Platz-Check ebenfalls sicher machen, sind
  für zwei Tabellen und ein paar Anmeldungen pro Woche aber mehr Konzept als
  nötig.
- **E-Mail-Versand (Cloudflare Email Sending)**: Mails an beliebige Empfänger
  brauchen Workers Paid und eine eigene Domain auf Cloudflare. Naira schreibt
  ohnehin selbst; für die Benachrichtigung reicht Push.
- **Cloudflare Access vor `/admin`**: Spart den Login-Code, aber der Umweg über
  die Access-Anmeldeseite verträgt sich schlecht mit einer installierten PWA
  (der Login öffnet sich ausserhalb der App).

## 3. Architektur

```
Besucher ──GET /──────────────> Worker ── SELECT Workshops + belegte Plätze ──> D1
         ──GET /anmeldung/{id}─> Worker ── Formular (Personenzahl ≤ freie Plätze)
         ──POST /anmeldung/{id}> Worker ── Turnstile prüfen
                                        ── INSERT … nur wenn Plätze reichen ────> D1
                                        ── waitUntil: Push an Nairas Geräte ──> Push-Dienst
                                        ── 303 → /anmeldung/{id}/danke

Naira    ──/admin/*────────────> Worker ── Session-Cookie prüfen ── D1
         (installierte PWA)       Service Worker zeigt die Push-Mitteilung,
                                  ein Tipp öffnet den Termin im Admin
```

### Öffentliche Routen

| Route | Zweck |
|---|---|
| `GET /` | Startseite, Termine aus D1 |
| `GET /anmeldung/{id}` | Anmeldeseite eines Termins mit eigenem Formular |
| `POST /anmeldung/{id}` | Anmeldung speichern, danach Redirect (Post/Redirect/Get) |
| `GET /anmeldung/{id}/danke` | Bestätigungsseite |
| `GET /termin/{id}.ics` | Kalenderdatei des Termins — nur Workshopdaten, keine Personendaten |
| `GET /impressum`, `/datenschutz` | Rechtstexte |
| `GET /robots.txt`, `/sitemap.xml` | aus dem Worker; die Sitemap kann die Anmeldeseiten jetzt mit aufzählen |
| alles andere | gestaltete 404 mit `noindex` |

### Admin-Routen

Alle unter `/admin`, alle mit `noindex`, `X-Robots-Tag: noindex` und
`Cache-Control: no-store` (Personendaten gehören in keinen Cache).

| Route | Zweck |
|---|---|
| `GET /admin/login`, `POST /admin/login` | Passwort-Login |
| `POST /admin/logout` | Session beenden |
| `GET /admin` | Übersicht: kommende Termine mit belegt/frei, neue Anmeldungen hervorgehoben |
| `GET /admin/workshops/neu`, `POST /admin/workshops` | Termin anlegen |
| `GET /admin/workshops/{id}` | Termin mit allen Anmeldungen |
| `GET /admin/workshops/{id}/bearbeiten`, `POST /admin/workshops/{id}` | Termin ändern, veröffentlichen, absagen |
| `POST /admin/anmeldungen` | Anmeldung von Hand erfassen (Anfrage per Instagram, mündlich) |
| `POST /admin/anmeldungen/{id}/kontaktiert` | als „E-Mail geschrieben“ markieren |
| `POST /admin/anmeldungen/{id}/storniert` | stornieren — gibt die Plätze frei |
| `POST /admin/anmeldungen/{id}/loeschen` | endgültig löschen |
| `GET /admin/vorlage`, `POST /admin/vorlage` | E-Mail-Vorlage bearbeiten |
| `POST /admin/push`, `POST /admin/push/test` | Gerät für Push anmelden, Testmitteilung |
| `GET /admin/manifest.webmanifest`, `/admin/sw.js`, Icons | PWA, statisch aus `public/admin/` |

Formulare im Admin sind normale `<form method="post">`. HTML kennt nur GET und
POST, deshalb heissen die Aktionen nach dem, was sie tun, statt PUT/DELETE zu
simulieren.

### Datenfluss-Randfall

Ist D1 nicht erreichbar, antwortet die Startseite trotzdem mit 200: die
Termin-Section zeigt den Hinweistext, der Rest der Seite steht. Die
Anmeldeseite antwortet mit 503 statt 404 — ob es den Termin gibt, weiss sie in
dem Moment nicht. Sichtbar wird der Ausfall über `console.error` in den
Observability-Logs.

## 4. Datenmodell (D1)

Migrationen liegen in `migrations/` und laufen über
`wrangler d1 migrations apply`. Zeiten sind ISO-Strings in Schweizer Ortszeit
(`date` = `YYYY-MM-DD`, `start_time` = `HH:MM`); Zeitstempel sind Unix-Sekunden
in UTC.

```sql
CREATE TABLE workshops (
  id          TEXT PRIMARY KEY,            -- zufällig, kurz, URL-tauglich
  date        TEXT NOT NULL,               -- YYYY-MM-DD
  start_time  TEXT NOT NULL,               -- HH:MM, Europe/Zurich
  end_time    TEXT NOT NULL,               -- HH:MM
  capacity    INTEGER NOT NULL CHECK (capacity > 0),
  note        TEXT,                        -- optionaler Satz auf der Card
  status      TEXT NOT NULL DEFAULT 'draft'
              CHECK (status IN ('draft', 'published', 'cancelled')),
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);

CREATE TABLE signups (
  id            TEXT PRIMARY KEY,          -- zufällig, nicht erratbar
  workshop_id   TEXT NOT NULL REFERENCES workshops(id) ON DELETE CASCADE,
  first_name    TEXT NOT NULL,
  last_name     TEXT NOT NULL,
  email         TEXT NOT NULL,
  persons       INTEGER NOT NULL CHECK (persons > 0),
  comment       TEXT,
  source        TEXT NOT NULL DEFAULT 'web' CHECK (source IN ('web', 'admin')),
  created_at    INTEGER NOT NULL,
  contacted_at  INTEGER,                   -- Naira hat geschrieben
  cancelled_at  INTEGER                    -- storniert, zählt nicht mehr
);
CREATE INDEX signups_workshop ON signups (workshop_id);

CREATE TABLE templates (
  key         TEXT PRIMARY KEY,            -- vorerst nur 'confirmation'
  subject     TEXT NOT NULL,
  body        TEXT NOT NULL,
  updated_at  INTEGER NOT NULL
);

CREATE TABLE push_subscriptions (
  endpoint    TEXT PRIMARY KEY,
  p256dh      TEXT NOT NULL,
  auth        TEXT NOT NULL,
  label       TEXT,                        -- z.B. „iPhone Naira“
  created_at  INTEGER NOT NULL
);

CREATE TABLE login_failures (
  ip          TEXT NOT NULL,
  at          INTEGER NOT NULL
);
CREATE INDEX login_failures_ip ON login_failures (ip, at);
```

- **Freie Plätze werden nicht gespeichert, sondern gezählt**:
  `capacity − SUM(persons)` über die nicht stornierten Anmeldungen. Eine
  gespeicherte Zahl könnte auseinanderlaufen; eine gezählte nicht.
- **Kein Preis pro Workshop.** Die Preise sind gestaffelt nach Gruppengrösse und
  für alle Termine gleich; sie bleiben in `site.ts`. `capacity` wird beim
  Anlegen mit `WORKSHOP.maxAttendees` vorbelegt.
- **Zufällige IDs** für Workshops und Anmeldungen, keine fortlaufenden Zahlen:
  die Workshop-ID steht in öffentlichen Adressen, und eine erratbare
  Anmelde-ID wäre eine Einladung, sobald sie je irgendwo auftaucht.
- **`login_failures` speichert die IP** nur für die Sperre nach Fehlversuchen
  und wird vom Cron nach einem Tag geleert.

## 5. Anmeldung

### Formular

Vorname, Nachname, E-Mail, Anzahl Personen, Bemerkung (optional). Die E-Mail
ist Pflicht — Naira schreibt jeder Anmeldung selbst. Eine Telefonnummer wird
bewusst nicht abgefragt.

- **Anzahl Personen ist eine Auswahl von 1 bis zu den freien Plätzen.** Wer
  zu dritt kommen will, wenn nur zwei frei sind, sieht das schon im Formular.
- **Unter dem Button** ein Satz mit Link auf die Datenschutzerklärung. Eine
  Pflicht-Checkbox braucht es in der Schweiz dafür nicht.
- **Ohne JavaScript** funktioniert das Formular als normaler Post — bis auf
  Turnstile, das JavaScript braucht. Bewusst in Kauf genommen: Spam-Anmeldungen
  lösten jedes Mal eine Push-Mitteilung aus.
- **Fehler** (fehlende Felder, Turnstile, zu wenig Plätze) rendern das Formular
  erneut mit den eingegebenen Werten und einer Meldung pro Feld.

### Kein Überbuchen

Prüfen und Speichern sind **ein** SQL-Statement. D1 führt Schreibzugriffe auf
eine Datenbank nacheinander aus, zwei gleichzeitige Anmeldungen können sich
dazwischen also nicht überholen:

```sql
INSERT INTO signups (id, workshop_id, first_name, …, persons, created_at)
SELECT ?1, ?2, ?3, …, ?7, ?8
WHERE (SELECT capacity FROM workshops WHERE id = ?2 AND status = 'published')
    - (SELECT COALESCE(SUM(persons), 0) FROM signups
       WHERE workshop_id = ?2 AND cancelled_at IS NULL)
    >= ?7
```

`meta.changes = 0` heisst: nicht mehr genug Plätze (oder der Termin ist
inzwischen abgesagt). Dann zeigt die Seite die aktuellen freien Plätze statt
einer Bestätigung. Dass D1 `INSERT … SELECT … WHERE` so ausführt, wird in
Phase 1 mit einem Test gegen die lokale D1 bestätigt, nicht angenommen.

Von Hand erfasste Anmeldungen im Admin laufen über denselben Check, mit einer
Ausnahme: Naira kann bewusst überbuchen (Checkbox „trotzdem eintragen“).

### Zustände auf Card und Anmeldeseite

Unverändert aus der Tally-Version, nur aus D1 gerechnet:

- **Vergangene Termine** werden ausgeblendet (Stichtag in Europe/Zurich).
- **Ausgebucht** (0 frei): Card mit Hinweis, ohne Anmelde-Button; die
  Anmeldeseite bleibt erreichbar und sagt, warum es kein Formular gibt.
- **Wenige Plätze** (unter `LOW_SPOTS_THRESHOLD`): „Nur noch n Plätze frei“.
- **Entwurf** und **abgesagt** erscheinen öffentlich nicht; eine abgesagte
  Anmeldeseite antwortet mit 404.

## 6. Admin und Login

Ein einziges Konto, kein Benutzername — nur ein Passwort.

- **Das Passwort steht nicht im Code**, sondern als Secret `ADMIN_PASSWORD`
  (`wrangler secret put`). Im Repository wäre es für alle mit Zugriff lesbar,
  für immer in der Git-Historie.
- **Vergleich in konstanter Zeit**: beide Werte mit `SESSION_SECRET` per HMAC
  hashen und mit `crypto.subtle.timingSafeEqual` vergleichen. Kein PBKDF2 oder
  bcrypt: ein langsamer Hash schützt gespeicherte Hashes bei einem Datenleck,
  hier wird aber keiner gespeichert. Viele Hash-Runden sprengten ausserdem die
  10 ms CPU des Free Plans.
- **Sperre nach Fehlversuchen**: 5 Fehlversuche pro IP in 15 Minuten, danach
  ist der Login für diese IP 15 Minuten zu. Gezählt in D1 statt mit dem
  Rate-Limiting-Binding — das zählt nur ungefähr und pro Standort.
- **Session** als signiertes Cookie (`setSignedCookie` aus `hono/cookie`) mit
  Ablaufzeit im Inhalt: `__Host-session`, `HttpOnly`, `Secure`,
  `SameSite=Lax`, 90 Tage. Lange, weil Naira die App auf dem Handy nicht jede
  Woche neu entsperren soll. Alle Sessions beenden = `SESSION_SECRET` wechseln.
- **`SameSite=Lax`, nicht `Strict`**: Ein Tipp auf die Push-Mitteilung öffnet
  den Admin von ausserhalb der Seite. Mit `Strict` käme das Cookie dabei nicht
  mit, und Naira landete auf dem Login.
- **CSRF**: `csrf()`-Middleware von Hono auf allen POST-Routen (prüft den
  `Origin`-Header). Zusammen mit `Lax` reicht das.

### Admin als PWA

- `public/admin/manifest.webmanifest`: Name „Naira Admin“, `start_url` und
  `scope` `/admin/`, `display: standalone`, Icons 192 und 512 px.
- `public/admin/sw.js`: nur `push` und `notificationclick`. **Kein Offline-Cache**
  — die Seiten enthalten Personendaten, die nicht auf dem Gerät liegen bleiben
  sollen, und veraltete Belegungen wären schlimmer als „offline“.
- Manifest, Service Worker und Icons liegen öffentlich in `./public` — sie
  enthalten nichts Vertrauliches. Alles mit Daten kommt aus dem Worker und
  braucht die Session.

## 7. Push-Mitteilung an Naira

Bei jeder Anmeldung über die Webseite:

> **Neue Anmeldung 22.11.** — Lisa M., 2 Personen. Noch 1 Platz frei.

- **Gerät anmelden**: Im Admin ein Button „Mitteilungen aktivieren“. Der Browser
  fragt um Erlaubnis, die Subscription geht per `POST /admin/push` in
  `push_subscriptions`. Mehrere Geräte sind möglich (Handy, Laptop).
- **iPhone**: Push für Web-Apps gibt es erst, wenn der Admin zum
  Home-Bildschirm hinzugefügt wurde (iOS 16.4 oder neuer). Der Admin zeigt
  einen Hinweis, solange er nicht als App läuft.
- **Versand** im Worker nach dem Speichern, per `c.executionCtx.waitUntil` —
  die Besucherin wartet nicht auf den Push-Dienst. VAPID (RFC 8292) und die
  Verschlüsselung des Inhalts (RFC 8291, `aes128gcm`) laufen über WebCrypto.
  Ob dafür eine kleine Bibliothek ohne Node-Abhängigkeit taugt oder eigener Code
  (~150 Zeilen), entscheidet Phase 4.
- **Abgelaufene Geräte**: Antwortet der Push-Dienst mit 404 oder 410, wird die
  Subscription gelöscht.
- **Keine Mitteilung** bei von Hand erfassten Anmeldungen — die hat Naira
  selbst eingetragen.
- **Testmitteilung** im Admin, damit sich prüfen lässt, ob es auf dem Gerät
  ankommt.

Schlägt Push fehl, geht keine Anmeldung verloren: sie steht in D1, und der
Admin hebt neue Anmeldungen hervor (`contacted_at IS NULL`).

## 8. E-Mail-Vorlage und Kalenderdatei

### Vorlage

Eine Vorlage in `templates` (`key = 'confirmation'`), im Admin bearbeitbar, mit
Platzhaltern:

| Platzhalter | Wert |
|---|---|
| `{vorname}`, `{nachname}` | aus der Anmeldung |
| `{datum}` | `22.11.2026` |
| `{zeit}` | `10:00–17:00` |
| `{personen}` | `2 Personen` / `1 Person` |
| `{adresse}` | aus `site.ts` |
| `{kalender}` | absolute URL auf `/termin/{id}.ics` |

Ein Standardtext steht im Code und wird beim ersten Aufruf angelegt.
Unbekannte Platzhalter bleiben sichtbar stehen statt still zu verschwinden.

Pro Anmeldung im Admin:

- **„E-Mail schreiben“** — ein `mailto:`-Link mit Empfänger, Betreff und Text
  aus der Vorlage. Öffnet Nairas Mail-App; sie liest, ändert, schickt ab.
- **„Text kopieren“** — für Mail-Apps, die mit langen `mailto:`-Links nicht
  umgehen können.
- Danach **„als geschrieben markieren“** (`contacted_at`).

### Kalenderdatei

`GET /termin/{id}.ics` erzeugt pro Workshop ein `VEVENT` (RFC 5545):

- `DTSTART`/`DTEND` in UTC (`…Z`), aus Datum und Uhrzeit in Europe/Zurich
  umgerechnet — vermeidet einen `VTIMEZONE`-Block, den jede Kalender-App
  anders liest.
- `UID` stabil pro Workshop, damit ein zweiter Import den Termin aktualisiert
  statt verdoppelt. `METHOD:PUBLISH`, keine Einladung mit Teilnehmerliste.
- `SUMMARY`, `LOCATION` (Adresse aus `site.ts`), `DESCRIPTION` (was mitbringen),
  `URL` auf die Anmeldeseite.
- CRLF-Zeilenenden, Zeilen über 75 Byte gefaltet, `,` `;` `\` und
  Zeilenumbrüche maskiert. Dafür Unit-Tests.

**Warum ein Link und kein Anhang**: Ein `mailto:`-Link kann keine Dateien
anhängen. Der Link `{kalender}` im Text tut dasselbe — ein Tipp darauf legt den
Termin im Kalender an. Die Datei enthält nur Workshopdaten und darf öffentlich
sein. Wer sie doch als Anhang will, bekommt im Admin zusätzlich „Kalenderdatei
teilen“ (Web Share API mit Datei); dort muss Naira den Empfänger dann selbst
wählen, weil die Share-Funktion keinen Empfänger setzen kann.

## 9. Datenschutz

Die Personendaten liegen neu in der eigenen Datenbank statt bei Tally. Das
ändert die Datenschutzerklärung (`views/legal.ts`):

- **Abschnitt „Anmeldung und Kontakt über Tally“ ersetzen** durch „Anmeldung“:
  die Angaben (allgemein formuliert wie bisher: „die Angaben für deine
  Kursanmeldung“) werden in einer Datenbank bei Cloudflare gespeichert und nur
  für die Organisation des Workshops und die Kontaktaufnahme durch Naira
  verwendet.
- **Turnstile** nennen: Beim Absenden prüft Cloudflare, ob ein Mensch das
  Formular ausfüllt. Gleicher Anbieter wie das Hosting.
- **Aufbewahrung** bleibt „so lange wie nötig“ im Text. Technisch löscht der
  Cron Anmeldungen 3 Monate nach dem Workshop.
- **Speicherort**: Die D1 ist mit `--jurisdiction eu` angelegt — die Daten
  liegen und werden verarbeitet nur in der EU. Das gehört so in die Erklärung.
- **Push**: Die Mitteilung an Naira läuft verschlüsselt über den Push-Dienst
  von Apple bzw. Google. Sie enthält Vorname, Initial des Nachnamens und
  Personenzahl — mehr nicht.
- **Tally** und die Einbindung von `tally.so` fallen ganz aus der Erklärung.
  Ein Kontaktformular gibt es nicht mehr, nur einen E-Mail-Link (§13).

Weiterhin gilt: kein Tracking, keine Cookies für Besucher. Das Session-Cookie
gibt es nur im Admin.

## 10. Projektstruktur

```
.
├── migrations/
│   └── 0001_init.sql        # Schema aus §4
├── src/
│   ├── index.ts             # Hono-App, öffentliche Routen, Cron-Handler
│   ├── admin.ts             # Admin-Routen, als eigene Hono-Instanz gemountet
│   ├── auth.ts              # Login, Session-Cookie, Sperre
│   ├── db.ts                # alle SQL-Statements an einem Ort
│   ├── workshops.ts         # Zustände, Datum, freie Plätze (rein, testbar)
│   ├── env.ts               # Bindings und Secrets des Workers
│   ├── forms.ts             # Formularwerte prüfen: Termin, Anmeldung
│   ├── test-support.ts      # leere lokale D1 mit Migrationen für die Tests
│   ├── turnstile.ts         # siteverify
│   ├── push.ts              # VAPID, Verschlüsselung, Versand
│   ├── ics.ts               # Kalenderdatei
│   ├── template.ts          # Platzhalter ersetzen, mailto-Link bauen
│   ├── site.ts              # Stammdaten (unverändert)
│   ├── seo.ts               # JSON-LD, jetzt mit Uhrzeit
│   ├── *.test.ts            # node:test, wie bisher
│   └── views/
│       ├── layout.ts, gallery.ts, intro.ts, schedule.ts, card.ts,
│       │   about.ts, legal.ts                   # öffentliche Seite
│       ├── fields.ts        # Formularfelder mit Label und Fehlermeldung
│       ├── signup.ts        # Anmeldeformular, Danke-Seite (statt Tally-Embed)
│       └── admin/           # Layout, Login, Übersicht, Termin, Vorlage
├── public/
│   ├── style.css            # Tokens und Regeln, Admin nutzt dieselben
│   ├── admin/
│   │   ├── manifest.webmanifest
│   │   ├── sw.js            # push + notificationclick
│   │   ├── admin.js         # Push aktivieren, Text kopieren, Teilen
│   │   └── icon-192.png, icon-512.png
│   ├── fonts/, img/, favicon.svg, og-image.png
├── wrangler.jsonc
├── tsconfig.json
└── package.json
```

`tally.ts`, `public/tally.js` und das Hidden-Field-Parsing in `workshops.ts`
fallen weg.

## 11. Konfiguration

`wrangler.jsonc` (Ergänzungen):

```jsonc
{
  "d1_databases": [
    { "binding": "DB", "database_name": "tufting", "database_id": "…" }
  ],
  "triggers": { "crons": ["0 3 * * *"] },   // täglich 03:00 UTC aufräumen
  "vars": {
    "SIGNUP_BACKEND": "tally",              // bis Phase 6, danach entfernt
    "TURNSTILE_SITE_KEY": "…",
    "TURNSTILE_HOSTNAMES": "naira-tufting.ch", // nie localhost
    "VAPID_PUBLIC_KEY": "…",
    "VAPID_SUBJECT": "mailto:tuftingstudio.bern@outlook.com"
  }
}
```

Secrets (nicht im Repo, lokal in `.dev.vars`):

```bash
wrangler secret put ADMIN_PASSWORD
wrangler secret put SESSION_SECRET
wrangler secret put TURNSTILE_SECRET_KEY
wrangler secret put VAPID_PRIVATE_KEY
```

`TALLY_TOKEN` wird nach der Umstellung gelöscht. Welche Werte lokal nötig sind,
steht in `.dev.vars.example`.

Lokal liegt die Datenbank unter `.wrangler/state`. Nach einem frischen Checkout
oder einer neuen Migration einmal einspielen:

```bash
npx wrangler d1 migrations apply tufting --local
```

Vor jedem Deploy einmal `wrangler dev --remote`: die Edge ist strenger als das
lokale workerd, lokal grün heisst nicht deploybar.

## 12. Umsetzung in Phasen

Jede Phase ist für sich deploybar. Bis Phase 6 läuft die Tally-Version
öffentlich weiter: Startseite und Anmeldeseite wählen ihre Quelle über die Var
`SIGNUP_BACKEND` (`tally` oder `d1`), Standard bleibt `tally`. Lokal und in
`.dev.vars` steht sie auf `d1`. Der Admin ist ab Phase 2 erreichbar, öffentlich
verlinkt ist er nirgends.

### Phase 1 — Datenbank (2–3h)

Stand: umgesetzt — Migration, `db.ts`, Tests in `db.test.ts` gegen eine lokale
D1. Ein Gegentest mit getrenntem Lesen und Schreiben setzte im selben Aufbau
12 Personen auf 4 Plätze; der Check in einem Statement lässt genau 4 zu. Die
Datenbank bei Cloudflare ist mit `--jurisdiction eu` angelegt, die Migration
remote eingespielt.

- D1 anlegen (Standort Europa), Migration `0001_init.sql`
- `db.ts` mit den Abfragen für Startseite, Anmeldeseite, Admin
- Test: der Platz-Check aus §5 lehnt die Überbuchung ab, auch bei zwei
  gleichzeitigen Anmeldungen

**Fertig wenn**: `wrangler d1 migrations apply` läuft lokal und remote, und der
Überbuchungs-Test ist grün.

### Phase 2 — Login und Admin-Grundgerüst (3–4h)

Stand: umgesetzt und lokal im Browser durchgeklickt (Desktop und Handy-Breite).
Login mit Sperre, Session-Cookie, CSRF, Übersicht mit vergangenen Terminen,
Termine anlegen und bearbeiten, Anmeldungen von Hand erfassen, als geschrieben
markieren, stornieren, löschen. Tests in `auth.test.ts`, `forms.test.ts` und
`admin.test.ts` (echte Requests gegen eine lokale D1). Noch nicht deployt, die
Secrets in Produktion sind noch nicht gesetzt.

- `auth.ts`: Login, Session, Sperre, Logout, `csrf()`
- Admin-Layout, Übersicht, Termin anlegen/bearbeiten/absagen
- Terminansicht mit Anmeldungen, stornieren, löschen, von Hand erfassen

**Fertig wenn**: Naira kann sich einloggen und einen Termin anlegen, der in der
Übersicht mit 0 von 4 Plätzen steht.

### Phase 3 — Öffentliche Anmeldung (3–4h)

Stand: umgesetzt und lokal im Browser durchgespielt (mit den Test-Schlüsseln
von Turnstile): Karte aus der D1 mit Uhrzeit und Hinweis, Anmeldung, Danke-Seite,
der volle Termin erscheint als ausgebucht und im Admin. Tests in
`signup.test.ts` (Requests gegen eine lokale D1, siteverify gemockt), auch für
den Fall, dass jemand während der Prüfung den letzten Platz bekommt. Öffentlich
bleibt `SIGNUP_BACKEND=tally`. Offen für Produktion: das Turnstile-Widget für
die Zieldomain anlegen, `TURNSTILE_SITE_KEY` und `TURNSTILE_HOSTNAMES` setzen,
`TURNSTILE_SECRET_KEY` als Secret — sinnvoll erst, wenn die Domain steht.

- Startseite und Anmeldeseite lesen aus D1, wenn `SIGNUP_BACKEND=d1`
- Eigenes Formular, Validierung, Turnstile, Danke-Seite
- JSON-LD mit Uhrzeit, Sitemap mit Anmeldeseiten

**Fertig wenn**: Eine Anmeldung über die Seite erscheint im Admin, und ein
voller Termin nimmt keine weitere an.

### Phase 4 — Push (3–4h)

- VAPID-Schlüssel erzeugen, `push.ts`, Service Worker, Manifest und Icons
- „Mitteilungen aktivieren“, Testmitteilung, Aufräumen abgelaufener Geräte

**Fertig wenn**: Auf Nairas iPhone (Admin auf dem Home-Bildschirm) kommt bei
einer Anmeldung die Mitteilung an, und ein Tipp öffnet den Termin.

### Phase 5 — Vorlage und Kalenderdatei (2–3h)

- `templates`, Vorlage im Admin, `mailto:`-Link, Text kopieren
- `ics.ts` mit Tests, Route `/termin/{id}.ics`, Teilen-Button

**Fertig wenn**: „E-Mail schreiben“ öffnet die Mail-App mit fertigem Text, und
der Kalender-Link legt den Termin auf iPhone und in Google Calendar richtig an.

### Phase 6 — Umstellung und Aufräumen (1–2h)

- Turnstile-Widget für die Zieldomain anlegen, Sitekey, Hostnamen und Secret
  setzen (ohne sie bleibt die Anmeldung mit `d1` zu, statt ungeschützt)
- Termine im Admin erfassen, `SIGNUP_BACKEND` auf `d1` stellen
- Tally-Code, `tally.js`, `TALLY_TOKEN` und danach die Var selbst entfernen
- Kontaktblock auf `mailto:`-Link umstellen, `/kontakt` und `CONTACT_FORM_ID`
  entfernen
- Datenschutzerklärung nach §9, `DESIGN_GUIDE.md` nachführen
- Cron: Anmeldungen 3 Monate nach dem Workshop und `login_failures` nach einem
  Tag löschen

**Fertig wenn**: Kein Request geht mehr an Tally, und die Rechtstexte
beschreiben, was die Seite tatsächlich tut.

Geschätzter Gesamtaufwand: **14–20h**.

## 13. Entscheidungen und offene Punkte

### Entschieden (aus der Tally-Version übernommen)

- **Card-Titel ist das Datum**, als `h3` unter dem `h2` „Wähle deinen
  Workshoptag“. Workshops haben keinen eigenen Namen.
- **Reihenfolge** aufsteigend nach Datum und Startzeit.
- **Anmeldung auf einer eigenen Unterseite**, nicht als Popup: teilbare Adresse,
  Zurück-Knopf des Browsers als Rückweg, die Startseite verlinkt nur.
- **Die ID wird gegen die Datenbank geprüft**; unbekannte und abgesagte Termine
  laufen auf die 404, ein Datenbank-Ausfall auf 503.
- **Strukturierte Daten**: `LocalBusiness` plus ein `Event` pro Termin,
  gespeist aus denselben Daten wie die Cards — jetzt mit Uhrzeit und
  `remainingAttendeeCapacity` aus der Zählung.
- **`robots.txt` und `sitemap.xml` aus dem Worker**, weil sie absolute URLs
  enthalten.
- **Rechtstexte** als eigene Routen. Die Datenschutzerklärung zählt die Felder
  nicht einzeln auf und nennt keine feste Aufbewahrungsdauer. Kein
  Registerabschnitt im Impressum, weil kein Handelsregistereintrag besteht.
- **Bildergalerie** als CSS-only Carousel aus `views/gallery.ts`.
- **Fehler nur in den Observability-Logs**, kein externer Fehlerdienst.

### Entschieden (neu)

- **Eigene Anmeldung statt Tally**, mit D1 als einziger Quelle für Termine und
  Plätze (§1).
- **Keine E-Mails an Teilnehmende** aus dem System. Naira schreibt selbst, mit
  Vorlage und Kalender-Link (§8).
- **Ein Admin-Konto mit Passwort als Secret** (§6).
- **Benachrichtigung per Push**, nicht per E-Mail (§7). Nach einem Tipp auf die
  Mitteilung mit abgelaufener Session führt der Login auf die Übersicht, nicht
  zurück auf den Termin — ein Randfall, der keinen eigenen Code wert ist.
- **Anmeldungen werden 3 Monate nach dem Workshop gelöscht** — genug für
  Nachfragen, Gutscheine, Nachholtermine. In der Datenschutzerklärung bleibt
  es bei „so lange wie nötig“.
- **Kontakt „Schreibe mir“ ist ein `mailto:`-Link** auf Nairas Adresse, kein
  Formular. Sie antwortet sowieso per Mail; es braucht weder Tabelle noch
  Formular noch Tally.
- **Keine Telefonnummer**, die E-Mail ist Pflicht.

### Offen

- **Was mitbringen / Treffpunkt**: fester Text für die Kalenderdatei und die
  Vorlage — muss von Naira kommen.
- **Stammdaten in `src/site.ts`**: die **Hausnummer** fehlt noch. Ohne sie
  findet eine Kartensuche nur den Platz, und die Kalenderdatei hätte eine
  unvollständige Adresse.
- **Logo**: ersetzt `WORDMARK` in `layout.ts`, `favicon.svg` und die
  Admin-Icons.
- **Bilder**: Carousel (3:2), Intro (4:3), Porträt (3:4) und `og-image.png`
  sind Platzhalter; echte Fotos brauchen je einen Alt-Text.
- **Rechtstexte inhaltlich prüfen lassen**, nach der Anpassung aus §9.
- **Custom Domain**: Sobald sie steht, gehört sie in `SITE_ORIGIN`. Für Push
  und Admin reicht `workers.dev`; ein Domainwechsel heisst aber, dass Naira die
  App neu installieren und Mitteilungen neu aktivieren muss (andere Herkunft).
  Besser also vor der Installation auf ihrem Handy.

## 14. Nicht im Scope

- E-Mail-Versand an Teilnehmende, Erinnerungen, Newsletter
- Online-Zahlung
- Mehrere Admin-Konten, Rollen, Passwort-Reset per Mail
  (Reset = neues Secret setzen)
- Warteliste — nachrüstbar über `signups` mit einem Status
- Offline-Modus des Admins
- Mehrsprachigkeit

## 15. Betriebsgrenzen (Free Plan)

Erwartetes Volumen: ~500 Seitenaufrufe und eine Handvoll Anmeldungen pro Monat.

| Limit | Free Plan | Erwartete Nutzung |
|---|---|---|
| Worker-Requests | 100'000 / Tag | ~20 / Tag |
| CPU-Zeit | 10 ms / Invocation | < 2 ms, auch mit Push-Verschlüsselung |
| Subrequests | 50 / Invocation | Turnstile + 1 pro Push-Gerät |
| D1 gelesene Zeilen | 5 Mio. / Tag | wenige Tausend |
| D1 geschriebene Zeilen | 100'000 / Tag | einstellig |
| D1 Speicher | 5 GB | wenige KB |
| Cron Trigger | im Free Plan enthalten | 1 pro Tag |
| Turnstile | gratis | |
| Web Push | gratis (Push-Dienste von Apple/Google) | |

Kein Grund für den Paid Plan. Die Tally-Grenzen (100 API-Anfragen pro Minute,
~49 Formulare pro Seitenaufbau) entfallen.
