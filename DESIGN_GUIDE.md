# Design Guide: Tufting-Workshops

Verbindliche Grundlage für alles Sichtbare auf dieser Seite. Was hier nicht
steht, wird nicht erfunden — es wird hier ergänzt und dann umgesetzt.

Umsetzung: [`public/style.css`](public/style.css). Jeder Token in diesem
Dokument existiert dort als CSS Custom Property. Ändert sich ein Wert, ändert
er sich an genau einer Stelle.

## 1. Haltung

Die Seite hat eine Aufgabe: zeigen, was der Workshop ist und wann er
stattfindet, und die Anmeldung öffnen. Jedes Element, das dieser Aufgabe nicht
dient, kommt weg.

Der Entwurf, aus dem die Inhalte stammen, arbeitet mit rosa Flächen,
Handschrift und gerundeten Ecken. Das ist bewusst nicht übernommen: aus dem
Entwurf kommen Struktur und Text, die Form kommt von hier.

Vier Regeln, aus denen sich der Rest ergibt:

1. **Licht statt Kästen.** Gruppierung entsteht durch Weissraum und einzelne
   Haarlinien, nicht durch Rahmen, Flächen oder Schatten.
2. **Farbe trägt keine Information.** Die Palette ist Schwarz, Weiss und drei
   Graustufen. Ein Zustand wie *ausgebucht* wird über Wortwahl, Schriftschnitt
   und Kontrast unterschieden — nie über einen Farbton. Das ist kein
   Selbstzweck: es macht die Zustände auch für farbfehlsichtige Besucher und im
   Schwarzweissdruck lesbar.
3. **Rechte Winkel.** `border-radius` ist überall `0`. Ohne Ausnahme.
4. **Typografie ist die Hierarchie.** Grösse, Gewicht und Laufweite ordnen die
   Seite. Es gibt keine Zierelemente.

Light Mode ist der einzige Modus. Es gibt keine Dark-Mode-Variante — `:root`
setzt `color-scheme: light`, damit Formularelemente nicht vom Betriebssystem
umgefärbt werden.

## 2. Farbe

| Token | Wert | Verwendung | Kontrast auf `--paper` |
|---|---|---|---|
| `--paper` | `#ffffff` | Seitenhintergrund. Die einzige Fläche. | — |
| `--ink` | `#000000` | Primärfarbe: Titel, Fliesstext, Button-Fläche, starke Linien | 21:1 |
| `--ink-muted` | `#595959` | Sekundärtext: Datum, Hinweistexte | 7.0:1 |
| `--ink-faint` | `#767676` | Zurückgenommener Zustand (ausgebuchte Card) | 4.6:1 |
| `--rule` | `#e0e0e0` | Haarlinien ohne Bedeutung | 1.3:1 |

`--ink-faint` ist die dunkelste Graustufe, die noch klar über der AA-Grenze von
4.5:1 liegt. Heller wird nichts, was Text ist — auch nicht für „deaktiviert“.

`--rule` ist bewusst kontrastarm und darf deshalb **nur** dekorativ eingesetzt
werden. Eine Linie, die eine notwendige Grenze markiert, ist `--ink`.

Nicht erlaubt: Gradienten, Transparenzen über Text, zusätzliche Grauwerte,
jeder Farbton mit Sättigung.

## 3. Typografie

Eine Familie: **Inter**, Variable, Gewichte 400–700.

Self-hosted unter `/fonts/inter-latin-var.woff2` (Latin-Subset, 48 kB,
`font-display: swap`, im `<head>` vorgeladen). Nicht über
`fonts.googleapis.com` — der CDN-Einbau schickt die IP jedes Besuchers zu
Google und kostet einen zusätzlichen Verbindungsaufbau vor dem ersten
Textrender. Die Lizenz (SIL OFL 1.1) liegt als `public/fonts/inter-OFL.txt`
neben der Datei und muss dort bleiben.

