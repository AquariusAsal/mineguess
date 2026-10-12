# MineGuess DESIGN-BRIEF (Fassung 1, forscher)

Ziel: ruhig, flach, klar. Minecraft-Erdtöne, ein Akzent (Grasgrün), Gold nur für Premium und Siege. Dieses Dokument ist umsetzbar gedacht: Werte sind fertig, bitte als CSS-Variablen in `:root` übernehmen. Begründungen und Quellen stehen in `RESEARCH-NOTES.md`.

## 1. Was heute "KI-generiert / zu viel" wirkt (konkret)

| Stelle | Problem | Ersatz |
|---|---|---|
| `index.html` Hero | `radial-gradient`-Glow hinter dem Titel, pulsierender Punkt im Tag, `backdrop-filter` auf der Nav, Pille mit Großbuchstaben | flacher Hintergrund, kein Puls, Nav deckend, Tag entfällt |
| `index.html` Zahlenleiste | "648 Fragen", "9 Kategorien", "∞ Wiederspielwert" ist Marketing-Füllstoff, und die Zahlen stimmen nicht (questions.json hat jetzt 639, game.html wirbt mit "225+", Landing mit "648" und "9 Kategorien" bei 10) | eine ehrliche Zeile, Zahl aus Daten oder weglassen |
| `index.html` "Drei Wege zu spielen" | Es gibt in game.html fünf Modi. Drei gleiche Karten mit Emoji-Symbol, Badge und Fließtext = SaaS-Raster | Eine Hauptaktion "Spielen" plus Modusliste als schlichte Zeilen |
| `index.html` Premium-Karte | Verlauf, 40 px Padding, Gold-Pille, Preis in Monospace 2,4 rem, Häkchenliste: klassische Pricing-Section | dezente Einzelzeile (siehe Abschnitt 8) |
| `game.html` Modus-Auswahl | 5 Karten, jede mit eigener Akzentfarbe (`--mc`), eigenem Emoji, eigenem Tag-Chip in eigener Farbe. Fünf Farben = kein System | Einheitliche Karte, Akzent nur grün, Tag nur wenn nötig (Wort "Neu"/"Täglich") in Stein-Grau |
| `game.html` Markup | Splash-Screen steht doppelt im Markup, sehr viele Inline-Styles (`onmouseover` für Hover), Buttonreihe mit 4 Emoji-Buttons | ein Splash, Hover per CSS, Icon-Buttons als SVG oder Text |
| `game.html` / alle | Emoji als Bedienelemente (🏆 🎖 📊 ⭐ 🔒 🌍 ➕ ▶ ↩) wirken beliebig und rendern je Gerät anders | kleine einheitliche SVG-Icons (Linien 2 px, 20 px) oder reiner Text |
| `multiplayer.html` Join | Tab-Leiste mit 3 Emoji, Raum-Code als Freitext (`z.B. epiccreeper42`) mit Passwortfeld im Klartext | Code als 4 bis 6 Zeichen-Feld, Passwort als Option einblenden |
| `multiplayer.html` Buttons | `linear-gradient(135deg, …)` auf Haupt-Buttons, `filter: brightness` beim Hover | flache Farbe, Rahmen-Unterkante (siehe Buttons) |
| `multiplayer.html` Ceremony | Hintergrund mit 3-Farben-Verlauf, Podium mit Metall-Verläufen, `text-shadow` Glow, Konfetti | ruhige Platzierungsliste, Gold nur für Platz 1 als Vollfarbe, Konfetti nur kurz (Abschnitt 7) |
| Fonts | drei Familien: Inter, Space Grotesk, Space Mono, teils für dieselbe Aufgabe | zwei Familien (Abschnitt 4) |
| Premium-Texte | "Beliebteste Wahl" bei nur zwei Plänen, "Climb faster, rank higher" (Englisch), "Das ultimative Minecraft-Quiz Erlebnis", Hinweis "?premium=1 zum Testen" im Toast für Endnutzer | Abschnitt 8 |

