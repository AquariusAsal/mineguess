# BACKEND-FINDINGS

## Server (server.js) – gefunden und behoben
1. **Crash beim Betreten von `public-1..5`**: Permanente Räume hatten kein `lockedOut` → `[...undefined]` in `broadcastLobby`. Räume entstehen jetzt alle über `makeRoom()`.
2. **Unvalidierte Payloads** (fehlendes `roomId`, `answer` kein String, leeres Objekt) → Prozess-Crash. Jetzt: Typprüfung, Längenlimits, try/catch pro Handler, `uncaughtException`-Netz.
3. **Doppelte Wertung**: Nach richtiger Antwort blieb der Spieler 2 s lang `currentBuzzer` → zweites `submit_answer` gab erneut Punkte. Flag `room.answered`.
4. **Doppelstart/Frageüberspringen**: Ready-Toggle während der 1,5-s-Startverzögerung konnte `nextQuestion` zweimal auslösen. Flag `room.starting`; alle Timeouts über `later()` verwaltet und bei Phasenwechsel/Raumende gelöscht (keine Geister-Timer, `revealResult` idempotent).
5. **Entity-Optionen verrieten die Antwort**: `options` = nur Schreibweisen der richtigen Antwort. Jetzt richtige Antwort + 7 Ablenker.
6. **Leere/ungültige Antwort bestrafte** (Sperre für die Runde). Jetzt `answer_invalid` ohne Strafe.
7. **Antwortprüfung inkonsistent** (Server: Komma ok, Client: `parseFloat("1,5")=1`, Client ignorierte `tolerance`). Gemeinsames `answer-check.js`.
8. **Spieler verlässt Raum**: Bei Disconnect eines Gesperrten/Letzten wurde die Runde nicht aufgelöst (30 s Leerlauf); Auflösung prüft jetzt `lockedOut` gegen verbundene Spieler. Ready-Start auch nach Abgang eines Nicht-Bereiten.
9. **Reconnect**: Socket-Wechsel löschte Spieler und Punkte sofort. Neu: 30-s-Grace, `rejoin_room` mit Token, Spielstand bleibt.
10. **Spät Beitretende** bekamen keine aktuelle Frage (leerer Screen). Snapshot-Events.
11. **Raum-ID-Kollision** (`words+words+0..99`) überschrieb stillschweigend Räume → Retry bis eindeutig, Raumlimit 300.
12. **Namen**: Länge, Steuerzeichen, `<>"&` entfernt (XSS im Client via innerHTML), Duplikate → "Name 2".
13. **Statische Auslieferung** gab `server.js`, `google-services.json`, `node_modules`, `docs` heraus → Blockliste.
14. **Spieler in mehreren Räumen**: neuer Beitritt verlässt den alten Raum.
15. **Buzzer-Fairness**: 120-ms-Fenster mit RTT-Kompensation; Rate-Limit pro Socket; `public_rooms_update` gedrosselt (vorher `io.emit` bei jeder Änderung).
16. Raum ohne verbundene Spieler wird angehalten/zurückgesetzt; Round-Counter und Punkte werden in `resetRoom` (nach `game_over` und bei Leerung) zurückgesetzt.
17. Unverändert bewusst: Punkte 150 + max 50 Speed; Buzzer 30 s, Antwort 15 s; max. 8 Spieler/10 Runden; Host-Konzept existiert nicht (alle gleichberechtigt, `continue_game` jeder).

## Client-Logik (game.html) – behoben
- `showResult` crashte bei number-Fragen der Kategorie Items/Blöcke (`name.trim` auf Zahl) → Icon nur bei entity (tester-Fund).
- Angezeigte Punkte waren doppelt (`POINTS_CORRECT + questionPoints` nach `addPoints`).
- Solo ignorierte `tolerance`; Komma-Dezimalzahlen wurden abgeschnitten; Einheit im Input brach die Zahl; Umlaut-/ß-Schreibweisen (Schiesspulver/Schießpulver) nur über Zusatzeinträge.
- Ungültige Eingabe verbrauchte einen Versuch → jetzt Toast ohne Verbrauch.
- Timer-Ablauf beim letzten Versuch: kein `recordCatStat`, Gäste zählten `stats.played`, Wettkampf-Streak/Speedtimer nicht zurückgesetzt.
- `addGuessRow`: Nutzereingabe unescaped in `innerHTML` (Self-XSS) → escaped.
- Daily: `showDailyEnd` konnte doppelt laufen (Achievements/Sound doppelt) → idempotent.
- Wettkampf-Pool `HARD_CATS` enthielt nicht existierende Kategorien (`Mechaniken`, `Geschichte`).
- Number-Input ohne `step=any` → Dezimalantworten (0,7 XP) wären als ungültig markiert.

