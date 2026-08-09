# Projektplan: Formular-Übersichtsseite (Hono auf Cloudflare Workers)

## 1. Ziel

Eine öffentlich erreichbare Webseite, die alle Tally-Formulare eines Workspace als
Card-Grid darstellt. Jede Card enthält das eingebettete Formular, sodass Besucher
direkt auf der Seite ausfüllen können — ohne Umweg über tally.so.

Die Formularliste wird zur Request-Zeit aus der Tally-API gelesen. Ein neues
Formular in Tally erscheint damit ohne Deploy auf der Seite.

## 2. Stack-Entscheidungen

| Baustein | Wahl | Begründung |
|---|---|---|
| Runtime | Cloudflare Workers | Free Plan deckt das Volumen um Grössenordnungen |
| Framework | Hono | Web-Standard-`fetch`, kein Node-Polyfill nötig, ~14kB |
| Rendering | `hono/html` (server-side) | Formularliste ist erst zur Request-Zeit bekannt |
| Assets | Workers Assets (`./public`) | CSS/Fonts ohne Worker-Invocation ausliefern |
| Build | keiner | Kein Client-JS ausser dem Tally-Embed-Script |
| Sprache | TypeScript | |

### Explizit nicht gewählt

- **Vite / React SPA**: Es gibt keinen client-seitigen State. Ein Bundler würde
  Build-Zeit und Konfiguration kosten, ohne etwas zu lösen.
- **Statisches HTML mit Client-Fetch**: Das Tally-Embed-Script setzt die
  `src`-Attribute beim Laden. Bei nachträglich per JS eingefügten iframes müsste
  `Tally.loadEmbeds()` manuell und in der richtigen Reihenfolge nachgezogen
  werden. Server-Rendering vermeidet diese Abhängigkeit vollständig.
- **Caching (KV / Cache API)**: Bei ~17 Requests pro Tag kein Gegenwert.
  Nachrüstbar, falls die API-Latenz beim Seitenaufbau störend wirkt.

## 3. Architektur

```
Browser ──GET /──> Worker (Hono)
                     │
                     ├─ fetch api.tally.so/forms   (Bearer, serverseitig)
                     │
                     └─ HTML mit n × <button data-tally-open="{formId}">
                          │
Browser ─────────────────┴──> tally.so/widgets/embed.js
                                 └─ Klick auf Button → Formular als Popup
```

Die Formulare werden **nicht** inline eingebettet, sondern öffnen als Popup. Vor dem
ersten Klick lädt damit kein einziges Formular — unabhängig davon, wie viele Cards
auf der Seite stehen.

### Routen

| Route | Zweck |
|---|---|
| `GET /` | ganze Seite, server-rendered |
| `GET /impressum`, `/datenschutz` | Rechtstexte, ohne Tally-Embed |
| `GET /robots.txt`, `/sitemap.xml` | aus dem Worker, weil sie absolute URLs enthalten |
| alles andere | gestaltete 404 mit `noindex` |
| `GET /style.css`, `/fonts/*`, `/img/*`, Icons | Assets, vom Worker nicht angefasst |

Die Seite hat sechs Bereiche in dieser Reihenfolge: Header (Wortmarke,
Ankerlinks), Carousel, „Workshops Stadt Bern", „Wähle deinen Workshoptag" mit
Kontaktweg, „Ich bin Naira", Footer.

Kein öffentlicher API-Endpoint. Der Tally-Token verlässt den Worker nie.

### Datenfluss-Randfall

Fällt die Tally-API aus, darf die Seite nicht mit 500 antworten. Vorgesehen:
Fehler abfangen, leeres Grid mit Hinweistext rendern, Fehler nach Sentry.

## 4. Projektstruktur

```
.
├── src/
│   ├── index.ts          # Hono-App, alle Routen
│   ├── site.ts           # Stammdaten: Herkunft, Adresse, Preis, Gruppengrösse
│   ├── seo.ts            # JSON-LD (LocalBusiness + Event pro Workshop)
│   ├── seo.test.ts       # Unit-Tests von buildGraph() und jsonLd()
│   ├── tally.ts          # API-Client: listForms(), getFormQuestions()
│   ├── workshops.ts      # Workshop-Semantik: Hidden Fields, Datum, Filter
│   ├── workshops.test.ts # Unit-Tests der reinen Funktionen (node:test)
│   └── views/
│       ├── layout.ts     # html-Skeleton, Head, Meta, Header, Footer, Embed
│       ├── gallery.ts    # Bildliste und CSS-only Carousel
│       ├── intro.ts      # Section "Tufting-Workshops in Bern"
│       ├── schedule.ts   # Section "Wähle deinen Workshoptag" + Kontakt
│       ├── card.ts       # eine Form-Card
│       ├── about.ts      # Section "Ich bin Naira"
│       └── legal.ts      # Impressum, Datenschutz, 404
├── public/
│   ├── style.css         # Tokens und Regeln, siehe DESIGN_GUIDE.md
│   ├── fonts/            # Inter (Latin-Subset, self-hosted) + OFL-Lizenz
│   ├── img/              # Carousel, Bildraster, Porträt (aktuell Platzhalter)
│   ├── favicon.svg       # Wortmarke als N, dazu .ico und apple-touch-icon
│   └── og-image.png      # Link-Vorschau 1200×630 (aktuell typografisch)
├── wrangler.jsonc
├── tsconfig.json
└── package.json
```