## 2. Designprinzipien

1. **Eine Aktion pro Bildschirm.** Pro Screen genau ein auffälliger Button (grün). Alles andere sekundär (Rahmen) oder Textlink.
2. **Flach statt Glow.** Keine Verläufe, keine Blur-Flächen, keine farbigen Schatten. Tiefe durch 2 px Unterkante (Block-Optik), nicht durch Schatten.
3. **Pixel sparsam.** Pixelschrift nur für Logo und Überschriften H1/H2, Pixelrahmen nur an Karten und Buttons. Fließtext, Zahlen im Timer und Eingaben sind nie Pixel.
4. **Farbe trägt Bedeutung.** Grün = richtig/Aktion, Rot = falsch/Zeit knapp, Gold = Sieg/Premium, Blau = Info/Link. Nie nur Farbe: immer Icon oder Text dazu.
5. **Kurze Bewegung.** 120 bis 250 ms, nur bei Zustandswechsel oder Feedback. Keine Dauer-Animation außer dem Timer. `prefers-reduced-motion` schaltet alles auf Sofort-Wechsel.
6. **Daumen zuerst.** Haupt-Aktionen unten erreichbar, Ziele ≥ 48 px hoch, 8 px Abstand.
7. **Deutsch, kurz, du-Form.** Labels ohne Großbuchstaben-Schreierei (kein `text-transform: uppercase` auf Fließtext).

## 3. Farbpalette (Dark ist Standard, Light bleibt über `data-theme="light"`)

Kontrast nach WCAG 2.1 berechnet. Normaltext braucht 4,5, Großtext/UI-Rahmen 3.

### Dark

| Token | Hex | Verwendung | Kontrast |
|---|---|---|---|
| `--bg` | `#15171A` | Seitenhintergrund (Obsidian-Grau, nicht reines Schwarz) | Basis |
| `--surface` | `#1F2226` | Karten, Panels | Basis |
| `--surface-2` | `#2B2F34` | Eingabefelder, Hover-Fläche, Chips | Basis |
| `--line` | `#3A3F45` | dekorative Trennlinien | 1,7 mit bg (nur Deko) |
| `--line-strong` | `#6B7279` | Eingabefeld-Rahmen, Fokus-fremde UI-Ränder | ca. 3,6 mit bg (erfüllt 3:1) |
| `--text` | `#F1EFE8` | Fließtext, Titel | 15,6 mit bg, 13,9 mit surface |
| `--muted` | `#A9A69B` | Zweittext, Hinweise | 7,4 mit bg, 6,6 mit surface |
| `--grass` | `#6CBF3C` | Primär-Aktion, richtig | 7,8 mit bg |
| `--grass-press` | `#4F9A28` | gedrückt, Unterkante Button | nur als Fläche |
| `--on-grass` | `#10130C` | Text auf grünem Button | 8,2 mit grass |
| `--gold` | `#E8B93A` | Premium, Platz 1, Streak | 9,8 mit bg |
| `--on-gold` | `#1A1405` | Text auf Gold | 10,0 mit gold |
| `--red` | `#E5604D` | falsch, Zeit < 5 s | 5,2 mit bg, 4,6 mit surface |
| `--blue` | `#5AA9E6` | Link, Info, "du" in Listen | 7,1 mit bg |
| `--dirt` | `#7A5A3A` | nur Pixeldeko (Rahmenfarbe Logo-Block), nie Text | Deko |

### Light (muss weiter funktionieren)

| Token | Hex | Kontrast |
|---|---|---|
| `--bg` | `#F4F1E8` | Basis |
| `--surface` | `#FFFFFF` | Basis |
| `--text` | `#1D1F1A` | 14,7 |
| `--muted` | `#5B5D52` | 5,9 |
| `--grass` (als Text/Fläche) | `#3D7A1C` | 4,6 auf bg, weißer Text darauf 5,3 |
| `--gold` (Text) | `#8A6200` | 4,9 |
| `--red` | `#B3321F` | 5,5 |

