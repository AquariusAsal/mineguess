# LAYOUT-RESEARCH (forscher)

## 1. GeoGuessr: was belegt ist, was nicht
Belegt (WebFetch der /de-Startseite; Spielscreen aus Drittbeschreibungen: StrategyWiki, Arkadium, TapSmart):
- Startseite: schlanke Navigationsleiste (Logo links, wenige Textlinks, Sprachwahl, "Einloggen" und "Registrieren" rechts). Hero mit **einer** Überschrift und direkt daneben der Einstieg (Login/Registrierung per Google, Apple, Facebook, E-Mail), Plattform-Hinweis. Danach **thematische Abschnitte**, je ein Modus/Angebot (allein erkunden, mit Freunden, gegen andere mit Abzeichen und Turnieren, Wettbewerb, Organisationen, Kooperationen), Social Proof als Zahl plus Store-Bewertung, FAQ als Aufklappliste, mehrspaltiger Footer. Bilder sind aus Hintergrund- und Vordergrundebene geschichtet.
- Spielscreen: Vollbild-Szene, HUD nur als kleine Leisten am Rand: Map-Name, Runde x/5, Punkte, Restzeit, Zoom. Rate-Karte unten rechts, die sich bei Hover/Tap vergrößert; ein grüner "Guess"-Button, erst nach gesetztem Pin; bei Zeitablauf wird der aktuelle Stand automatisch abgegeben. Ergebnis: Karte mit richtigem Ort, eigenem Tipp, Linie und Distanz, danach Punkte. Rundenende mit "Zusammenfassung ansehen", Endscore und "Nochmal".

**Lücke (ehrlich):** Typografie, exakte Farben, Animationen und Mobile-Verhalten waren nicht abrufbar (kein CSS, keine Screenshots). Aus allgemeinem Wissen, nicht verifiziert: dunkle blau-violette Flächen, gelbe/grüne Akzente, kräftige Grotesk-Schrift, viele Illustrationsebenen. Nichts davon wird übernommen, nur die Struktur.

## 2. Übertragbare Muster für MineGuess

| Muster | Umsetzung |
|---|---|
| Hero mit sofortigem Einstieg statt Marketing | index.html: links Überschrift + ein Satz, daneben/darunter "Jetzt spielen" (Gast ohne Login), Login als zweite Aktion |
| Modi als Abschnitte statt Kartenwand | pro Modus ein Band (Bild abwechselnd links/rechts, Titel, 1 Satz, Button), max. 4 Bänder: Solo/Ranked, Daily, Blitz, Multiplayer |
| Social Proof ehrlich | nur echte Zahl (gespielte Runden) oder weglassen |
| FAQ als Akkordeon | 5 Fragen (Kosten, Gast, Premium, Datenschutz, Fehler melden), `<details>` |
| HUD nur am Rand | game.html: obere Leiste 48 px (Modus, Runde x/10, Punkte, Timer rechts), Szene/Frage mittig, Eingabe unten |
| Guess-Button erst bei gültiger Eingabe aktiv | Senden deaktiviert bei leerem Feld (passt zu A1) |
| Automatische Abgabe bei Zeitablauf | Timeout zählt als falsch, Ergebnis zeigt trotzdem die Lösung |
| Ergebnis = Vergleich Tipp vs. richtig mit Differenz | Zahlenstrahl mit Tipp-Marke und Lösungs-Marke, Abstand als "±8" |
| Rundenende mit Zusammenfassung | Endscreen: Liste aller Fragen (richtig/falsch, Tipp, Lösung, ±MMR), "Nochmal" primär |

## 3. Wireframes (Beschreibung)

### index.html
**Mobile 360:** Nav 56 px (Logo, "Anmelden"). Hero: Pixel-H1 2 Zeilen (20 px), 1 Satz (16 px), Button "Spielen" (48 px, volle Breite), Textlink "Als Gast". Danach 3 Bänder (je ca. 280 px): Szenenbild/Texturkachel oben, Titel, Satz, Link. FAQ (5 Zeilen à 56 px). Footer einspaltig.
**Desktop 1280:** Nav 64 px. Hero zweispaltig 60/40: links Text und Buttons, rechts WebGL-Szene (Tisch mit Figuren, 420 px hoch). Bänder 2-spaltig abwechselnd, 96 px Abstand, max. Breite 1080 px. Footer 4 Spalten (Spiel, Rechtliches, Credits, Kontakt).

### game.html
**Mobile:** Kopfleiste 48 px (links Modus-Icon-Textur + Name, Mitte "3/10", rechts Timer-Zahl, 6-px-Balken darunter). Szene (Reporter + Spieler) höchstens 35 % der Höhe. Frage-Karte (20 px). Eingabe + Senden fix unten mit Safe-Area. Ergebnis: Karte schiebt von unten (200 ms), zeigt Lösung, ±Punkte, Fun-Fact (1 Zeile), "Weiter" primär.
**Desktop:** Kopfleiste 56 px; zweispaltig: links Szene (60 %), rechts Frage + Eingabe + Verlauf (40 %). Ergebnis ersetzt die Eingabe in der rechten Spalte, die Szene reagiert.

