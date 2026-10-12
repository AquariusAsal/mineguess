# TEST-REPORT (tester)

Stand: Runde 1 + Nachtest der Fixes. Server: http://localhost:3000 (Supervisor, Neustart per Flag-Datei im Temp-Verzeichnis).
Schweregrad: K kritisch, H hoch, M mittel, N niedrig. Status: offen / gefixt / verifiziert.

## Was getestet wurde
- Browser: echter Chrome (Playwright), Viewports 360x640, 390x844, 768x1024, 1280x720, 1920x1080 auf allen 6 Seiten (Overflow, Touch-Ziele, Eingabegroesse, Konsolenfehler, Footer-Links), Screenshots, Tastatur (Tab-Reihenfolge, Fokus sichtbar, Enter auf Modus-Karten, Fokus Antwortfeld), Offline/Service Worker, interne Links, ausgelieferte Dateien.
- Solo: Endlos/Blitz/Daily/Wettkampf starten, richtige Antwort, Punkte; **alle 518 Fragen** programmatisch geladen, falsch+richtig beantwortet, Ergebnisfenster/Fun Fact geprueft (0 Fehler).
- Antwortpruefung: 31 Einheitenfaelle (Komma/Punkt, Tausender, Einheit im Text, Toleranz, Umlaut/ss, Bindestrich, Artikel) plus Selbsttest aller Fragen (Antwort + Synonyme muessen akzeptiert werden: 0 Fehler).
- Multiplayer (socket.io-Clients, 2-9 Clients): Raum privat/oeffentlich/Passwort/Kategorien, Beitritt, falsches Passwort, Brute-Force-Sperre, Raum voll (8), doppelte/lange/HTML-Namen, Ready-Toggle, gleichzeitiger Buzz (bis 8 Clients), falsche/richtige Antwort, Antwort-Timeout (15 s), kein Buzz (30 s), Disconnect des Buzzers, Reconnect mit Token (Score/Skin bleiben), Token-Missbrauch, Grace-Ablauf (30 s), Leave, Spaetjoiner, 10 Runden + game_over + continue_game, Raum-Cleanup, Rate-Limit, kaputte Payloads (undefined/null/falsche Typen/1 MB), Event-Spam.
- Echte Browser-Sessions parallel (3 Kontexte, 390x844): Skin-Upload, Raum erstellen/beitreten, Bereit, Space-Buzzer, falsche Antwort, Reconnect.
- Skin-Kopf: Upload (txt, SVG als .png, JPEG als .png, 32x32, 400x400/640 KB, 64x32 legacy, transparent, 64x64 mit Hut-Layer) und Server-Validierung (129x129, kein PNG, jpeg-Prefix, SVG-Data-URL, javascript:, http-URL, Quote-Injection, 200 KB, Objekt, Array, abgeschnittenes PNG).
- Rechtsseiten: Vollstaendigkeit, Footer auf allen Seiten, Platzhalter, Abgleich Datenschutz mit tatsaechlichen Datenfluessen im Code.
- Daten: questions.json (518 Fragen) auf Duplikate, Pflichtfelder, Toleranzen, Umlaute, Mojibake; Fakten-Stichproben (Verzauberungs-Maxima, Obsidian-Abbauzeit, Schaf rosa 0,164 %, Pferdesprung 5,3).

## Bugliste (Baseline-ID -> Status)

