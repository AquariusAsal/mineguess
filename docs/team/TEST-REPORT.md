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

---

# Runde 3

## Baseline A1-A6 (reproduziert im Stand vor den Runde-3-Lieferungen, Commit 7e63bfe)

| # | Ergebnis | Reproduktion |
|---|----------|--------------|
| A1 | **Reproduziert** (Endlos, Blitz, Daily; Wettkampf nicht: dort laeuft der Speed-Timer weiter). Jeder "Antworten"-Klick/Enter mit leerer oder nur aus Leerzeichen bestehender Eingabe setzt den Frage-Timer auf den Startwert zurueck (40 s Zahl / 70 s Entity). Wiederholtes Absenden haelt die Zeit dauerhaft bei 40 s, Versuch wird nicht verbraucht = unbegrenzte Zeit. Auch der Pfad "ungueltige Zahl" (`fb.invalid`) ruft `startTimer()`. | game.html `submitGuess()`: `clearInterval(timerInterval)` dann `if (!val) { startTimer(); ... }` (Z.~2198/2201; `startTimer` setzt `timerLeft = TIMER_SECONDS`). Test: Modus starten, 6 s warten (timerLeft 33), leer absenden -> 40; 6x leer in 3 s -> bleibt 40. Skript `a1.js`. **Multiplayer-Server** ist ok: 5 leere Antworten verlaengern den 15-s-Timer nicht (12 -> 9 s), `answer_invalid` x5. |
| A2 | Baseline: falsche Antwort gibt 0 Punkte Abzug (Score bleibt 0), `answer_broadcast` ohne Strafe-Feld. | `a2.js` |
| A3 | **Ursache gefunden:** Im Wettkampf-Endscreen (`#comp-end`, z-index 200) oeffnet `.btn-ce-lb` zwar `#lb-modal`, aber das Modal lag in der aelteren Fassung (ae61d6c) **hinter** dem Endscreen (elementFromPoint ueber der Modal-Karte = Endscreen, onTop:false) -> Button wirkt tot. Im aktuellen Stand z-index 400, onTop ok. Das Menue-Leaderboard lieferte schon vorher Daten (Firestore-Lesen fuer Gaeste erlaubt, Liste "Jannes Comanescu 12.073 Pkt." sichtbar). Angemeldete Schreibzugriffe (`submitLeaderboard`) koennen nicht getestet werden (kein Konto) -> Firestore-Regeln siehe FIRESTORE-RULES.md. Leere Online-Liste bei Gast: Hinweis + lokaler Fallback ("Nur auf diesem Geraet", localStorage `mg_lb_local`) funktioniert. | `a3.js`, `a3old.js` |
| A4 | **Reproduziert:** alle 29 Haltbarkeit-Fragen (ids 153, 159, 343-368, 666) haben `tolerance: 0`: 1560 statt 1561 ist falsch. Weitere "unmerkbare" Zahlen mit Toleranz 0 und Wert >= 100 (HEAD, 22 ausser Haltbarkeit): ids 10 (Wither 300), 11, 13, 14, 15, 29 (12000 XP), 45, 52, 54, 65, 67, 92, 313 (Obsidian-Sprengwiderstand 1200), 463 (1395), 481, 485, 489, 495 (5345), 578, 681, 704 (24000 Ticks). | Datenanalyse questions.json |
| A5 | Bestaetigt: im Code keine Werbung (grep adsbygoogle/doubleclick/adsense/Banner: 0 Treffer); "Werbefrei" steht vor der Lieferung weder in premium.html noch in der Datenschutzerklaerung. | grep |
| A6 | Der geforderte Footer-Satz ("Nicht von Mojang oder Microsoft genehmigt ... © Mojang Studios / Microsoft") fehlt vor der Lieferung auf allen 6 Seiten (nur Kurzfassung "Nicht von Mojang oder Microsoft."). | grep |

Hinweise Runde 3: Teammates sind nicht erreichbar; Findings stehen hier. Server laeuft (Supervisor), Neustart via restart.flag.

## Verifikation A1-A6 (Stand sw v8, Server neu gestartet)