Regel: grüne Flächen mit Text darauf immer `--on-grass`, nie Weiß auf `#6CBF3C` (nur 2,3).

## 4. Typografie

| Rolle | Font | Quelle | Verwendung |
|---|---|---|---|
| Pixel (nur Überschriften) | **Press Start 2P** (Fallback `"Courier New", monospace`) | Google Fonts, 1 Gewicht | Logo, H1 des Screens, Rundenzahl, Ergebnis-Titel. Größe 16 bis 28 px, `line-height: 1.4`, nie unter 12 px, Umlaute geprüft |
| Fließtext/UI | **Nunito** 400/600/800 (Fallback `system-ui, "Segoe UI", sans-serif`) | Google Fonts | alles andere inkl. Buttons, Labels, Eingaben, Timer-Ziffern (`font-variant-numeric: tabular-nums`) |

Ladehinweis: `display=swap`, `preconnect` auf fonts.gstatic.com, nur genutzte Gewichte. Space Grotesk, Space Mono und Inter komplett entfernen (spart drei Familien).

Skala (mobile / desktop): H1 Pixel 20 / 28 px, H2 Nunito 800 20 / 24 px, Text 16 / 17 px, Klein 14 px (Hinweise, nie darunter), Frage-Text 20 / 26 px, `line-height` Text 1,5, Frage 1,35. Eingaben immer ≥ 16 px.

## 5. Komponentenregeln

### Raster, Radius, Rand
- Abstände: 4er-Raster (4, 8, 12, 16, 24, 32).
- Radius: **4 px** überall (kantig, Block-nah). Keine Kreise: auch Avatare sind quadratisch (siehe Spielerchip).
- Rahmen 2 px `--line`. Keine Schatten außer `0 2px 0` Unterkante bei Buttons.

### Buttons (Höhe 48 px, min-width 44 px)
| Typ | Aussehen | Hover/Active |
|---|---|---|
| Primär | Fläche `--grass`, Text `--on-grass` Nunito 800 16 px, Unterkante `box-shadow: 0 3px 0 var(--grass-press)` | Hover: `translateY(-1px)`, Active: `translateY(2px)` und Schatten 1 px |
| Sekundär | transparent, Rahmen 2 px `--line-strong`, Text `--text` | Hover: Fläche `--surface-2` |
| Premium | wie Sekundär, Rahmen `--gold`, Text `--gold`, kleiner 4-px-Stern als SVG | Hover: Fläche `rgba(232,185,58,.1)` |
| Gefahr (Raum verlassen) | Rahmen `--red`, Text `--red` | Hover: Fläche leicht rot |
| Text-Link | `--blue`, Unterstrich bei Hover | |
| Deaktiviert | Fläche `--surface-2`, Text `--muted`, `cursor: not-allowed`, kein Hover | |
Fokus: `outline: 3px solid var(--blue); outline-offset: 2px` für alle interaktiven Elemente.

### Karten
Eine einzige Kartenart: `--surface`, Rahmen 2 px `--line`, Radius 4 px, Padding 16 px (Mobile) / 24 px (Desktop). Auswahlkarten (Modus, Raum) sind dieselbe Karte, im Hover Rahmen `--line-strong`, ausgewählt Rahmen `--grass`. Kein Emoji als Kartenicon, höchstens ein 24-px-SVG.

### Eingaben
Höhe 48 px, Fläche `--surface-2`, Rahmen 2 px `--line-strong`, Fokus Rahmen `--blue` plus Outline. Label immer sichtbar über dem Feld (14 px `--muted`), nie nur Platzhalter. Fehler: Rahmen `--red`, Text darunter mit Icon "!" und Meldung. Raum-Code: 6 Zeichen, Großbuchstaben, `autocapitalize="characters"`, `inputmode="text"`, Monospace-Look über `letter-spacing: .2em` (Nunito reicht).