Fallback-Stack: `system-ui, -apple-system, 'Segoe UI', sans-serif`.

### Skala

| Token | Wert | Rolle | Gewicht | Laufweite | Zeilenhöhe |
|---|---|---|---|---|---|
| `--text-2xl` | `clamp(1.75rem, 1.25rem + 2.5vw, 3rem)` | Seitentitel (`h1`) | 600 | `-0.02em` | 1.15 |
| `--text-xl` | `clamp(1.5rem, 1.15rem + 1.75vw, 2.25rem)` | Section-Titel (`h2`) | 600 | `-0.02em` | 1.15 |
| `--text-lg` | `1.25rem` | Card-Titel, Wortmarke, Lead | 600 | `-0.01em` | 1.15 |
| `--text-base` | `1rem` | Fliesstext, Button, Navigation | 400 / 500 | 0 | 1.55 |
| `--text-xs` | `0.8125rem` | Status-Label, Zwischentitel, Footer | 500 | `+0.08em`, Versalien | 1.55 |

Es gibt genau einen `h1` pro Seite: den Titel der Section „Workshops Stadt
Bern". Der Seitentitel im `<head>` ist ein anderer Text — er muss in einem
Suchergebnis ohne Kontext funktionieren.

Regeln:

- Grosse Grade laufen enger (negatives Tracking), kleine Versalien laufen
  weiter. Beides ist Ausgleich, kein Effekt.
- Gewicht 700 bleibt unbenutzt. Wird es nötig, ist vorher die Hierarchie falsch.
- Kein `text-transform: uppercase` ausser bei Status-Label und Zwischentitel —
  beide teilen dieselbe Behandlung, damit es keine zweite Sorte Kleinschrift gibt.
- `font-variant-numeric: tabular-nums` gilt global. Die Ziffern der Seite sind
  Datumsangaben, Preise, Platzzahlen und Masse; die sollen untereinander stehen.
- Kursiv kommt nicht vor.
- Fliesstext bricht bei maximal ~34rem Zeilenlänge um (`.note`).

### Sprache

Deutsch, Schweizer Rechtschreibung: „ss“ statt „ß“. Datumsformat `DD.MM.YYYY`
in der Anzeige, ISO im `datetime`-Attribut.

## 4. Raum

4px-Raster. Alle Abstände kommen aus dieser Leiter — Zwischenwerte gibt es nicht.

| Token | Wert |
|---|---|
| `--space-1` | `0.25rem` (4px) |
| `--space-2` | `0.5rem` (8px) |
| `--space-3` | `0.75rem` (12px) |
| `--space-4` | `1rem` (16px) |
| `--space-6` | `1.5rem` (24px) |
| `--space-8` | `2rem` (32px) |
| `--space-12` | `3rem` (48px) |
| `--space-16` | `4rem` (64px) |

Der Abstand zwischen zwei Cards ist grösser als jeder Abstand innerhalb einer
Card. Bei den Terminen kommt die Kante des Kastens dazu; überall sonst trägt
der Abstand die Gruppierung allein.

## 5. Layout

Eine Seite, sechs Bereiche, in dieser Reihenfolge:

```
┌─────────────────────────────────────────┐
│ Naira Tufting      Workshops  Über mich │  .site-header  (1px Linie in --ink)
├─────────────────────────────────────────┤
│ Carousel                                │  section, aria-label
│ Workshops Stadt Bern    + drei Bilder   │  section#workshops    ← h1
│ Wähle deinen Workshoptag + Kontakt      │  section#termine
│ Ich bin Naira           + Porträt       │  section#ueber-mich
├─────────────────────────────────────────┤
│ © Jahr · Ort                            │  .site-footer  (1px Linie in --rule)
└─────────────────────────────────────────┘
```