| # | Ergebnis | Nachweis |
|---|----------|----------|
| A1 | **verifiziert.** Leere/Leerzeichen-Eingabe laesst den Timer unveraendert weiterlaufen (Endlos 63 -> 63 -> 60 nach 6 Leer-Submits in 3 s, Blitz/Daily/Wettkampf gleich), kein Versuch verbraucht, nur Toast. Server: 5 leere `submit_answer` verlaengern den 15-s-Timer nicht (12 -> 9), `answer_invalid` ohne Strafe. | a1.js, a2.js |
| A2 | **verifiziert.** Falsch: -50 (`delta -50`, `penalty 50`, Score 200 -> 150); bei Score 0 bleibt 0 (delta 0); 4 Fehlversuche 200 -> 0, nie < 0. Timeout nach Buzz: genau eine Strafe (`answer_timeout`, delta -50). Keine Doppel-Strafe: 5 weitere `submit_answer` nach falscher Antwort wirkungslos, kein nachtraeglicher Timeout nach falscher Antwort (17 s abgewartet), Disconnect des Buzzer-Halters = 1 Strafe. `room_state`-Scores alle >= 0. Hinweis: der Teilclamp (Score 20 -> delta -20) ist nur im Code geprueft (`Math.max(0, ...)`), da Scores in 50er-Schritten fallen. | mp5.js, mp6.js |
| A3 | **verifiziert (Gast).** Leaderboard-Modal liegt jetzt ueber Menue, Wettkampf- und Blitz-Endscreen (onTop true; der Daily-Endscreen hat keinen Leaderboard-Button). Gast sieht Online-Liste (Lesen erlaubt) plus Hinweis "Als Gast kannst du dich nicht eintragen" und lokalen Block "Nur auf diesem Geraet gespeichert" (mg_lb_local, Wettkampf-Ergebnis wird eingetragen). Firestore-Hosts geblockt: Modal zeigt nach ca. 1 s Fehlertext + lokale Liste (nicht leer). **Nicht testbar:** angemeldeter Schreibzugriff/Firestore-Regeln (kein Konto) -> docs/team/FIRESTORE-RULES.md muss der Auftraggeber in der Konsole pruefen. Beobachtung (niedrig): bei bereits offener Firestore-Verbindung, die danach geblockt wurde, blieb "Lade..." einmal >= 4 s stehen (nicht reproduzierbar; Timeout/Fallback nach ca. 6 s wuerde das absichern). | a3.js, a3b.js, a3c.js |
| A4 | **verifiziert.** Alle 29 Haltbarkeits-Fragen (+ 15 Sprengwiderstaende, XP 29/463/495, Y-Level) mit `tolerancePct`/`toleranceMin`; 29/29 Grenzfaelle ok (Diamantspitzhacke 1561: 1405..1717 richtig, 1400 falsch; Goldschwert 32: 27..37 richtig, 38/26 falsch). Solo (`MGAnswer`) und Server (`answer-check.js`) identisch. Noch exakt (Entscheidung Lead, steht in BACKEND-FINDINGS): ids 10, 11, 13, 14, 15 (HP), 45, 52, 54 (Dauer s), 65, 67, 92, 481, 485, 489, 578, 681, 704. | answer-check Selbsttest |
| A5 | **verifiziert.** premium.html: "Werbefrei" in der Vorteilsliste; Datenschutz: Zeile "keine Werbung". Kein Werbecode im Repo (grep adsbygoogle/doubleclick/adsense: 0). | grep |
| A6 | **verifiziert.** Footer-Satz ("Nicht offizielles Minecraft-Produkt. Nicht von Mojang oder Microsoft genehmigt ... Minecraft-Texturen und -Namen (c) Mojang Studios / Microsoft.") auf allen 6 Seiten, Impressum 2x, Credits mit Wiki-Quelle CC BY-NC-SA. | grep, DOM |

## B: Buzzer-Szene (mg-scene.js, WebGL)