### Timer
Balken statt Kreis: 8 px hoch, volle Breite der Karte, Füllung `--grass`, wechselt bei ≤ 10 s zu `--gold`, bei ≤ 5 s zu `--red` (mit zusätzlich Sekundenzahl rechts, `tabular-nums`, nie nur Farbe). Balken per `transform: scaleX()` animieren, nicht `width`. Bei Ablauf kein Blinken. Letzte 5 s: Zahl pulsiert einmal pro Sekunde um 6 % (aus bei reduced-motion).

### Spielerchip (Multiplayer)
Zeile 48 px: 32-px-**Kopf-Avatar** (quadratisch, `image-rendering: pixelated`, 2 px Rahmen `--line`), Name (Nunito 600, max 14 Zeichen, `text-overflow: ellipsis`), rechts Zustand als Text-Chip ("bereit", "hat gebuzzert", "richtig +150"). Fallback ohne Skin: Quadrat in Farbe aus Name-Hash (6 feste Erdtöne aus Palette, nie Neon) mit Initiale. Der eigene Chip hat Rahmen `--blue` und das Wort "du". Ausgeschiedene/Getrennte: Opazität .5 plus Text "getrennt". Host: kleines Kronen-SVG in `--gold` plus Text-Tooltip "Host".

### Toasts
Unten mittig (Mobile: über der Safe-Area, 16 px Abstand), `--surface-2`, Rahmen 2 px, Icon links (Haken/Info/Warnung), max 2 Zeilen, 3 s sichtbar (Fehler 5 s), `role="status"` bzw. `role="alert"` für Fehler. Eine Toast-Warteschlange, nie mehrere übereinander.

### Modal
Deckend `--surface` auf 70 % schwarzem Scrim (kein Blur), max-width 420 px, schließbar per Esc und X, Fokus-Falle, Fokus zurück auf Auslöser.

## 6. Layouts

Breakpoints: 360 (Basis), 600, 900, 1200. Inhaltsbreite max 960 px (Landing), 720 px (Spielbildschirme), zentriert.

### Landing (`index.html`)
Mobile (360–599): Kopf 56 px (Logo links, "Anmelden"-Textlink rechts, keine Link-Leiste). Darunter: Logo/Titel (Pixel H1 "MineGuess", Unterzeile 1 Satz), **ein** grüner Button "Spielen" (volle Breite), darunter Textlink "Mit Freunden spielen". Danach schlichte Modusliste (5 Zeilen: Name, 1 Satz, Pfeil, Zeilen 56 px). Footer mit Impressum, Datenschutz, Credits (Wiki-Quelle).
Desktop (≥ 900): zweispaltig, links Titel + Button, rechts ein echter Spielausschnitt (statisches Mock der Frage-Karte). Modusliste als 2-Spalten-Raster darunter.
Ehrlichkeit: nur Zahlen anzeigen, die stimmen oder dynamisch gezogen werden.

### Modus-/Raum-Auswahl (`game.html` Modus-Screen, `multiplayer.html` Join)
Mobile: eine Spalte, Karten 72 px hoch, Titel 18 px, Untertitel 14 px. Sekundäre Aktionen (Rangliste, Abzeichen, Kategorien, Abmelden) als zweizeilige Reihe Text-Buttons, nicht als vier Emoji-Pillen.
Multiplayer-Join: Namensfeld oben. Darunter **zwei** große Wege: "Raum erstellen" und "Mit Code beitreten". Öffentliche Räume als Liste darunter (Name, Spielerzahl x/8, Beitreten). Kein Tab-Leisten-Umschalter mit drei Emoji.

### Lobby
Mobile: oben Raumcode groß (Pixel 24 px, Kopier-Button 48 px, "Link teilen" per `navigator.share` falls vorhanden), darunter Spielerliste (8 Slots, leere Slots als gestrichelte Zeile "wartet…"), unten fixierter Bereich mit "Bereit"-Button (Host: "Starten", deaktiviert bis ≥ 2 bereit, Begründung als Text darunter). Einstellungen (Premium-Kategorien) einklappbar.
Desktop: zweispaltig, links Code + Einstellungen, rechts Spieler.