- `--measure: 60rem` — maximale Inhaltsbreite. Jede Section, der Header und der
  Footer legen ihren Inhalt in ein `.wrap`; die Trennlinien von Header und
  Footer laufen dagegen über die volle Fensterbreite.
- `--carousel-item: 20rem` — Breite eines Bildes im Carousel, auf schmalen
  Schirmen auf `100%` gedeckelt.
- Grid der Termine: `repeat(2, minmax(0, 1fr))` ab `48rem`, darunter eine
  Spalte. Zwei feste Spalten statt `auto-fit`, damit eine Card immer gleich
  breit ist — bei `auto-fit` füllte ein einzelner Termin die ganze Zeile und
  sähe je nach Anzahl anders aus.
- Abstand im Grid: `--space-8` in beide Richtungen. Die Cards sind jetzt
  Kästen; ihre Kante trennt die Zeilen, dafür braucht es keinen grösseren
  vertikalen Abstand mehr.
- **Sections trennt Weissraum, keine Linie**: `padding-block: --space-16`, also
  8rem zwischen zwei Inhalten. Farbige Bänder wie im Entwurf gibt es nicht —
  siehe Regel 2.
- Ein einziger Breakpoint: ab `48rem` werden Intro und „Über mich"
  zweispaltig. Darunter ist alles eine Spalte, alles andere ist fluid.

## 6. Komponenten

### Seitenkopf `.site-header`

Wortmarke links, Ankerlinks rechts, darunter eine `1px`-Linie in `--ink` über
die volle Fensterbreite. Diese Linie ist die einzige starke Horizontale der
Seite.

- Die **Wortmarke** ist gesetzter Text (`--text-lg` / 600), kein Bild. Kommt ein
  echtes Logo, ersetzt eine SVG-Datei die Konstante `WORDMARK` in `layout.ts` —
  Höhe dann maximal `--space-8`.
- **Zwei Ankerlinks**, `#workshops` und `#ueber-mich`. Mehr Navigation gibt es
  nicht, weil es nur eine Seite gibt.
- Der Header **klebt nicht** (`position: static`). Auf einer Seite dieser Länge
  bringt eine mitlaufende Leiste nichts und nimmt auf dem Telefon Höhe weg.
- Ankerziele tragen `scroll-margin-top: --space-8`, damit ein Sprung nicht auf
  der Kante der Section landet.

### Section `.section`

`padding-block: --space-16`, Inhalt im `.wrap`, Titel als `h2.section__title`.
`.section--flush` halbiert den oberen Abstand — nur für die Carousel-Section
direkt unter dem Header.

### Intro `.intro`

Zweispaltig ab `48rem`: links Text, rechts drei Bilder untereinander
(eine Spalte auf allen Breiten).
Reihenfolge im Markup ist Text zuerst — auf dem Telefon liest man ihn zuerst.

Textbausteine: `h1.page-title`, `p.lead` (Untertitel, `--text-lg` / 600 — ein
Absatz, keine Überschrift, damit die Gliederung nicht zwei konkurrierende Ebenen
bekommt), Fliesstext, `ul.facts` (`--ink-muted`, ohne Punkte) und
`h2.subheading` für „Kosten".

### Zwischentitel `.subheading`

Kleine Versalien mit weiter Laufweite, identisch zum Status-Label. Für
Blöcke innerhalb einer Section, die einen Namen brauchen, aber keine eigene
Ebene: aktuell nur „Kosten".

### Card `.card`

```
┌──────────────────────────┐  ← border: 1px solid var(--ink), padding --space-6
│ WORKSHOP AM              │    Vorzeile, --text-xs / --ink-muted
│ 22.08.2026               │    h3, --text-lg / 600 — das Datum IST der Titel
│ NUR NOCH 2 PLÄTZE FREI   │    Status-Label, optional
│ ┌────────────┐           │
│ │  Anmelden  │           │    Link auf /anmeldung/…, optional
│ └────────────┘           │
└──────────────────────────┘
```