## Fragen (questions.json)
- Vorher: `questions.json` (150) und `game.html`-Block (648) liefen auseinander; Solo/MP kannten nie dasselbe Set. Jetzt eine Datei.
- Rechtschreibung: ca. 500 Texte hatten ASCII-Ersatz (ue/ae/oe/ss) → automatisch zu Umlauten/ß korrigiert (Antworten mit Zusatzvarianten abgesichert).
- **Inhaltsfehler** (siehe `scratchpad`-Audit): 17 Mob-HP-Antworten verdoppelt (Wither 300 Java, Iron Golem 100, Ghast 10 …), Wasser 7 Blöcke, Lava 3 Blöcke, Warden 4 Shrieks, Absorption 2 Herzen, Level 50 = 5345 XP, Armbrust 465, Netherstein 0,4, Stärketrank = Lohenstaub, Zombie dropt Verrottetes Fleisch, Kaninchen 7 Varianten u. a.
- Entfernt: 189 Fragen (Duplikate, falsch, widersprüchlich z. B. Tag 10 vs. 20 Min, unklare/erfundene deutsche Begriffe wie "Trübsinn", falsche Drops). Verbleibend 450 + 70 neu = 520.
- Offen/unsicher (nicht geprüft, bitte Wiki-Check): deutsche Namen bei Verzauberungen/Strukturen (Enderfestung/Festung), `Hexe` HP 26 vs. Bedrock, einige Entity-Antworten sind Phrasen ("Schneeige Biome") und für Spieler schwer zu treffen.

## Nachtrag: Endlosmodus im Gastmodus
- Reproduktion mit Chrome headless gegen die aktuelle Version (frischer Gast, 7 Zahlen- und 6 Entity-Fragen inkl. Falschantworten, Autocomplete, Timeout): Endlos, Blitz und Daily laufen im Gastmodus ohne Fehler. Firebase/Firestore werden im Gastmodus nirgends angefasst (`!isGuest`-Guards, `saveCloudStats`/`submitLeaderboard` brechen ohne `currentUser` ab).
- Wahrscheinliche Ursachen des gemeldeten Fehlers in der alten Version: (1) B-03 (showResult-Crash bei number-Fragen in Items/Blöcke, friert jeden Modus ein), (2) alter cache-first Service Worker lieferte veraltete game.html, (3) blockierter Browser-Speicher (Privat-/Gastfenster): jeder `localStorage`-Zugriff warf, `getStats()` brach ab.
- Zusätzlich gehärtet: RAM-Ersatz für `localStorage`, wenn der Zugriff wirft (Script am Anfang von game.html); getestet mit simuliert blockiertem Speicher, Endlos läuft.
- Der Premium-Kategoriebildschirm (`isPremium && mode==='endless'`) betrifft nur angemeldete Premium-Nutzer, nicht Gäste.

## Nachtrag: Emoji/Symbole
- server.js, answer-check.js: keine Emoji in Meldungen oder Events (nur `─` und `→` in Code-Kommentaren, harmlos).
- questions.json: 3 Pfeile `→` in funFact von id 206 und 221 durch Text ersetzt; sonst nur `–` (Gedankenstrich) und Umlaute. Keine Emoji in question/funFact/unit/answer.
- Hinweis an frontend: `game.html` enthält weiterhin viele Emoji in UI-Texten (Toasts, Titel, catEmojis-Map) – das ist UI, nicht Backend.

## Nachtrag: sw.js
- Cache `mineguess-v4`, `mg-icons.js` in ASSETS, `/assets/mc/*` cache-first (zusammen mit allen Bildern/Fonts), HTML/JS/CSS/JSON bleiben network-first.


## Runde 3 (A1-A4)
- **A1 Zeitgewinn bei leerer Eingabe**: `submitGuess` hielt den Timer an (`clearInterval`) und startete ihn bei leerer/ungültiger Eingabe mit vollem Wert neu (`startTimer`). Jetzt wird zuerst validiert; bei leer/ungültig nur Toast, Timer unverändert. Gleiche Funktion für Endlos, Blitz, Daily, Wettkampf, Joker. Server: `answer_invalid` fasst den Antwort-Timer nicht an (geprüft).
- **A2 Strafpunkte MP**: `PTS_WRONG = 50`, Score nie < 0; gilt für falsche Antwort und Timeout nach Buzz. Events enthalten `delta`/`penalty`/`score`.
- **A3 Leaderboard**: Ursachen siehe docs/team/FIRESTORE-RULES.md (z-index-Überdeckung durch `#comp-end`/`#blitz-end`/`#daily-end`, verschluckte Fehler, `window.fbDb`-Bug bei Reports, wahrscheinlich fehlende/abgelaufene Firestore-Regeln beim Auftraggeber). Lokaler Fallback `mg_lb_local` (nur dieses Gerät), Fehlerhinweise.
- **A4 Toleranzen**: `tolerancePct`/`toleranceMin` in `answer-check.js`; angewendet auf 30 Haltbarkeits-Fragen (ids 153, 159, 160, 343-368, 666), 15 Sprengwiderstände (313-327), XP (29, 463, 495). Y-Level-Fragen (28, 522, 527, 530, 531) auf ±5 absolut.
  - Weitere "unmerkbare" Zahlen, die noch exakt bewertet werden und ggf. ebenfalls Toleranz brauchen (Entscheidung Lead/forscher): Lichtlevel (329-342: Lerninhalt, exakt ok), Haltbarkeits-Ersatz "Wie viele Schüsse..." (160 bereits), Nahrungspunkte (557-576, 1-10, exakt vertretbar), Drop-/Spawn-Chancen in % (14: 0,164 %, 33: 10 %, 43: 80 %, 50: 20 %, 624: 5 %, 621: 0,083 %), Level-Kosten, Piglin-/Dorfbewohner-Distanzen (Blöcke).
- **Zusatz**: `submitReport` schrieb nie nach Firestore (`window.fbDb` undefined) - behoben.
