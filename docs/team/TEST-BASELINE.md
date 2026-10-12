# TEST-BASELINE (Ist-Zustand vor den Aenderungen, Stand HEAD ae61d6c)

Methode: echter Chrome (Playwright, channel chrome) gegen lokalen Server, socket.io-client-Skripte (3-9 Clients), Code-Review, Datenanalyse von questions.json und dem Fragenblock in game.html. Skripte liegen ausserhalb des Repos (Temp/scratchpad).
Schweregrad: K = kritisch (Crash/Spiel haengt), H = hoch, M = mittel, N = niedrig.

## Kritisch

| ID | Bereich | Befund | Repro | Erwartet / Tatsaechlich |
|----|---------|--------|-------|--------------------------|
| B-01 | server.js | Jeder Beitritt zu `public-1..5` crasht den Node-Prozess: `TypeError: room.lockedOut is not iterable` (broadcastLobby Z.93). `makePermanentRoom` legt lockedOut/currentBuzzer/timerLeft nicht an. | `join_room {roomId:'public-1',playerName:'x'}` | Beitritt / gesamter Server tot (alle Spieler fliegen raus). In Produktion ist das der Standardweg ("Raum #1..5"). |
| B-02 | server.js | Fehlende/ungueltige Payloads crashen den Prozess (`create_room` ohne Argument/null: Destructuring-TypeError; `join_room` ohne roomId: `roomId.toLowerCase()`). Kein uncaughtException-Handler. | `socket.emit('create_room')` bzw. `emit('join_room')` | Fehlermeldung / Prozess beendet. Jeder Client kann den Server mit einer Zeile killen. |
| B-03 | game.html showResult | Bei `number`-Fragen der Kategorie `Items` oder `Blöcke` (101 von 648 Fragen, 16 %) wirft `setIconWithFallback(img, question.answer)` `name.trim is not a function` (answer ist eine Zahl). showResult bricht ab: kein Antworttext, kein Fun Fact, Eingabe bleibt, kein Auto-Weiter. Spiel haengt in allen Modi (auch Blitz/Daily/Wettkampf). | Endlos spielen, Frage "Wie lange dauert es, einen Obsidian-Block ... abzubauen" richtig beantworten | Ergebnisfenster mit Fun Fact und naechste Frage nach 4 s / nichts passiert. |

## Hoch

| ID | Bereich | Befund | Repro |
|----|---------|--------|-------|
| B-04 | multiplayer.html (XSS) | `p.name`, `displayName`, `playerName`, `submitted` werden unescaped per innerHTML gerendert; Server validiert Namen nicht (5000 Zeichen und `<img src=x onerror=...>` werden akzeptiert und an alle gebroadcastet). Stored XSS gegen alle im Raum und in der Raumliste. | Mit Name `<img src=x onerror=alert(1)>` beitreten |
| B-05 | server.js | Kein Reconnect: Verbindungsabbruch loescht den Spieler samt Punktestand; nach Socket-Reconnect hat der Client eine neue ID und ist in keinem Raum (UI haengt). | Client mitten in der Runde `socket.disconnect(); socket.connect()` |
| B-06 | server.js / multiplayer.html | Entity-Fragen: `options` = `acceptedAnswers` (nur Synonyme der richtigen Antwort, z. B. "Mooshroom / Pilzkuh / Mushroom Cow"). Jeder Button ist richtig, die Frage ist keine Frage mehr; leakt die Loesung. 150 Entity-Fragen. | Multiplayer, Entity-Frage, beliebigen Button klicken |
| B-07 | server.js | Raum-IDs aus 2 Woertern + Zahl (~19.600 Kombinationen) werden bei Kollision ohne Pruefung ueberschrieben (`rooms[rid] = room`): ein neuer Raum ersetzt einen laufenden. | Code-Review Z.248-251 |
| B-08 | server.js | Spieler koennen mehrere Raeume erzeugen (kein Verlassen des alten Raums bei zweitem `create_room`/`join_room`); beim Disconnect wird nur `currentRoom` aufgeraeumt -> Geisterraeume bleiben dauerhaft in der Liste. Kein Limit pro Socket/IP, kein Rate-Limit (2000 `create_room` in 1 s werden alle angelegt). | `create_room` zweimal mit demselben Socket, dann disconnect |
| B-09 | server.js | Doppelte Namen und leere/ueberlange Namen werden nicht behandelt (2x "Anna" im selben Raum, 5000 Zeichen). | siehe B-04 |