Die Vorzeile „Workshop am" steht **im** `h3`, nicht als eigener Absatz davor:
die Überschrift liest sich damit als ganzer Satz statt als nacktes Datum. Sie
trägt dieselbe Kleinschrift wie Status-Label und Zwischentitel — eine zweite
Sorte gibt es nicht — bleibt aber in `--ink-muted`, damit das Datum die Zeile
ist, die man zuerst liest.

**Der Titel der Card ist das Datum.** Die Workshops haben keinen eigenen Namen;
der Formularname aus Tally ist ein interner Bezeichner und erscheint nirgends.
Das Datum steht als `<time datetime="YYYY-MM-DD">` im `h2` — sichtbar
`DD.MM.YYYY`, maschinenlesbar ISO. Aus demselben Grund benennt das `aria-label`
des Buttons das Datum und nicht den Formularnamen: ein Screenreader soll nichts
vorlesen, was auf dem Bildschirm nicht steht.

Die Card ist ein Kasten: `1px`-Rahmen rundum in `--ink`, `--space-6` Innen­abstand,
Fläche `--paper`. Kein Schatten, keine Rundung, kein zweiter Farbwert — sie hebt
sich über ihre Kante ab, nicht über eine Tönung. Der Button wird per
`margin-top: auto` nach unten geschoben, damit die Buttons einer Grid-Zeile auf
einer Höhe stehen.

Die Card ist **nicht** als Ganzes klickbar. Nur der Anmelde-Link führt weiter —
auf die Anmeldeseite dieses Termins, nicht in ein Overlay.

### Status-Label `.card__notice`

Kleine Versalien mit weiter Laufweite. Erscheint in drei Fällen:

| Zustand | Text | Button |
|---|---|---|
| `open` | kein Label | „Anmelden“ |
| `low` | „Nur noch 2 Plätze frei“ | „Anmelden“ |
| `soldOut` | „Ausgebucht“ | keiner |

Der Anmelde-Button ist ein `<a>`, kein `<button>`: er führt auf eine eigene
Seite. Damit funktionieren Zurück-Knopf, neuer Tab und das Teilen der Adresse.

Bei `soldOut` nimmt sich die ganze Card zurück: Textfarbe `--ink-faint`, der
Rahmen fällt auf `--rule` zurück. Sie verschwindet nicht — ein vergebener
Platz ist eine Information.

### Button `.button`

Die einzige Fläche der Seite: `--ink` gefüllt, Text `--paper`, Gewicht 500,
keine Rundung, `1px`-Rahmen in `--ink`.

- Eine Klasse für alle Buttons — den Anmelde-Button der Card und den Button, der
  das Kontaktformular öffnet. `.card__cta` trägt nur noch das `margin-top: auto`,
  das die Buttons einer Grid-Zeile auf eine Höhe bringt.
- Hover invertiert (weisse Fläche, schwarzer Text) — der Rahmen liegt schon
  vorher da, deshalb springt beim Wechsel nichts.
- Hover-Regeln nur in `@media (hover: hover)`, sonst bleibt der Zustand auf
  Touch-Geräten nach dem Tap kleben.
- Mindesthöhe `2.75rem` (44px) als Zielgrösse für den Finger.
- Übergang `120ms ease` auf Farbe.

`.button` gilt für `<a>` und `<button>` gleichermassen. Die Formular-Buttons
sind Links, der Rest der Seite hat keine.

### Kontakt `.contact-block`

Der Weg für Leute, denen kein Termin passt: ein Satz, darunter der Button
„Schreibe mir".

Der Button ist derselbe wie auf den Cards und führt auf `/kontakt` — dieselbe
Formularseite wie die Anmeldung. Die Formular-ID steht fest in `site.ts`
(`CONTACT_FORM_ID`); im Gegensatz zu den Workshops wird sie nicht über die API
gesucht.