| ID | Sev | Thema | Owner | Status |
|----|-----|-------|-------|--------|
| B-01 | K | public-N Beitritt crasht Server | backend | verifiziert |
| B-02 | K | null/undefined Payloads crashen Prozess | backend | verifiziert |
| B-03 | K | showResult haengt bei number Items/Blöcke | backend | verifiziert (518/518 Fragen) |
| B-04 | H | XSS ueber Namen/Antworten | backend+frontend | verifiziert (Server bereinigt, Client escaped, kein Dialog ausgeloest) |
| B-05 | H | Kein Reconnect | backend+frontend | verifiziert |
| B-06 | H | Entity-Optionen = Synonyme | backend | verifiziert (8 echte Optionen) |
| B-07..B-09 | H | Raum-ID-Kollision, Geisterraeume/Rate-Limit, Namen | backend | verifiziert |
| B-10 | M | Punkteanzeige doppelt | backend | verifiziert (1.000 / Session 1.000) |
| B-11..B-13 | M | Toleranz, Normalisierung, Komma | backend | verifiziert |
| B-14, B-15 | M | Start haengt, Spaetjoiner ohne Frage | backend | verifiziert |
| B-18 | M | Doppelter Splash | frontend | verifiziert |
| B-19, B-20 | M | Overflow index / multiplayer 360 | frontend | verifiziert |
| B-21..B-23 | M | Duplikate, JSON/game.html, Toleranzen | backend | verifiziert (eine Quelle; 195/473 + 225/591 entfernt) |
| B-24 | N | "225+ Fragen" | frontend | verifiziert |
| B-25 | N | Rechtsseiten fehlen | frontend | verifiziert (existieren, Footer ueberall, Platzhalter markiert) |
| B-26 | N | favicon 404 | frontend | verifiziert (keine Konsolenfehler) |
| B-27 | N | SW stale | backend | verifiziert (v3 network-first, offline ok) |
| B-17 | M | Premium clientseitig per ?premium=1 | lead/auftraggeber | offen (bewusst unveraendert) |
| K-01 | N | ".5" als 5 gewertet | backend | verifiziert |
| K-02 | N | Bidi-/Steuerzeichen in Namen | backend | verifiziert |
| K-03 | N | Server loggt Namen | backend | gefixt (laut Backend) |
| K-04 | N | hasPassword in Raumliste | backend | verifiziert |
| K-05 | N | Dubletten 195/473, 225/591 | backend | verifiziert; Entity-Antwort im Fragetext (56, 58, 59, 448) und 18 "maximales Level"-Fragen bewusst belassen |
| F-01 | M | impressum/datenschutz Overflow durch .ph nowrap | frontend | verifiziert |
| F-02 | N | Antwortfeld ohne Fokus (Desktop) | frontend | verifiziert |
| F-03 | N | Transparenter Skin | frontend | verifiziert |
| F-04 | N | multiplayer offline ohne Hinweis | frontend | verifiziert (Meldung; wirft absichtlich PAGEERR) |
| F-06 | N | datenschutz.html H1 "Datenschutzerklaerung" laeuft bei 360/390 px 428 px breit (Silkscreen) | frontend | verifiziert (kein Overflow auf allen 6 Seiten und 5 Viewports) |

## Bekannte Einschraenkungen / Hinweise an den Lead
1. **Premium** ist per URL `?premium=1`/localStorage frei schaltbar, Stripe-Link ist Platzhalter. Firestore-Security-Rules koennen nicht von hier geprueft werden (users.premium, reports, leaderboard): muessen serverseitig auf eigenes Dokument ohne premium-Feld beschraenken.
2. **CC BY-NC-SA** der Wiki-Inhalte vs. bezahltes Premium: rechtlich klaeren (steht als Platzhalter-Hinweis im Impressum).
3. Mob-/Item-Icons werden per Hotlink von minecraft.wiki geladen (IP-Uebermittlung, Mojang-Bildrechte; im Datenschutz erwaehnt). Headless-Umgebung zeigte teils Zertifikatsfehler fuer diese Hosts (Umgebung, kein Code-Fehler).
4. Platzhalter in Impressum/Datenschutz muessen vom Auftraggeber ausgefuellt werden: [NAME], [ANSCHRIFT], [E-MAIL], [TELEFON], [DATUM], [USt-IdNr.], [Aufsichtsbehoerde], mehrere "[Pruefen: ...]" (AVV/SCC, Stripe, Lizenz, Streitbeilegung). Vor Livegang keine eckigen Klammern mehr im Text.
5. Verbindungsabbruch haelt den Platz im Raum 30 s (Raum voll / Geisterspieler kurz sichtbar als connected:false), Raum wird erst danach geloescht.
6. Payloads > 32 KB trennen den Client (Schutz); UI sendet < 1 KB.
7. `node_modules/` ist im Git getrackt, keine `.gitignore` (nur gemeldet, nicht angefasst).
8. Nicht getestet: echte Google-Anmeldung/Firestore (kein Konto), Safari/iOS-Zoom-Verhalten (nur Chrome), Zahlungsablauf, Last > 10 gleichzeitige Raeume.
9. Viewport-Tests per Playwright-Emulation (Chrome); echtes Geraet nicht verfuegbar.