### Frage
Mobile (390x844): Kopfzeile 48 px (Runde "3 / 10", Punkte rechts). Timer-Balken. Frage-Karte (Kategorie als kleiner Text-Chip, Frage 20 px). Eingabe + Senden unten fixiert über Tastatur (`position: sticky; bottom: 0` mit `env(safe-area-inset-bottom)`). Im Multiplayer vor der Antwort: ein riesiger Buzzer-Button (Höhe ≥ 30 vh, volle Breite) statt kleiner Button.
Desktop: Frage-Karte links 2/3, Spielerliste rechts 1/3 mit Live-Status.

### Ergebnis (pro Runde)
Karte mit Antwort ("Richtig: 15 Blocks"), Spieler-Antwort, ±Punkte als große Zahl, funFact in einer Zeile mit Label "Wusstest du?". Rangliste kompakt darunter (Top 3 + du). Kein Overlay-Spektakel. "Weiter" nur für Solo, im Multiplayer Countdown-Balken (6 s) mit Text.

### Endscreen
Platzierungsliste vertikal: Platz 1 mit goldenem linken Balken 6 px und Text "Sieger", Plätze 2–3 grau/bronze-neutral (nur Zahl). Eigene Zeile hervorgehoben. Darunter zwei Buttons: "Nochmal" (primär), "Zur Lobby" (sekundär). Konfetti: einmalig 1,2 s, max 24 Teile, nur wenn du Platz 1 bist.

## 7. Animationskatalog

Standard-Easing `cubic-bezier(.2,.8,.2,1)` ("out"), Austritt `cubic-bezier(.4,0,1,1)`. Nur `transform` und `opacity`.

| Name | Zweck | Dauer | Beschreibung |
|---|---|---|---|
| `press` | Button-Feedback | 90 ms | Active: `translateY(2px)` |
| `screen-in` | Bildschirmwechsel | 200 ms | Opacity 0→1, `translateY(8px→0)`; Austritt 120 ms nur Opacity |
| `card-in` | Spieler/Liste erscheint | 180 ms, Versatz 40 ms je Eintrag (max 6) | Opacity + `translateY(6px)` |
| `answer-correct` | richtige Antwort | 220 ms | Eingabefläche wird `--grass` getönt, Haken-Icon `scale(.6→1)`; Punktezahl zählt in 400 ms hoch |
| `answer-wrong` | falsche Antwort | 240 ms | horizontaler Shake ±4 px (3 Schwingungen), Rahmen `--red` |
| `buzz` | Buzzer gedrückt | 150 ms | Button `scale(.97)`, danach Zustand "du bist dran" mit Rahmen `--grass` |
| `buzz-other` | anderer buzzert | 180 ms | betroffener Chip bekommt Text "hat gebuzzert", Rand kurz `--gold`, Rest wird `opacity: .6` |
| `timer-tick` | letzte 5 s | 1 s Intervall | Zahl `scale(1→1.06→1)` |
| `countdown` | 3-2-1 vor Start | 3 x 700 ms | Ziffer `scale(.8→1)`+Opacity, kein Rotieren, kein Vollbild-Schwarz (Scrim 70 %) |
| `toast-in/out` | Meldung | 180 / 140 ms | `translateY(12px→0)` und zurück |
| `rank-move` | Rangliste ändert sich | 300 ms | FLIP: Zeilen gleiten per `transform` an neue Position |
| `confetti` | nur Sieger-Endscreen | 1200 ms einmalig | 24 quadratische Teile in Palette, Fall + Opacity, danach aus dem DOM |
| `skeleton` | Lade (Raumliste) | 1,2 s Loop, nur solange geladen wird | Fläche `--surface-2` ↔ `--surface` Opacity .6 ↔ 1 |

Verboten: Dauer-Pulse, Rotationen, Glow-Animationen, Partikelhintergrund (`block-rain-canvas` auf Landing entfernen oder stark einschränken), Parallax.