Testaufbau: 4 echte Browser-Sessions (Desktop 1280x720, Mobile 390x844 und 360x640 mit Touch/isMobile, Desktop 1024x768 mit `prefers-reduced-motion: reduce`) plus 4 Socket-Clients = **8 Spieler**; Skins: wide ari.png, slim alex.png, 64x32, eigener 64x64, 4 Bots mit assets-Skins.

| Pruefung | Ergebnis |
|---|---|
| Charakter-Wahl Gast (Erststart) | Dialog "Waehle deine Figur: Steve oder Alex" erscheint beim ersten Multiplayer-Aufruf, Auswahl persistiert (`mg_character`), nach Reload kein erneuter Dialog, Profil-Vorschau zeigt 3D-Figur. Account-Erstkontakt (Google) nicht testbar. |
| Szene rendert (4 Sessions) | ok: Tisch, Buzzer, 8 Figuren, Namensschilder, kein Overflow; Szene 596x335 (Desktop), 326x245 (390), 296x222 (360) |
| Buzz | Touch-Tap auf `#buzzer-btn` (Mobile) und Leertaste (Desktop) loesen Buzz aus; alle Clients erhalten `buzzed`, Figur drueckt Buzzer, Nachdenk-Blase "..." bei allen |
| Sprechblase | "Die Antwort ist 12!" (falsch) bei allen 4 Clients, `#scene-live` (aria-live) "Ben: Die Antwort ist 12! Falsch."; Zahl mit Einheit "Die Antwort ist 4 Stoecke!"; Text per textContent (HTML-Antwort/Name erzeugt 0 Elemente, 0 Dialoge); Server kuerzt auf 40 Zeichen und entfernt `<>"&` |
| Reconnect mitten in der Szene | Trennen/Verbinden waehrend Nachdenken: `joined` rejoined, `scene`-Snapshot, 8 Figuren + Nachdenk-Blase wiederhergestellt; Mitspieler erhalten `player_id_changed` |
| Spaeteinsteiger | `scene`-Snapshot mit buzzedId/typingId/timerLeft |
| Performance | 8 Figuren, Mobile 390 mit CPU 4x gedrosselt: 56,5 fps (worst frame 33 ms); Desktop 60 fps; reduced-motion 60 fps (rAF) |
| prefers-reduced-motion | `MGScene.reducedMotion=true`, Szene statisch (zwei Screenshots im Abstand 1,5 s identisch), Sprechblase bleibt; normale Szene animiert (Idle) |
| Kein WebGL | `getContext('webgl')` gesperrt: Fallback-Kopfreihe `.mg-fallback` (4 Figuren), Sprechblasen "..." und "Die Antwort ist 4 Stoecke!" funktionieren, 0 Fehler |
| Skins | 18 Standard-Skins (wide/slim: steve, alex, ari, efe, kai, makena, noor, sunny, zuri) korrekt (Arme 4/3 px, Overlay-Schicht); 64x32 legacy gespiegelt ok; Overlay-only, helle/dunkle Skins ok; ungueltige Skins (SVG, kaputtes PNG, javascript:, 30 KB, null, HTML) -> Standardfigur ohne Fehler; Server verwirft 129x129, 64x128 und > 16 KB |
| Tastatur | Buzzer-Button fokussierbar (Label "BUZZ"), Space buzzt, Antwortfeld erhaelt nach Buzz automatisch Fokus, Enter sendet |
| Konsole/Netzwerk | 0 Fehler, 0 404, 0 externe Bildrequests |

### Neue Befunde Runde 3