---

# Runde 2 (Auftraggeber-Nachtest)

## 1. Gastmodus / Endlos / Blitz / Daily / Joker
- Saubere Session (kein localStorage), echter Klickweg Landing -> game.html -> "Als Gast spielen" -> Modus-Karte: Endlos, Blitz, Daily, Wettkampf starten, Frage sichtbar, 4 Folgefragen inkl. Joker/Tipp (2 Joker, danach Punktabzug) korrekt. 0 Konsolen-/Netzwerkfehler.
- Varianten ohne Fehler: Firebase-Auth verzoegert (1,5 s / 3 s) mit sofortigem Gast-Klick (Race), Firebase-Domains geblockt (FIREBASE_ENABLED=false, Modal erscheint nicht, Modi laufen), alter Service Worker + neuer Cache.
- **Reproduzierte Ursache auf HEAD:** blockierter Browser-Speicher (Safari privat, In-App-Browser, Cookies aus): `localStorage`-Zugriff wirft SecurityError, Gast-Start und Modi starten nicht (Frage = null). Jetzt gefixt (RAM-Ersatz), verifiziert fuer alle 4 Modi. Auth-Race (Callback oeffnet Modal nach Gast-Klick) lief auf HEAD bei meinen Timings nicht auf, Fix von frontend ist zusaetzlich drin.
- **Nicht testbar:** echte Google-Anmeldung/Firestore (kein Konto). Simuliert: FIREBASE_ENABLED=false, Gast-Flag, geblockte Firebase-Hosts. Angemeldeter Zustand bleibt ungeprueft.
- Neu gefunden: multiplayer.html bricht bei blockiertem Speicher (T-01, offen).

## 2. Minecraft-Texturen (assets/mc)
| Pruefung | Ergebnis |
|---|---|
| 404 im Netzwerk | keine (231 Requests, 0 >= 400, 22 Asset-Requests) |
| Externe Bildrequests | **FAIL**: minecraft.wiki-Icon im Ergebnisbereich (Entity-Antworten) in allen Modi (T-02). Sonst nur gstatic/firestore (Firebase) |
| image-rendering | CSS-/IMG-Texturen pixelated; **FAIL** Footer-Textur (auto, unscharf, T-03) |
| Layout-Spruenge | index Desktop CLS 0,26, game Ergebnis bis 0,6 (T-04); Icons selbst feste Groesse |
| Kontrast ueber Texturen (WCAG AA) | ok: 8 Screens x 2 Viewports, 10.-Perzentil-Hintergrund, 0 Verstoesse (ein Treffer war ein ausgeblendeter Menuepunkt) |
| Gewicht | Texturen gesamt 228 KB (155 Dateien, max 1,9 KB). Aber logo-green.png 2,4 MB + logo-transparent.png 319 KB: game.html 3,9 MB, index 733 KB (T-06) |
| Offline/SW | Seiten, Fragen, JS/CSS/Fonts offline ok; Texturen nur nach Laufzeit-Cache, nicht vorgecacht -> kaputte Bilder (T-05) |
| Recht (Hinweis, nicht Test) | BRIEF Regel 8 verbot offizielle Mojang-Texturen. Aenderung auf Wunsch des Auftraggebers; Verwendung in einem bezahlten Premium prueft der Auftraggeber (Mojang Usage Guidelines), Impressum/Datenschutz nennen Quelle |