## 4. Abstände, Komponenten, Animationen
- Raster 8 px, Sektionsabstand 96 (Desktop) / 56 (Mobile), Karten-Padding 24/16, Inhaltsbreite 1080 px.
- Bänder: Bildfläche 4:3, Radius 4 px, 2 px Rahmen, keine Schatten.
- Scroll-Reveal: pro Band einmal, `opacity 0→1`, `translateY(12→0)`, 240 ms, nur mit `IntersectionObserver` und ohne reduced-motion.
- Übergang Start zu Spiel: 200 ms Fade der Landing-Inhalte.
- Ergebnis-Zahl zählt in 400 ms hoch, Tipp-Marke gleitet in 250 ms zur Lösungs-Marke.
- `prefers-reduced-motion`: sofort, ohne Übergänge.
- Keine GeoGuessr-Texte, -Logos, -Bilder oder -Farben übernehmen.

# Hintergrundmedien

## A. YouTube "No Copyright"-Videos: nicht empfehlen
1. "No Copyright" ist kein Rechtsstatus. Uploader können sich irren oder falsch behaupten, Content-ID kann später greifen, Lizenzen sind oft Standard-YouTube-Lizenz oder CC-BY mit Pflichtangabe.
2. Download aus YouTube verstößt gegen die Nutzungsbedingungen (nur Player/Embed erlaubt).
3. Minecraft-Aufnahmen anderer enthalten Mojang-Assets, evtl. fremde Musik/Skins; die Rechte liegen nicht beim Uploader.
4. Ein YouTube-iframe lädt Google-Inhalte (IP, Storage): Datenschutzhinweis/Consent nötig, als Hintergrund unpraktisch.
5. Stabilität: Embeds sind blockierbar, Mobile-Autoplay eingeschränkt.

## B. Stock-Quellen (Lizenztexte am 13.10.2026 abgerufen)
| Quelle | Lizenz (Kern) | Namensnennung | Einschränkungen | Link |
|---|---|---|---|---|
| Pexels | kostenlos, auch kommerziell, Bearbeitung erlaubt | nicht nötig, gern gesehen | keine erkennbaren Personen in schlechtem Licht, nicht als Marke/Firmenname, unveränderte Kopien nicht verkaufen, nicht auf anderen Stock-Seiten weiterverbreiten, kein impliziertes Endorsement | https://www.pexels.com/license/ |
| Pixabay | Pixabay-Inhaltslizenz, kostenlos, auch kommerziell, Bearbeitung erlaubt | nicht nötig | nicht unverändert verkaufen/verbreiten, erkennbare Marken/Logos nicht kommerziell auf Produkten, nicht als Marke, Rechte Dritter liegen beim Nutzer | https://pixabay.com/service/license-summary/ |
| Coverr | kostenlose Videos, kommerziell, unwiderruflich, weltweit | nicht nötig | kein Weiterverkauf/Dienst-Bundling, kein KI-Training, keine Marken/Logos, keine Releases für Personen/Orte, kein Konkurrenzdienst | https://coverr.co/license |

Hotlinking: in allen drei Lizenztexten **keine Aussage**. Empfehlung: nicht hotlinken (Datenschutz, Verfügbarkeit), Datei selbst hosten, Quelle freiwillig in den Credits nennen und Lizenz-URL samt Abrufdatum je Datei in einer Credits-Notiz festhalten. Auswahl nur neutral (Wald, Wolken, Wasser; keine Personen, keine Marken, keine Minecraft-Nachbauten). Lizenzen können sich ändern (Coverr behält sich Änderungen vor).

## C. Eigene Aufnahmen des Auftraggebers
Eigenes Minecraft-Gameplay/Screenshots sind nach Mojangs Richtlinien für Videos/Screenshots meist für nicht-kommerzielle und redaktionelle Nutzung mit Disclaimer erlaubt; im Kontext einer bezahlten Premium-Funktion bleibt es eine Grauzone (siehe BUZZER-SCENE-SPEC §11). Ohne Hintergrundmusik, ohne fremde Skins/Shader/Texturpakete aufnehmen. Vorteil: thematisch passend, keine Fremdlizenz.

## D. Prozedural (empfohlen)
Drehendes Blockpanorama in der vorhandenen WebGL-Szene (`mg-scene.js`): Würfelraster aus eigenen Texturen (`assets/mc/block/`), langsame Kamerafahrt (ca. 0,5°/s), Nebel, Tag/Nacht-Tönung per Uniform. Kein Fremdmaterial, keine zusätzliche Datenmenge (Texturen schon geladen), skaliert auf jedes Gerät. `prefers-reduced-motion` = Standbild; Mobile 30 fps und halbe Auflösung; bei nicht sichtbarem Tab pausiert.

## E. Empfehlung
1. Standard: **D** für Landing und Menü.
2. Optional **B** nur als Standbild (Poster, WebP < 150 KB), z. B. als Sektionsbild oder Ladeplatzhalter.
3. Falls Video gewünscht: höchstens 8 s Loop, 720p, ≤ 2 MB (WebM VP9 plus MP4 H.264), `muted playsinline loop`, `poster`, nie mit Ton, bei `prefers-reduced-motion` und `navigator.connection.saveData` nur Poster, lazy laden.
4. A nicht verwenden. C nur, wenn der Auftraggeber eigenes Material liefert.