| ID | Sev | Befund | Repro / Hinweis | Owner | Status |
|----|-----|--------|-----------------|-------|--------|
| R3-01 | H | **game.html: horizontaler Scroll im Spielscreen** bei Breiten 320 (12 px), 390 (39 px), 393 (36), 412 (17), 414 (15), 600 (46). `.header-stats` (Chip + Button "Rangliste" `#btn-leaderboard` + weitere) bricht nicht um, rechter Rand 429 px bei 390. Menuescreen ok. Betrifft iPhone 12-15. | Chrome 390x844, game.html, Gast, Modus starten, scrollWidth 429 > 390 (ov2.js, ov3.js) | frontend | offen |
| R3-02 | M | 8 Spieler: Figuren ueberlappen stark, Namensschilder ueberdecken sich ("Ben (du)" von "Cyimg src=..." verdeckt), auf Mobile 390 ist das unterste Schild ("Bot3") am Canvasrand abgeschnitten; Szene auf 390 nur 326x245. Bei 2-4 Spielern gut lesbar. Vorschlag: bei > 5 Spielern kleinere Figuren/zweite Reihe, Schilder nur fuer aktive Figur, Canvas auf Mobile hoeher (>= 300). | shots/scene-answer-desktop.png, scene-buzzed-mobile.png | frontend | offen |
| R3-03 | N | `MG_isFull`: Skins mit data-URL <= 600 Zeichen (PNG < ca. 450 Byte, sehr flache Skins) werden stillschweigend durch Steve/Alex ersetzt. | mg-scene.js Z.456 | frontend | offen |
| R3-04 | N | Komplett transparenter Skin (64x64 alpha 0) ergibt unsichtbare Figur (nur Namensschild). Vorschlag: bei < 5 % opaken Pixeln Standardfigur. | shots/skin1-montage.png | frontend | offen |
| R3-05 | N | Nur im Test mit eigenem Container ohne vorgeladene Texturen blieb der erste Frame leer (kein Tisch), bis ein weiteres Scene-Objekt lief; echter Spielfluss rendert nach <= 4 s. Vorsorglich `needsRender=true` nach Laden der Tisch-/Buzzer-Texturen. | skinbisect.js | frontend | offen |
| R3-06 | N | Skin-PNG-Limit 16 KB: unkomprimierbare 64x64-Skins (16,5 KB) werden vom Server still verworfen (Standardfigur). UI sollte beim Upload > 12 KB neu kodieren (canvas.toBlob) oder warnen. | mp5.js | frontend/backend | offen |
| R3-07 | N | CLS im Spielscreen 0,10-0,13 beim Modusstart, bis 0,6 nach 6 Fehlversuchen im Endlos (Eingabebereich/Hint verschiebt sich, `#input-area` display:none). | walk.js | frontend | offen |
| R3-08 | I | Charakter-Wahl-Dialog kommt bei blockiertem localStorage bei jedem Besuch erneut (nichts speicherbar); "Fertig" schliesst, Seite laeuft. Akzeptabel. | ls2.js | - | akzeptiert |
| R3-09 | I | Das Zeichen (c) (U+00A9) steht im geforderten Footer auf allen Seiten und wird vom Symbol-Scan gemeldet; gewollt. "->" nur noch in Code-Kommentaren/Konsolenlogs. | emoji_files.js | Lead | akzeptiert |

## Regression Runde 3
- Solo: 518/518 Fragen programmatisch geloest, 4 Modi laufen, Punkte 1.000 = Session 1.000; Premium/Impressum/Datenschutz laden, 0 Konsolenfehler; Netzwerk 249 Requests, 0 >= 400, extern nur gstatic/firestore; Gewicht index 160 KB, game 992 KB, multiplayer 378 KB.
- Blockierter localStorage/sessionStorage: alle 5 Seiten ok, Multiplayer-Lobby startet.
- Kontrast AA ueber Texturen: 0 Verstoesse (Treffer nur versteckter Menuepunkt / hinter Modal gemessene Texte).
- Emoji/Symbole: 0 Emoji; Symbole nur (c) im Footer (gefordert) und "->" in Code-Kommentaren.
- Offline: SW cached alle 155 Texturen, Seiten/Fragen/JS offline ok.
- Bekannt/unveraendert: Premium per ?premium=1 umgehbar, Platzhalter in Impressum/Datenschutz, Google-Login/Firestore nicht testbar.

## Freigabe Runde 3
Alle A1-A6 verifiziert, B funktional und performant. **Offener Blocker vor Freigabe: R3-01** (horizontaler Scroll im Spielscreen bei 390/393 px). R3-02 (8-Spieler-Ueberlappung) empfohlen. Rest niedrig.


## Nachtest Runde 3b (nach Frontend-Fixes R3-01..R3-07)

