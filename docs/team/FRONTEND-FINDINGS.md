# FRONTEND-FINDINGS (frontend)

## Befunde im Ist-Zustand (alle behoben, sofern nicht unter "Offen")
- game.html: Splash-Screen doppelt im Markup und doppelt im CSS (gleiche ID zweimal).
- game.html: `@keyframes slideUp` doppelt definiert, die zweite Variante (translateX(-50%)) verschob `#cat-screen`.
- game.html: `#auth-modal` bekam durch `position: relative` den Overlay-Charakter verloren (schwarzer Kasten statt Vollbild).
- game.html: `font-family` Space Grotesk (nicht geladen) bei Kategorien-Screen, drei Schriftfamilien insgesamt, Google-Fonts-Import (DSGVO).
- game.html: Modus-Karten waren `div onclick` (nicht per Tastatur erreichbar), fünf Akzentfarben, Emoji als Icons.
- game.html: Hintergrund-Emoji-Regen (Canvas, Dauerlauf), Blitz-Timer pulsiert Dauer, Splash blockiert 2,1 s bei jedem Start.
- game.html: Mobile Modus-Karten in 2 Spalten mit 11 px Text; Touch-Ziele < 44 px; Mini-Schriften 0.55 rem.
- game.html: Namen aus Firestore (displayName) unescaped in innerHTML (XSS) -> `escHtml`.
- index.html: Emoji-Regen-Canvas, Radial-Glow, pulsierender Punkt, Zahlenleiste mit falschen Zahlen (648 / 9 Kategorien), `backdrop-filter`.
- index.html: Stats-Leiste lief auf 360/390 px über.
- premium.html: Verläufe, Glows (`box-shadow 0 0 30px`), englische Texte ("Climb faster"), "Beliebteste Wahl", Modal ohne Esc/Fokus.
- multiplayer.html: Live-Scoreboard wurde nie sichtbar (`display:none` im CSS, JS setzt nur `style.display=''`).
- multiplayer.html: Namen/Räume/Antworten unescaped in innerHTML (XSS), Space-Taste kaperte alle Buttons.
- multiplayer.html: Verlaufs-Buttons, Glow-Buzzer mit Dauer-Pulse, Konfetti 80 Teile, Tabs ohne ARIA, Inputs < 16 px.
- Alle Seiten: kein Footer, keine Rechtsseiten, kein Favicon (404).

## Umgesetzt
- Gemeinsame Tokens/Komponenten in `mg.css` (Dark/Light nach DESIGN-BRIEF), lokale Fonts in `fonts/` (Inter, Silkscreen).
- Neu: `impressum.html`, `datenschutz.html` (Platzhalter `[NAME]`, `[ANSCHRIFT]`, `[E-MAIL]`, `[TELEFON optional]`, `[DATUM]`), Footer auf allen Seiten.
- Neu: `mg-skin.js` (Upload + Drag&Drop, 8x8-Kopf, Fehlermeldungen deutsch, Standardkopf, `MGSkin.imgHTML`).
- multiplayer.html: Skin-Upload im Join-Screen, `skin` in create/join, Köpfe in Lobby/Live-Punkte/Ergebnis/Endabrechnung/Podium; Token/Rejoin, `sync_ping`, `answer_invalid`, Snapshot-Events, `connected:false`.
- Socket.io-Client kommt jetzt von `/socket.io/socket.io.js` (kein cdnjs-Request).

## Offen / Hinweise an Lead
- Rechtlich: Wiki-Inhalte sind CC BY-NC-SA (NC = nicht kommerziell). Ein kostenpflichtiges Premium (5 EUR/Monat) auf Basis dieser Fakten ist problematisch. Entscheidung Auftraggeber.
- Icons (Mobs/Items) werden zur Laufzeit von minecraft.wiki geladen (Mojang-Texturen, IP-Übermittlung). Im Datenschutz erwähnt; Alternative: eigene Pixel-Icons oder weglassen.
- Premium wird clientseitig per `?premium=1` bzw. localStorage freigeschaltet (Umgehung trivial). Funktion unverändert gelassen.
- premium.html nennt noch Stripe-Platzhalter-Link (`buy.stripe.com/placeholder`) und Funktionen "Detailstatistiken/Early Access", die Auftraggeber bestätigen muss.
- JS-gerenderte Symbole in game.html bleiben Emoji: Joker-Token, Abzeichen-Icons, Kategorie-Icons (nicht mehr angezeigt außer Joker/Abzeichen). Ersatz durch SVG wäre Schritt 2.
- Light-Theme in game.html nutzt weiter einzelne harte Farben (`.cat-chip`), optisch ok, nicht vollständig auf Tokens.
- Solo-Timer in game.html bleibt Kreis (Brief: Balken), kein Funktionsrisiko.
- Header-Lautstärke-Button ist jetzt ♪ (durchgestrichen = aus).