Solange die ID fehlt, gibt es die Seite nicht und statt des Links steht der
Hinweis `.contact__pending`. Ein Link ins Leere wäre schlimmer als keiner.

### Formularseite `.embed-wrap`

Eigene Seite pro Formular (`/anmeldung/{id}`, `/kontakt`) statt Popup: die
Formulare sind länger, als ein Overlay hoch ist. Im Overlay scrollt man in einem
Kasten im Kasten und sieht nie das Ganze. Auf einer eigenen Seite wächst das
iframe per `dynamicHeight` auf seine volle Höhe, und gescrollt wird die Seite.

Aufbau: `.back`-Link zurück zu den Terminen (`--text-xs`, Pfeil aus dem CSS —
ein Screenreader liest „Alle Termine", nicht „Pfeil links"), `h1` „Anmeldung",
darunter das Datum als `.lead`, dann das Formular. Das iframe ist auf
`--measure-text` gedeckelt und rahmenlos; seine Höhe kommt vom Embed und wird
im CSS nicht angefasst.

### Über mich `.about`

Zweispaltig ab `48rem`, `2fr` Porträt zu `3fr` Text — der Text ist der Inhalt.
Das Porträt steht im Markup zuerst, weil es auf dem Telefon über dem Text
erscheinen soll.

### Footer `.site-footer`

Drei Blöcke in einer Zeile, `--text-xs` in `--ink-muted`, darüber eine
Haarlinie in `--rule` — nicht in `--ink`: der Footer schliesst ab, er
gliedert nicht. Inhalt: Anschrift, Rechtstexte, Jahr und Wortmarke.

Die Anschrift steht in einem `<address>` mit `font-style: normal` — die Seite
kennt keinen kursiven Schnitt. Sie ist nicht Dekoration: lokale Suche braucht
Name, Adresse und Kontakt an einer sichtbaren Stelle, nicht nur im JSON-LD.