Overflow-Matrix (scrollWidth - clientWidth in px, Gast, Chrome): Viewports 320/360/390/393/412/414/600/768/1280 x Login, Menue, Spielscreen, "verloren"-Ergebnis, Wettkampf-Ende, Blitz-Ende, Daily-Ende: **alle 0**. Leaderboard-Button erreichbar und Modal oben: Menue (alle 9 Breiten), Wettkampf-Ende, Blitz-Ende (alle 9 Breiten); Daily-Ende hat konstruktionsbedingt keinen Leaderboard-Button.

| ID | Status | Ergebnis |
|----|--------|----------|
| R3-01 | **verifiziert** | Spielscreen 0 px Overflow in allen 9 Breiten |
| R3-02 | **teilweise** | 8 Spieler: 2 Reihen, Schilder ueberlappen nicht (0 Ueberlappungen, 0 abgeschnitten bei 320/390/768/1280); aber siehe R3-10 und R3-11 |
| R3-03..R3-06 | verifiziert (Skin-Hinweise/Transparenz laut Frontend; transparenter Skin wird abgelehnt, Standardfigur bei ungueltig) |
| R3-07 | **teilweise** | Desktop CLS 0,03-0,07 ok; Mobile 390/320 im Multiplayer-Spielscreen 0,10-0,17 (Grenze "gut" 0,1) |

### Neue Befunde 3b
| ID | Sev | Befund | Repro | Owner | Status |
|----|-----|--------|-------|-------|--------|
| R3-10 | M | Sprechblase wird bei langen Antworten (bis 40 Zeichen, z. B. "Die Antwort ist 6 Goldbarren + 1 Stock + 1 Redstone!") am Szenenrand abgeschnitten: bei Figuren am linken/rechten Rand ragt die Blase aus dem Canvas (390x844 n=8 und n=5, 320x640). Blase sollte horizontal in den Szenencontainer geklemmt werden (und Text umbrechen). | mp8.js, shots/r3b-390-8.png | frontend | offen |
| R3-11 | M | Mobile-Schilder bei 6+ Spielern sind Initialen und bei Standardnamen nicht eindeutig: "Spieler1".."Spieler7" werden alle zu "SP" -> Figuren nicht unterscheidbar. Vorschlag: Initialen + laufende Nummer / erste 2-3 Zeichen, bei Kollision durchnummerieren. | shots/r3b-390-8.png | frontend | offen |
| R3-12 | M | multiplayer.html bei **320 px**: horizontaler Overflow 27 px schon im Join-Screen (Header, Chip + Beta + Solo). (Bei 360+ ok.) | mp8.js 320x640 | frontend | offen |
| R3-13 | N | Mobile, 8 Spieler: Live-Punkte-Liste (8 Zeilen, ca. 400 px) steht vor Frage und Szene; auf 390x844 beginnt die Szene erst bei y ca. 720, der Buzzer liegt unter dem Falz. Vorschlag: Liste auf Mobile einklappen/kompakt (2 Spalten) oder unter die Szene. | shots/r3b-390-8.png | frontend | offen |

## Regression 3b
Solo 518/518 Fragen, 4 Modi, A1 (Timer 33 -> 33 -> 30 bei leeren Submits) ok; Multiplayer-Server-Suite mp5 (A2 -50/Score >= 0, keine Doppelstrafe, Szenen-Events, Skin-Validierung) 29/29 PASS; Konsolenfehler 0, Netzwerk 0 x 4xx, extern nur gstatic/firestore; blockierter Speicher ok; Emoji: 0, Symbole nur (c) im Pflicht-Footer und "->" in Code-Kommentaren; Seiten x 5 Viewports ohne Overflow (vp.js).

## Freigabe-Stand 3b
Funktional alle Punkte aus Runde 3 verifiziert, kein Blocker mehr. Offen (mittel, UX): R3-10 Blasen-Clipping, R3-11 nicht eindeutige Mobile-Schilder, R3-12 320 px Header im Multiplayer. R3-13 und CLS Mobile (0,10-0,17) niedrig.