## 3. Spielerprofil / Skin-Kopf
Getestet 360x640 und 1280x720 als Gast: Landing-Chip (40x44) und Button "Mein Spielerkopf" oeffnen den Dialog; Datei persistiert nach Reload (Chip zeigt Kopf + Name); Name wird im Multiplayer vorbelegt; Kopf in der Lobby sichtbar und fuer Mitspieler per Socket (182 B PNG); Entfernen setzt Standardkopf; Fehlerfaelle: .txt, SVG/JPEG als .png, 32x32, 640 KB, transparenter Skin, Drop einer Textdatei -> deutsche Fehlermeldungen, nichts gespeichert; Esc schliesst; Dialog passt in 360x640.
Offen: Profil im Spielmenue unter dem Falz (T-08), kein Fokus-Trap/Fokusring am Datei-Button (T-07).

## 4. Emoji-/Symbol-Check
- Dateien (index, game, multiplayer, premium, impressum, datenschutz, mg-icons.js, mg-skin.js, answer-check.js, mg.css, questions.json, sw.js, server.js): **0 Emoji** (U+1F000-1FAFF, U+2600-27BF, U+2300-23FF, U+2190-21FF, Extended_Pictographic, FE0F). Rest: `×` (U+00D7) 10x in game.html/mg-skin.js/datenschutz.html, `→` 8x nur in Code-Kommentaren/Konsolenlogs (nicht gerendert).
- Gerendertes DOM (390 und 1280 px; index, premium + Checkout-Modal, impressum, datenschutz, multiplayer Join/Tabs/Lobby, game Auth/Menue/Leaderboard/Abzeichen/Kategorien, alle 4 Modi: Countdown, Frage number+entity, Tipp, Ergebnis richtig/verloren, Melden-Modal; Title/alt/aria-label/placeholder/::before/::after): **0 Emoji, 0 ★ ✓ ✗ ⏱ →**. Sichtbar nur `×` in Badge-Texten ("20× Mobs ..."), "64×64"/"8×8" und Streak-Badge "×1,5" (T-09; bei streng "null Treffer": durch x/mal ersetzen).
- Nicht per Skript abgedeckt: Siegerpodest/Endabrechnung Multiplayer (Dateien enthalten dort keine Symbole) und Wettkampf-Ende-Screen.

## Offene Punkte Runde 2
| ID | Sev | Thema | Owner | Status |
|----|-----|-------|-------|--------|
| T-01 | H | multiplayer.html bricht bei blockiertem Storage | frontend | verifiziert |
| T-02 | M | minecraft.wiki-Icon-Request im Ergebnis | frontend | verifiziert |
| T-03 | M | Footer-Textur nicht pixelated | frontend | verifiziert |
| T-04 | M | CLS index 0,26 / game bis 0,6 | frontend | index verifiziert (CLS 0); game Ergebnis-Sprung 0,06 (display:none von #input-area) optional, kein Blocker |
| T-05 | M | assets/mc nicht im SW vorgecacht | backend | verifiziert |
| T-06 | M | Logos 2,4 MB / 319 KB | frontend/Lead | verifiziert |
| T-07 | N | Dialog ohne Fokus-Trap / Fokusring | frontend | verifiziert |
| T-08 | N | Profil im Spielmenue unter dem Falz | frontend | verifiziert |
| T-09 | N | `×` als Symbol | frontend/backend | verifiziert |
| G-01 | H | Gast-Start bei blockiertem localStorage (HEAD) | backend | verifiziert gefixt |

## Nachtest Runde 2 (alle Fixes)
- Gast Endlos/Blitz/Daily/Wettkampf, blockierter Speicher auf allen 5 Seiten: 0 Fehler, Multiplayer-Lobby startet.
- Netzwerk: 0 x 4xx, keine externen Bildrequests (nur gstatic/Firebase-Skripte), Gewicht index 117 KB, game 944 KB, multiplayer 325 KB.
- Offline: 155/155 Texturen im Cache (sw v5), keine kaputten Bilder.
- Emoji/Symbole: 0 in allen Dateien und gerendertem DOM (nur "->" Pfeil in 2 Code-Kommentaren in game.html und Konsolenlogs in server.js, nicht sichtbar).
- Kontrast AA ueber Texturen: 0 Verstoesse; Overflow 0; 518/518 Fragen in Solo loesbar; Profil/Skin 360 und 1280 ok inkl. Fokus-Trap.