## Mittel

| ID | Bereich | Befund | Repro |
|----|---------|--------|-------|
| B-10 | game.html showResult | Angezeigte Punkte sind doppelt: "+2.000 Pkt." obwohl Session +1.000 (liest `POINTS_CORRECT + questionPoints` nach `addPoints`). Betrifft alle Modi; mit Hinweis: Anzeige 1.800 statt 800. | Endlos, Frage richtig, Anzeige vs. Session-Punkte vergleichen |
| B-11 | game.html getFeedback | `tolerance` aus den Fragen wird in Solo ignoriert (nur exakter Treffer). Tolerance 5 bei 180 s -> 178 falsch. Im Multiplayer zaehlt die Toleranz: inkonsistent. | `getFeedback({type:'number',answer:180,tolerance:5}, '178')` |
| B-12 | game.html getFeedback | Entity-Vergleich nur `toLowerCase().trim()`: "Schildkroete", "Zombie Schweinchen" (statt Bindestrich), doppelte Leerzeichen, Unicode-NFD werden abgelehnt. Multiplayer normalisiert anders (entfernt Sonderzeichen, a-z0-9äöüß) -> Solo und Multi bewerten unterschiedlich. | Siehe Skript-Ausgabe: umlaut-less/hyphen/NFD = false |
| B-13 | game.html | Zahlen mit Komma: `parseFloat("1,5") = 1` (nur durch `type=number` im Chrome-UI abgefedert); `"15e0"` wird als 15 akzeptiert. | `getFeedback(n,'1,5')` |
| B-14 | server.js | Spiel startet nicht, wenn der letzte nicht-bereite Spieler geht und alle uebrigen schon bereit sind (Start nur im `player_ready`-Handler). | 2 Spieler, A bereit, B disconnect |
| B-15 | Spielstart | Spieler, die waehrend einer Runde beitreten, bekommen kein `question`-Event (erst naechste Runde); Phase wird nur ueber room_state geliefert. | Spaeten Join mitten in Buzzer-Phase beobachten |
| B-16 | server.js | Spielende: Raum bleibt in `game_over` bis jemand `continue_game` sendet (beliebiger Spieler kann fuer alle resetten); kein Host-Konzept (Host verlassen -> Raum laeuft weiter, ok, aber niemand ist Host). | Code-Review |
| B-17 | Premium | Premium ist rein clientseitig: `?premium=1` schaltet Kategoriefilter dauerhaft frei (localStorage `mg_premium`), Server nimmt `categories` von jedem an. Stripe-Link ist `buy.stripe.com/placeholder`. | `multiplayer.html?premium=1` |
| B-18 | game.html | Doppelter Splash-Block (`id="splash-screen"` 2x im DOM, Z.~1393 und ~1410). | DOM pruefen |
| B-19 | index.html | Mobile Layout: `.stats-bar` erzeugt horizontalen Scroll (scrollWidth 476 bei 360 und 390 px). | Viewport 360x640 / 390x844 |
| B-20 | multiplayer.html | 360 px: `.header-right/.btn-back` ragen ueber den Viewport (scrollWidth 381); 2 Eingabefelder mit < 16 px (iOS-Zoom); 5-9 Touch-Ziele < 44 px. | Viewport 360x640 |
| B-21 | Fragen | 9 doppelte Fragen in game.html (ids 52/174 Staerke-Trank, 54/175 Feuerresistenz, 111/620 Axolotl-Farben, 372/381 Goldschwert, 464/521 Diamant-Y, 486/587, 487/588, 488/589, 497/595 Redstone; teils mit abweichender Toleranz). | `q.js` (Normalisierung) |
| B-22 | Fragen | `questions.json` (150) und Block in game.html (648) laufen auseinander (499 nur in game.html, 3 nur in JSON); Server liest game.html per Regex. Kategorie "Bloecke" (1x) neben "Blöcke"; ~64 Fragen mit ae/oe/ue-Schreibung ("benoetigt", "fuer") statt Umlauten. | `q.js` |
| B-23 | Fragen | Toleranzen unplausibel: id 487 (Repeater min. 1 Tick, tol 1 -> 0 und 2 richtig), 137 (Wolf 3 Knochen, tol 2), 528 (1 Block, tol 1). Wettkampf-Kategorien `Mechaniken`/`Geschichte` existieren nicht (`Geschichte & Updates`). | Datenanalyse |
| B-24 | UI-Texte | Moduskarte "225+ Fragen" (real 648). | Modusauswahl |