## 5. Konfiguration

`wrangler.jsonc`:

```jsonc
{
  "name": "formular-uebersicht",
  "main": "src/index.ts",
  "compatibility_date": "2026-08-01",
  "assets": {
    "directory": "./public"
  },
  "observability": { "enabled": true }
}
```

Secrets (nicht im Repo):

```bash
wrangler secret put TALLY_TOKEN
```

Lokal via `.dev.vars` (in `.gitignore`).

## 6. Umsetzung in Phasen

Stand: Phase 1–4 umgesetzt (Tally-Anbindung, Cards, Embed, Fehlerfallback,
Meta-Schicht, Favicon, strukturierte Daten, Rechtstexte). Design Guide und CSS
stehen (`DESIGN_GUIDE.md`, `public/style.css`). Offen aus Phase 4: Lighthouse auf
der Zieldomain und die Custom Domain selbst.

### Phase 1 — Gerüst (0.5h)

- `npm create hono@latest`, Template `cloudflare-workers`
- `wrangler.jsonc` mit `assets`-Block ergänzen
- Route `/` liefert statisches Dummy-HTML
- `wrangler dev` läuft, `wrangler deploy` funktioniert

**Fertig wenn**: Eine leere Seite ist unter der `workers.dev`-Subdomain erreichbar.

### Phase 2 — Tally-Anbindung (1h)

- API-Token in Tally erstellen, als Secret setzen
- `src/tally.ts`: `listForms()` gegen `GET /forms`
- Response-Shape verifizieren und typisieren — die Feldnamen sind aus der
  Doku zu bestätigen, nicht zu erraten
- Filter: nur veröffentlichte Formulare, gelöschte ausschliessen

**Fertig wenn**: Route `/` gibt die Formularnamen als `<ul>` aus.

### Phase 3 — Cards und Embed (1–2h)

- `card.ts`: Card-Markup mit `<button data-tally-open="{formId}">`
- Popup-Parameter festlegen (`data-tally-width=420`, `data-tally-hide-title=1`)
- `embed.js` einmalig am Ende des `<body>`, nicht pro Card
- CSS: Grid, Card-Rahmen, responsive Breakpoints

**Fertig wenn**: Alle Formulare sind auf der Seite ausfüllbar.

### Phase 4 — Robustheit und Politur (1h)

- Fehlerfall Tally-API: Fallback-Rendering
- `<meta>`-Tags, Titel, Favicon, `lang`-Attribut
- Lighthouse-Durchlauf, `loading="lazy"` auf den iframes prüfen
- Custom Domain aufschalten

**Fertig wenn**: Deploy auf der Zieldomain, Lighthouse ohne rote Punkte.

Geschätzter Gesamtaufwand: **3.5–4.5h**.

## 7. Offene Punkte

### Entschieden

- **Workshop-Metadaten**: Jedes Formular trägt sie als `key=value` in einem
  `HIDDEN_FIELDS`-Block — `date=DD-MM-YYYY` und `freeSpots=n`. Das kompakte
  Altformat `DDMMYYYY` wird weiterhin gelesen.
- **Card-Titel ist das Datum.** Die Workshops haben keinen eigenen Namen; der
  Formularname aus Tally bleibt interner Bezeichner und wird nicht angezeigt.
- **Bildergalerie** unter dem Grid als CSS-only Carousel (Scroll-Snap,
  `::scroll-button`, `::scroll-marker`), gespeist aus `src/views/gallery.ts`.
  Aktuell Platzhalter — echte Bilder ersetzen die Liste 1:1.
- **Formular-Reihenfolge**: aufsteigend nach `date`, bei Gleichstand nach Name.
  Keine manuelle Liste, kein Deploy pro Änderung.
- **Beschreibungstext pro Card**: `GET /forms` liefert **kein** Beschreibungsfeld.
  Falls Text gebraucht wird, ist ein weiteres Hidden Field der Weg — der Parser
  liest beliebige Keys schon heute.
- **Vergangene Workshops** werden ausgeblendet, **ausgebuchte** (`freeSpots=0`)
  erscheinen mit Hinweis, aber ohne Anmelde-Button.
- **Darstellung des Formulars**: als Popup über `data-tally-open`, nicht inline.
  Damit entfällt die Frage nach der Höhenzuordnung mehrerer `dynamicHeight`-iframes
  ganz, und die Seite lädt vor dem ersten Klick kein Formular.
- **`freeSpots` wird manuell in Tally gepflegt** und zählt bei einer Anmeldung
  nicht selbst herunter — so gewollt. Die Zahl im Hidden Field ist die Wahrheit,
  der Worker rechnet nichts daraus ab. Eine unlesbare Zahl (Tippfehler) gilt als
  *unbekannt* und lässt die Anmeldung offen, statt sie zu blockieren.