Profile stehen als Textlink in der Form `instagram.com/name` — kein Icon, keine
Fläche, keine zweite Schrift. Das folgt aus §8 („Icons ohne Textentsprechung"):
ein Glyph ohne Wort wäre hier das einzige Bildzeichen der Seite.

Das Jahr wird serverseitig in `Europe/Zurich` gerechnet, nicht ins Markup
geschrieben.

### Link

Links im Fliesstext sind **unterstrichen** (`1px`, `text-underline-offset:
0.15em`). In einer monochromen Palette gibt es kein anderes Merkmal, das sie von
Text unterscheidet — Farbe steht als Signal nicht zur Verfügung.

Ausnahme: Wortmarke und Navigation tragen keine Unterstreichung, weil sie durch
Position und Gruppierung erkennbar sind. Bei `:hover` und `:focus-visible`
erscheint sie.

### Hinweistext `.note`

Für leere Liste und Ladefehler: `--ink-muted`, maximal 34rem breit. Kein Icon,
kein farbiger Kasten. Ein Fehler ist ein Satz.

### Fliesstextseite `.prose--narrow`

Rechtstexte und die 404 sind durchgehender Text ohne Bild daneben. Sie laufen
auf `--measure-text` (38rem) statt auf der vollen `--measure`: Zeilen über der
Lesbreite ermüden. Zwischentitel bekommen mehr Luft nach oben als nach unten,
sonst hängen sie am falschen Absatz.

### Offene Stelle `.todo`

Ein `<mark>` in den Rechtstexten, dort wo eine Angabe noch fehlt: Text in
`--ink` auf `--rule`. Die einzige Stelle, an der `--rule` eine Fläche ist statt
einer Linie — bewusst, weil eine Lücke beim Korrekturlesen übersehen wird und
eine markierte Stelle nicht. Sie verschwindet, sobald die Texte stehen.

### Galerie und Carousel `.gallery` / `.carousel`

Erste Section der Seite, direkt unter dem Header: Bildstrecke, horizontal
scrollend, **ohne eine Zeile JavaScript**. Sie trägt keine sichtbare
Überschrift, aber ein `aria-label` — sonst wäre der Bereich namenlos. Grundlage ist eine `<ul>` mit `overflow-x: auto` und
`scroll-snap-type: x mandatory`; Pfeile und Punkte sind Pseudo-Elemente dieser
Liste. Aufbau nach dem MDN-Leitfaden [CSS
carousels](https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Overflow/Carousels).

```
Impressionen                              ┌───┐┌───┐
                                          │ ‹ ││ › │   ::scroll-button()
┌──────────┐┌──────────┐┌──────────┐      └───┘└───┘
│  Bild 1  ││  Bild 2  ││  Bild 3  │ →    scroll-snap-align: start
└──────────┘└──────────┘└──────────┘
              ■ □ □ □                     ::scroll-marker-group
```

| Baustein | Umsetzung |
|---|---|
| Streifen | `.carousel`, `display: flex`, `gap: --space-4`, `anchor-name: --carousel` |
| Bild | `.carousel__item`, `flex: 0 0 min(100%, --carousel-item)`, `scroll-snap-align: start` |
| Pfeile | `::scroll-button(left/right)`, 44×44px, schwarz gefüllt, oben rechts über dem Streifen |
| Punkte | `::scroll-marker` je Bild, 16px-Quadrate, aktiver Punkt gefüllt |
| Gruppe | `scroll-marker-group: after`, per `position-anchor` unter dem Streifen zentriert |

Regeln und Begründungen:

- **`scroll-snap-align: start`**, nicht `center` wie im MDN-Beispiel: bei
  mehreren gleichzeitig sichtbaren Bildern blättert das vorhersehbar von links
  nach rechts.
- **Pfeilzeichen sind `‹` und `›`**, nicht `←`/`→`. Die Pfeile fehlen im
  Latin-Subset von Inter, die Anführungszeichen sind drin — sonst käme der
  Fallback-Font mitten in die Komponente.
- **`content: '‹' / 'Vorherige Bilder'`** — der zweite Teil ist der zugängliche
  Name. Ohne ihn hätte der Button keinen (WCAG 4.1.2).
- **`data-label` am `<li>`** liefert dem Punkt über `content: attr(data-label)`
  seinen Namen; der Text wird per `text-indent` aus dem 16px-Quadrat geschoben.
  Ein Punkt ohne `data-label` wäre für Screenreader namenlos.
- **Am Rand deaktiviert der Browser den jeweiligen Pfeil selbst** (`:disabled`).
  Er verschwindet nicht, sondern wird weiss mit Haarlinie und `--ink-faint`.
- **Platz für Pfeile und Punkte wird nur reserviert, wo es sie gibt** —
  `@supports selector(::scroll-button(right))`. Dort verschwindet auch die
  Scrollbar, weil die Bedienelemente ihre Aufgabe übernehmen.
- **`scroll-behavior: smooth`**, unter `prefers-reduced-motion: reduce`
  abgeschaltet.

#### Browser-Unterstützung

`::scroll-button()` und `::scroll-marker` gibt es bisher nur in Chromium (ab
135). Safari und Firefox bekommen **keinen kaputten Zustand**, sondern die
Grundlage: einen scroll-snappenden Streifen mit sichtbarer Scrollbar, per
Touch, Trackpad und Mausrad bedienbar. Die Bilder sind vollständig erreichbar,
nur die Pfeile und Punkte fehlen. Das ist der Grund, warum die Komponente auf
Scroll aufbaut und nicht auf `transform`.

Zwei Punkte, die man dabei kennen muss:

- Wo die Markergruppe entsteht, bekommt der Streifen `tablist`/`tab`-Semantik
  und ist mit den Pfeiltasten bedienbar. Wo sie fehlt, hängt die
  Tastaturbedienung davon ab, ob der Browser Scroll-Container fokussierbar
  macht. Deshalb darf in der Galerie nichts stehen, was es nicht anderswo auch
  gibt — sie ist Illustration, kein Informationsträger.
- Die Punkte sind 16px gross bei 16px Abstand, also 32px von Mitte zu Mitte.
  Das unterschreitet die 44px-Zielgrösse bewusst und erfüllt WCAG 2.5.8 über
  die Abstandsregel (24px). Sie sind ein zusätzlicher Weg, kein einziger.

## 7. Interaktion und Barrierefreiheit

- **Fokus**: `:focus-visible` → `2px solid var(--ink)`, `outline-offset: 2px`.
  Wird nie entfernt und nie durch etwas Schwächeres ersetzt.
- **Sprunglink**: erstes Element im `body`, führt auf `#inhalt` (das `<main>`).
  Er liegt per `left: -100vw` ausserhalb des Bildes statt auf `display: none` —
  sonst wäre er nicht fokussierbar.
- **Landmarks**: `header`, `main#inhalt`, `footer`, `nav` mit
  `aria-label="Seitenbereiche"`, jede Section mit Überschrift oder `aria-label`.
  Kein Bereich ohne Namen.
- **Kein Farbcode**: siehe Regel 2. Jeder Zustand ist ohne Farbe erkennbar.
- **Zielgrössen**: interaktive Elemente mindestens 44×44px.
- **Ankersprünge gleiten** (`scroll-behavior: smooth` an `html`). Navigation und
  Sprunglink führen innerhalb derselben Seite; der harte Sprung zeigt nicht, wie
  weit es ging. Der Fokus wandert trotzdem sofort mit — die Bewegung ist rein
  visuell und hält niemanden auf.
- **`prefers-reduced-motion: reduce`**: alle Übergänge aus, Seite und Galerie
  springen dann wieder hart. Ohne das ist weiches Scrollen ein Auslöser für
  vestibuläre Beschwerden.
- **Screenreader**: der Anmelde-Button trägt ein `aria-label` mit dem
  Workshop-Namen, weil „Anmelden“ ausserhalb der Card nicht unterscheidbar ist.
- **Kein Client-JS für Inhalt.** Das Tally-Embed-Script ist die einzige
  Ausnahme und betrifft nur das Popup. Ohne JavaScript bleibt die Seite
  vollständig lesbar, inklusive Galerie; nur die Anmeldung braucht es.
- **Zoom**: bis 200% ohne horizontales Scrollen. Alle Grössen in `rem`, keine
  festen Höhen an Textcontainern.
- **Überschriftenränge folgen der Verschachtelung, nicht der Optik.** Der
  Sectiontitel ist `h2`, ein Termin darin `h3`. Wie gross etwas aussieht,
  entscheidet die Klasse — `.card__title` und `.section__title` sind
  Gestaltung, kein Rang.
- **Listen ohne Punkte tragen `role="list"`.** Safari nimmt einer `<ul>` mit
  `list-style: none` die Listensemantik; VoiceOver zählt die Einträge sonst
  nicht. Betrifft Navigation, Fakten, Preise, Carousel und Footer.
- **Der Carousel-Streifen ist per `tabindex="0"` fokussierbar.** Wo
  `::scroll-button()` fehlt, sind die Pfeiltasten der einzige Weg zum zweiten
  Bild. Das ist Bedingung dafür, dass die Galerie ohne JavaScript auskommen darf.

### Kontrastmodus

Der Windows-Kontrastmodus (`forced-colors: active`) ersetzt alle Farben durch
die Systempalette. Die Seite unterscheidet ihre Zustände über Flächen — genau
die fallen dabei weg: Button und aktiver Galeriepunkt verlören ihre Fläche und
wären von ihrer inaktiven Form nicht mehr zu trennen.

Regel: Was seine Bedeutung aus einer Fläche bezieht, bekommt im Kontrastmodus
zusätzlich einen Rahmen in `ButtonText`. Der aktive Galeriepunkt behält seine
Fläche über `Highlight` mit `forced-color-adjust: none` — die einzige Stelle,
an der die Erzwingung ausgeschaltet wird, und nur dort, weil sonst die
Unterscheidung verschwindet.

Die Palette der Seite kommt im Kontrastmodus nicht zurück. Das ist gewollt: wer
ihn einschaltet, will die Systemfarben.

## 8. Ausdrücklich nicht erlaubt

Diese Liste existiert, damit „nur dieses eine Mal“ nicht passiert:

- Schatten, `border-radius`, Gradienten
- eine zweite Schriftfamilie oder ein Icon-Font
- Farbe als Bedeutungsträger
- Animationen ausser dem Farbübergang an Buttons und Punkten und dem
  weichen Scrollen von Seite und Galerie
- JavaScript für Layout oder Interaktion — Ausnahme bleibt allein das
  Tally-Embed auf den Formularseiten (`public/tally.js`), das Carousel kommt
  ohne aus
- Icons ohne Textentsprechung
- klickbare Cards, Hover-Effekte auf ganzen Blöcken
- Autoplay in der Galerie
- Grauwerte unter 4.5:1, wenn es Text ist
- Inline-`style`-Attribute im Markup
- Werte, die nicht aus einem Token kommen

## 9. Dateien

| Datei | Inhalt |
|---|---|
| `DESIGN_GUIDE.md` | dieses Dokument — die Entscheidungen |
| `public/style.css` | Tokens und Regeln, gliedert sich nach §2–6 |
| `public/tally.js` | Startet die Embeds der Formularseiten (Höhe per iframe-resizer) |
| `public/fonts/inter-latin-var.woff2` | Inter Variable, Latin-Subset |
| `public/fonts/inter-OFL.txt` | Lizenz, muss bei der Font-Datei bleiben |
| `public/img/carousel-*.svg` | Platzhalter des Carousels (3:2) — durch echte Bilder ersetzen |
| `public/img/workshop-*.svg` | Platzhalter der drei Intro-Bilder (4:3) |
| `public/img/naira.svg` | Platzhalter des Porträts (3:4) |
| `public/favicon.svg` | Wortmarke als „N", weiss auf schwarz — dazu `favicon.ico` und `apple-touch-icon.png` |
| `public/og-image.png` | Link-Vorschau 1200×630, typografisch — durch ein echtes Bild ersetzen |
| `src/views/layout.ts` | Skeleton, Head, Meta-Schicht, Seitenkopf, Footer |
| `src/views/gallery.ts` | Bildliste und Carousel-Markup |
| `src/views/intro.ts` | Section „Tufting-Workshops in Bern": Text, Fakten, Preise, Bilder |
| `src/views/schedule.ts` | Section „Wähle deinen Workshoptag": Grid und Kontakt |
| `src/views/card.ts` | Card-Markup und Zustandslogik |
| `src/views/signup.ts` | Formularseiten: Anmeldung je Termin und Kontakt |
| `src/views/about.ts` | Section „Ich bin Naira" |
| `src/views/legal.ts` | Impressum, Datenschutz, 404 — `.prose--narrow` |

Die Texte der Seite stehen als Konstanten in den View-Modulen. Es gibt kein CMS
(plan.md §8), eine Textänderung ist ein Deploy. Ausnahme sind die Termine: die
kommen zur Request-Zeit aus Tally.

Klassen sind BEM-artig benannt (`.card__title`, `.site-header__logo`). Ausgelesen
wird der Zustand über `data-state` auf der Card, nicht über eine Zustandsklasse
— den Wert liefert `Workshop.state` unverändert.

Ausgeliefert wird `public/` über Workers Assets: ohne Worker-Invocation, ohne
Kosten, mit eigenem Caching. Deshalb liegt das CSS in einer Datei und nicht im
`<head>`.