**Reduced Motion:** global
```css
@media (prefers-reduced-motion: reduce){
  *,*::before,*::after{animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important;scroll-behavior:auto!important}
}
```
Zusätzlich: Konfetti und Rank-Move per JS überspringen (`matchMedia`), Timer nur als Balken ohne Puls.

## 8. Premium-Darstellung (dezent)

Prinzip: Premium ist **Komfort und Anerkennung, kein Vorteil im Wettbewerb**. Siehe RESEARCH-NOTES für die Begründung.

**Optik**
- Einziges Zeichen: kleiner Gold-Punkt/Stern-SVG (12 px) plus Wort "Premium" in `--gold`, Nunito 600, 12 px, kein Pillen-Hintergrund, kein "⭐ PREMIUM"-Großbuchstabenbadge.
- Gesperrte Funktionen sind **sichtbar bedienbar**: ausgegraute Chips mit kleinem Schloss-SVG, kein Überlagerungskasten mit Preis. Klick öffnet einen Modal mit 2 Sätzen und dem Button "Mehr erfahren" (Sekundär) plus "Nicht jetzt".
- Kein Preis auf Spielbildschirmen. Preis nur auf `premium.html`.
- Premium-Spieler: goldener Kopfrahmen (2 px) um den Avatar und Stern hinter dem Namen. Das ist die gesamte Hervorhebung.

**`premium.html`**
- Hero: eine Überschrift, ein Satz, kein "Das ultimative … Erlebnis". Beispiel: "Mehr Auswahl, gleiche Fairness."
- Zwei Spalten "Kostenlos" / "Premium", gleiche Karte, Premium nur mit Gold-Rahmen (kein Verlauf, kein 50-px-Glow, kein "Beliebteste Wahl", das ist bei zwei Plänen unlauter).
- Texte ausschließlich Deutsch (`Climb faster, rank higher` und Ähnliches ersetzen).
- Kündigung klar: "Jederzeit kündbar" und Ort der Kündigung. Preis inkl. MwSt. angeben (rechtlich, Platzhalter für Anbieter im Impressum).
- Keine erfundenen Vorteile ("Premium-Channel", "Early Access"), nur, was umgesetzt ist.

**Was Premium bekommt (vorhandene Funktionen, nicht ändern)**: Kategorien-Filter, Anzeige-Badge, Statistik-Details, Punkteboost. Hinweis zur Fairness an `team-lead`: Der 1,5x-Punkteboost verzerrt Ranglisten. Optik-Lösung ohne Funktionsänderung: im Leaderboard den Boost sichtbar kennzeichnen ("+50 %") oder separat führen. Entscheidung beim Auftraggeber.

**Testhinweise entfernen**: Der Toast "?premium=1 zum Testen" und die URL-Parameter sind Entwickler-Details, Endnutzer sollen nur "Premium ist bald verfügbar" lesen. (Funktion bleibt, nur Text.)

## 9. Pixel-Optik (Assets, ohne Mojang-Material)
- Logo: eigenes SVG, 8x8 oder 5x5 Raster in zwei Grüntönen, `shape-rendering: crispEdges`.
- Rahmen: `border: 2px solid` plus eckiger Eindruck durch Radius 4 px; kein Bild-Rahmen nötig.
- Kopf-Avatar: 8x8-Ausschnitt des Skins skalieren mit `image-rendering: pixelated`.
- Hintergrund: flach `--bg`. Optional ein 8-px-Pixelraster mit 3 % Weiß, falls Auftraggeber Struktur will, nie animiert.

## 10. Mobile-Checkliste für Frontend
`<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">`, `100dvh` statt `100vh`, Safe-Areas, Eingaben ≥ 16 px, kein `overflow-x`, Touch-Ziele ≥ 48 px, `touch-action: manipulation` auf Buzzer/Buttons (kein Doppeltipp-Zoom), kein `:hover`-Zustand als einziger Zustand, Tastatur schiebt die Eingabe nicht aus dem Bild (`visualViewport`). Prüfen bei 360x640, 390x844, 768x1024, 1280x720, 1920x1080.