- **Strukturierte Daten**: `LocalBusiness` plus ein `Event` pro Workshop als
  JSON-LD (`src/seo.ts`), gespeist aus denselben Daten wie die Cards. Damit sind
  Datum, Preis, Ort und der Ausgebucht-Zustand für Google lesbar — ohne Markup
  stehen sie nur als Fliesstext da.
- **Impressum und Datenschutz** als eigene Routen mit Footer-Link. Nötig, weil
  die Startseite `tally.so/widgets/embed.js` von einem Drittanbieter lädt. Auf
  den Rechtstexten selbst wird das Script nicht eingebunden.
- **`robots.txt` und `sitemap.xml` kommen aus dem Worker**, nicht aus `./public`:
  beide enthalten absolute URLs und stimmen so auf jeder Domain, auch bevor die
  Custom Domain steht.
- **Card-Titel ist `h3`**, nicht `h2` — `h2` gehört dem Sectiontitel „Wähle
  deinen Workshoptag". Zwei `h2` nebeneinander lesen sich im Screenreader als
  zwei gleichrangige Bereiche statt als Liste von Terminen.

### Weiterhin offen

- **Stammdaten in `src/site.ts`**: Adresse (Eigerplatz, 3007 Bern) und E-Mail
  stehen. Offen bleiben die **Hausnummer** — ohne sie findet eine Kartensuche
  nur den Platz, nicht das Studio —, der **vollständige Name** fürs Impressum
  und ein **Instagram-Profil** für `sameAs`. Was fehlt, ist `null` und wird
  weggelassen statt geraten: eine erfundene Angabe in strukturierten Daten ist
  schlechter als keine.
- **Uhrzeit der Workshops**: `Event.startDate` ist bisher nur datumsgenau, weil
  die Zeit nirgends in den Daten steht. Ein Hidden Field `time=10:00` wäre der
  Weg — `parseHiddenFields()` liest beliebige Keys bereits heute.
- **Kontaktformular „Schreibe mir"**: ein festes Tally-Formular, das über
  `data-tally-open` als Popup erscheint — derselbe Weg wie die Anmelde-Buttons.
  Die ID gehört in die Konstante `CONTACT_FORM_ID` in `schedule.ts`; solange
  sie leer ist, steht dort ein Hinweis statt des Buttons.
- **Logo**: aktuell die Wortmarke „Naira Tufting" als Text. Ein echtes Logo
  ersetzt die Konstante `WORDMARK` in `layout.ts` — und `favicon.svg`.
- **Bilder**: Carousel (3:2), 2×2-Raster (4:3) und Porträt (3:4) sind
  Platzhalter-SVGs. Die vier Rasterbilder tragen `alt=""`, weil sie als
  Platzhalter dekorativ sind; echte Fotos brauchen je einen eigenen Alt-Text.
  `og-image.png` ist typografisch gesetzt und gehört durch ein echtes Foto
  ersetzt (1200×630, PNG oder JPEG — SVG funktioniert als Link-Vorschau nicht).
- **Rechtstexte inhaltlich prüfen lassen**: `views/legal.ts` ist eine Vorlage.
  Was sich aus dem Code ergibt (Cloudflare als Hoster, Tally als Formularanbieter)
  steht ausformuliert da, alles andere als markierter Platzhalter.
- **Custom Domain**: Steht die zur Verfügung, oder reicht `workers.dev`? Sobald
  sie steht, gehört sie in `SITE_ORIGIN` — bis dahin ist die Herkunft des
  Requests kanonisch, und `workers.dev` und Zieldomain gälten als zwei Seiten.
- **Formular-Auswertung**: Bleiben die Submissions in Tally, oder braucht es
  später einen Webhook auf denselben Worker?

## 8. Nicht im Scope

- Authentifizierung / geschützte Formulare
- Anzeige oder Auswertung von Submissions
- CMS oder Admin-Oberfläche zur Pflege der Seite
- Mehrsprachigkeit

## 9. Betriebsgrenzen (Free Plan)

Erwartetes Volumen: ~500 Seitenaufrufe pro Monat, also ~17 Requests pro Tag.

| Limit | Free Plan | Erwartete Nutzung |
|---|---|---|
| Requests | 100'000 / Tag | ~17 / Tag |
| CPU-Zeit | 10ms / Invocation | < 1ms (I/O-Wartezeit zählt nicht) |
| Subrequests | 50 / Invocation | 1 + ein Request pro Formular |
| Asset-Requests | unbegrenzt, gratis | |

Kein Grund für den Paid Plan. Reserve über den Faktor 1000.

**Achtung Subrequests**: Die Workshop-Metadaten stehen nur in
`GET /forms/{id}/questions`, nicht in der Formularliste. Pro Seitenaufbau fällt
also ein Request pro veröffentlichtem Formular an — die Obergrenze liegt damit bei
rund **49 Formularen**. Entwürfe und geschlossene Formulare werden vor den
Detail-Requests herausgefiltert und zählen nicht mit. Wird die Grenze je knapp, ist
Caching (KV oder Cache API) der Ausweg, den §2 bereits als nachrüstbar vorsieht.