## Niedrig / Hinweise

- B-25 Rechtsseiten: `impressum.html` und `datenschutz.html` existieren nicht (404), kein Footer-Link auf irgendeiner Seite (Pflicht in DE).
- B-26 `favicon.ico` und `manifest.json` 404 (Konsolenfehler "Failed to load resource" auf jeder Seite).
- B-27 sw.js: cache-first mit Hintergrund-Update (stale-while-revalidate), konstante Cache-Version `mineguess-v2`, nach Deploys liefern Nutzer alte HTML-Dateien bis zum zweiten Laden. Cacht auch `/socket.io/?...polling`-GETs. ASSETS enthalten keine neuen Dateien. Multiplayer offline unmoeglich (socket.io von CDN, nicht gecacht).
- B-28 Icons werden von `minecraft.wiki/images/...` per Hotlink geladen (IP-Uebermittlung an Dritten -> Datenschutzerklaerung, Mojang-Bildrechte).
- B-29 Externe Ressourcen: Google Fonts (Datenschutz!), gstatic Firebase 10.7.1, cdnjs socket.io: muessen in der Datenschutzerklaerung stehen oder lokal gehostet werden.
- B-30 Hint-Texte verraten bei Entity-Fragen Buchstaben ("Die Antwort hat N Buchstaben und enthaelt ... Mitte") ok, aber Fragen mit Antwort im Fragetext: 6 Faelle.
- B-31 Kategorie-Tags/Premium: `sessTotal`/Stats nur lokal; Gaeste haben keinen Leaderboard (gewollt).
- B-32 Touch-Ziele < 44 px: index.html 5-8, game.html 1, premium.html 6, multiplayer.html 5-9 (je Viewport).

## Ok im Ist-Zustand (verifiziert)

- Lobby: Raum erstellen (privat/Passwort), Beitritt, falsches Passwort, unbekannter Raum, 9. Spieler abgewiesen (Raum voll).
- Ready-Toggle, Start nur bei allen bereit; gleichzeitiger Buzz (4-8 Clients, 1000 Events) ergibt genau einen Gewinner; Nicht-Buzzer-Antworten ignoriert; gesperrter Spieler kann nicht erneut buzzen.
- Timeouts: Antwort nach 15,2 s, kein Buzz nach 30,3 s; Disconnect des Buzzers -> Runde laeuft weiter; 10 Runden -> `game_over`, `continue_game` setzt zurueck; leere Raeume werden geloescht; Frage-Payload enthaelt keine Antwort.
- Solo: Endlos/Blitz/Daily/Wettkampf starten, 3-2-1-Countdown, richtige Antwort wird gewertet (ausser B-03).
- Viewports 360/390/768/1280/1920: kein Overflow ausser B-19/B-20.
