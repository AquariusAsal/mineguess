# API-NOTES (Socket.io + Datenpipeline) – Stand backend

## Fragen-Pipeline
- **Einzige Quelle: `questions.json`** (UTF-8). `server.js` lädt sie beim Start, `game.html` holt sie per `fetch('questions.json')` in `init()` (Promise: `window.questionsReady`). Der alte Block `const questions = [...]` in `game.html` ist entfernt.
- Neue Fragen nur in `questions.json` pflegen (Felder: `id`, `type` number|entity, `question`, `answer`, `unit`+`tolerance` bei number, `acceptedAnswers` bei entity, `category`, `funFact`). `gen_questions.py` würde die Datei überschreiben, nicht mehr ausführen.
- Server-Neustart nötig nach Änderungen an `questions.json` oder `server.js`.
- Antwortprüfung: `answer-check.js` (global `MGAnswer`, auch `require()` im Server) – Solo und Multiplayer identisch: Toleranz, Komma/Punkt/Tausenderpunkt/Einheit ("1,5", "1.561", "64 Blöcke"), Umlaute/ß gefaltet (ä=ae, ß=ss), Groß/Klein, Leerzeichen/Sonderzeichen, führende Artikel.

## Socket-Events (Client → Server)
| Event | Payload | Hinweis |
|---|---|---|
| `create_room` | `{playerName, displayName, isPublic, password, categories, skin?}` | 1x pro 2 s. `categories` nur bekannte Kategorien. |
| `join_room` | `{roomId, playerName, password, skin?}` | Nach 6 Fehlversuchen 30 s Sperre. Doppelte Namen werden zu "Name 2". |
| `rejoin_room` | `{roomId, token}` | Token aus `joined`. Nur innerhalb 30 s nach Verbindungsverlust. Antwort `joined` (`rejoined:true`) oder `rejoin_failed {message}`. |
| `leave_room` | – | sofortiges Verlassen (ohne Grace-Zeit). |
| `get_public_rooms`, `player_ready`, `buzz`, `submit_answer {answer}`, `continue_game` | wie bisher | |
| Ack auf `sync_ping` | `socket.on('sync_ping', cb => cb && cb())` | **Client muss das Ack senden**, sonst keine Latenzkompensation. |

Rate-Limit: 20 Events Burst, 8/s; Überschuss wird verworfen.

## Socket-Events (Server → Client)
- `joined {playerId, roomId, displayName, playerName, isPublic, categories, skin, token, rejoined}` – `token` im sessionStorage ablegen (für `rejoin_room` nach Reload/Netzabbruch). `playerName` ist der final vergebene (ggf. mit Suffix).
- `room_state {players:[{id,name,score,skin,connected,ready}], phase, lockedOut, currentBuzzer, readyCount, totalCount}` – `totalCount` zählt nur verbundene Spieler. `connected:false` = Spieler im Reconnect-Fenster (ausgegraut anzeigen).
- `question {id,type,question,category,unit,options,roundNum}` – `options` bei entity jetzt **echte Auswahl** (richtige Antwort + 7 Ablenker, gemischt); vorher waren es nur die akzeptierten Schreibweisen der richtigen Antwort.
- `timer`, `buzzer_won`, `buzzer_reset`, `result {answer,funFact,winnerId,scores,nextIn}`, `game_over {scores,rounds}`: unverändert; `scores[]` enthalten zusätzlich `skin` und `connected`.
- `answer_broadcast`: wie bisher; neu bei falscher Antwort `feedback: 'low'|'high'|'wrong'|null`. `submitted` ist serverseitig bereinigt (max 60 Zeichen, ohne `<>"&` und Backtick).
- `answer_invalid {message}` – Antwort leer/keine Zahl; **keine Strafe**, Spieler bleibt dran. Client muss die Eingabe wieder freigeben (nicht in "Warten" bleiben).
- `join_error {message}`, `rejoin_failed {message}`, `public_rooms_update` (max. alle 250 ms).
- Beim Beitritt/Reconnect mitten im Spiel sendet der Server einen **Snapshot** (`question`, `timer`, `buzzer_won`, `buzzer_reset` bzw. `result`/`game_over`) – der Client muss diese Events auch im Lobby-Screen verarbeiten und dann in den Spielscreen wechseln.

## Buzzer-Fairness
Buzzes innerhalb von 120 ms werden verglichen: Ankunftszeit minus halbe gemessene RTT (max. 300 ms). Dadurch `buzzer_won` ca. 120 ms nach dem ersten Druck.

## Skin-Kopf
- Client schneidet Gesicht (8x8 ab Pixel 8,8) + Hut-Layer (40,8) aus 64x64/64x32-Skin und sendet **ein** Feld `skin` = `"data:image/png;base64,..."` (PNG, bis 64x64 px erlaubt, empfohlen 8x8).
- Server akzeptiert nur: Präfix `data:image/png;base64,`, Länge <= 6000 Zeichen, reines Base64, PNG-Signatur + IHDR, Breite/Höhe 1..64, dekodiert <= 4500 Byte. Sonst `skin = null` (kein Fehler).
- Nur im RAM, mit Spieler/Raum entfernt, nie persistiert. Echo in `joined`, `room_state.players[]`, `result.scores[]`, `game_over.scores[]`.
- Anzeige nur als `<img src>` (kein innerHTML mit ungeprüften Strings; `src` nur setzen, wenn es mit `data:image/png;base64,` beginnt). `image-rendering: pixelated`. `skin === null` → Standardkopf-Fallback im Frontend.

## Sicherheit / Hinweise für Frontend
- Namen/`submitted` sind serverseitig von `<>"&` bereinigt, trotzdem im Client weiter per `textContent` setzen.
- `server.js`, `package*.json`, `node_modules/`, `docs/`, `*.py`, `*.md`, `*.pdf`, `google-services.json` werden nicht mehr statisch ausgeliefert (404).
- `sw.js`: Cache `mineguess-v3`, network-first für HTML/JS/CSS/JSON; neue Dateien nur in die `ASSETS`-Liste eintragen (Version bei Deploys erhöhen).


---
# Runde 3: Buzzer-Szene, Ganzkörper-Skin, Strafpunkte (löst die Skin-Abschnitte oben ab)

## Skin / Charakter
- `create_room`/`join_room` Payload: `{..., skin?, character?}`; später per `set_profile {skin?, character?}`.
- `skin`: PNG-Data-URL `data:image/png;base64,...`. Erlaubt: **64x64, 64x32 (Ganzkörper) oder 8x8 (Kopf, Altformat)**. Länge <= 24000 Zeichen, dekodiert <= 16384 Byte, PNG-Signatur + IHDR strikt, sonst `skin = null` (kein Fehler). Nur im RAM, mit Raum/Spieler gelöscht.
- `character`: `'steve' | 'alex'` (alles andere -> `'steve'`). Frontend rendert ohne `skin` den Standard-Charakter.
- **Skin-Daten werden nur einmalig übertragen**: im `joined`-Roster (`players[]`), per `player_joined {player}` / `player_updated {player}`. `room_state.players[]`, `result.scores[]`, `game_over.scores[]` tragen **keine** Skins mehr, nur `skinId` (10-stelliger Hash, zum Cache-Abgleich) und `character`.
- Player-Objekt (voll): `{id, name, score, skin, skinId, character, connected}`; kurz (ohne `skin`): `{id, name, score, skinId, character, connected, ready}`.
- `player_left {id}` beim endgültigen Entfernen (nach Grace/`leave_room`).
- Reconnect: neue Socket-ID. Server sendet `player_id_changed {oldId, newId}` an den Raum; der Rejoiner bekommt `joined` mit komplettem Roster (`rejoined:true`) + Snapshot.

## Szenen-Events (Server -> Client)
| Event | Payload | Zeitpunkt |
|---|---|---|
| `buzzed` | `{playerId, playerName}` | Buzz entschieden (zusammen mit `buzzer_won`, ca. 120 ms nach dem ersten Druck, latenzbereinigt). Figur drückt den Buzzer. |
| `typing` | `{playerId}` | Der Buzzer-Halter tippt (an alle außer den Sender, max. alle 700 ms). Client sendet dafür `typing` (ohne Inhalt) bei Eingabe, höchstens ~1x/s. |
| `answer_given` | `{playerId, playerName, text, correct, delta, score, unit}` | Antwort ausgewertet. `text` bereinigt, max. 40 Zeichen, **nie als HTML rendern** (`textContent`). Sprechblase "Die Antwort ist `text`!" (Zahl: optional + `unit`). `delta`: +Punkte bei richtig, `0..-50` bei falsch (tatsächlich angewendet). `score`: neuer Gesamtstand. |
| `answer_timeout` | `{playerId, playerName, delta, penalty, score}` | Antwortzeit nach Buzz abgelaufen (oder Buzzer-Halter weg). Sprechblase "Zeit abgelaufen". Zusätzlich zu `answer_broadcast {timeout:true}`. |
| `scene` | `{phase, buzzedId, typingId, lockedOut[], speech:{playerId,text,correct,timeout,delta}\|null, timerLeft, roundNum}` | Nach `joined`/Rejoin (Snapshot), damit Späteinsteiger die Szene rekonstruieren. Danach gelten die normalen Events. |
| `answer_invalid` | `{message}` | Leere/ungültige Eingabe: **keine Strafe, kein Zeitgewinn** (Timer läuft unverändert weiter). |

Alte Events (`buzzer_won`, `answer_broadcast`, ...) bleiben unverändert und kompatibel.

## Punkte (A2)
- `PTS_CORRECT 150` + Speedbonus (max 50); **falsche Antwort / Timeout nach Buzz: -50** (`PTS_WRONG`), Gesamtpunkte nie < 0 (bei Score 20 ist `delta` = -20).
- `answer_broadcast`/`answer_given`/`answer_timeout` enthalten `delta` (angewendet), `penalty` (50, nur Wrong/Timeout) und `score`.
- Anzeige "-50" im Ergebnis, in der Live-Liste und im Endscreen: `delta` verwenden, nicht fest 50.

## Solo-Timer (A1)
`submitGuess` ignoriert leere/ungültige Eingabe vollständig (nur Toast), der Timer wird weder gestoppt noch neu gestartet. Gilt für Endlos, Blitz, Daily, Wettkampf (gleiche Funktion). Server: `answer_invalid` berührt den Antwort-Timer nicht.

## Toleranzen (A4)
Optionale Felder bei number-Fragen: `tolerancePct` (z. B. 10) und `toleranceMin`. Erlaubte Abweichung = `max(tolerance, |answer| * tolerancePct/100, toleranceMin)`, ausgewertet in `answer-check.js` (Solo und Server identisch). Betroffen: Haltbarkeits-Fragen (±10 %, min. 5), Sprengwiderstand (±20 %, min. 1), Level-XP und Drachen-XP (±5 %).

## Sonstiges
- `maxHttpBufferSize` 96 KB. sw.js Cache `mineguess-v7`. `public_rooms_update` enthält `hasPassword`.
- Neustart des Servers nötig.


---
# Runde 4: Ranked (ersetzt Wettkampf + Online-Leaderboard)

## Modul `ranked.js` (global `MGRanked`, auch `require('./ranked.js')`)
- Ränge (je 1000 MMR): Copper 0, Iron 1000, Gold 2000, Diamond 3000, Netherite ab 4000 (offen). Unterstufen I-III je ~333 MMR. Start-MMR 500, K = 28, MMR >= 0.
- `MGRanked.rankInfo(mmr)` -> `{mmr, idx, rankId, name, texture, tier(1-3), label ("Gold II"), floor, next, nextName, toNext, progress(0..1)}`. `texture` = Name der Barren-Textur (`copper_ingot`, `iron_ingot`, `gold_ingot`, `diamond`, `netherite_ingot`).
- `MGRanked.applyAnswer(profile, rating, result, {speedFrac, streak})` -> `{profile, delta, p, rating, before, after, promoted, demoted}`.
- `MGRanked.pickIndex(questions, mmr, usedSet, rnd)` wählt adaptiv nach MMR-Zone (20 % Aufwärmer -300..-100, 60 % Kernzone ±150, 20 % Herausforderung +100..+400).

## Formel
- `p = 1 / (1 + 10^((R_frage - MMR)/400))`, `delta = K * (Ergebnis - p)`, gerundet; Ergebnis 1.0 im Erstversuch, -0.15 je Fehlversuch, -0.1 je Tipp (min. 0.4 bei richtig), 0 bei Fehlschlag/Timeout.
- Zusatz nur bei Ergebnis > 0.5, skaliert mit (1-p) (leichte Fragen bringen kaum Bonus): Speed bis +4 (`speedFrac` aus dem bestehenden Wettkampf-Speedtimer, 20 s), Serie bis +4 (0.8 je Treffer in Folge, max. 5). Verlust max. K * p; MMR nie < 0.
- Beispiele (MMR 500): Frage 700 richtig +26, falsch -7; Frage 3800 richtig +28, falsch 0.

## Frage-Ratings
`questions.json`: `rating` (600-3900, Perzentil-kalibriert, 50er-Schritte) und `tier` (1 < 1200, 2 < 2200, 3 < 3200, 4 darüber). Heuristik und Skript: `tools/rate-questions.js` (Typ, Größenordnung, Dezimalzahl, Toleranz, schwer merkbare Zahlen, Antwortlänge, Rezept/Phrase, Kategorie). Neu hinzugefügte Fragen: Skript erneut laufen lassen (ratings werden dabei relativ neu verteilt).

## Spielablauf (game.html, gameMode `competition`)
- 10 Fragen pro Lauf, Speedtimer 20 s, Serie/Streak-Multiplikator und Punkte-Anzeige bleiben. **Kein Versuchslimit/12h-Sperre mehr**; Fortschritt über MMR.
- Pro Frage (nach richtig / Fehlschlag / Timeout nach letztem Versuch) `rankedAnswered()`: MMR-Update, lokal `localStorage.mg_ranked`, Cloud gedrosselt (alle 4 s) und am Lauf-Ende.
- Event für die UI: `document.dispatchEvent(new CustomEvent('mg:ranked', {detail}))` mit `detail = {delta, p, rating, before, after, promoted, demoted, profile}`; zusätzlich `window.lastRanked`. Lauf: `rankedRun = {start, delta, answered, correct}`. Fallback-Text steht in `#ranked-note` (vom Frontend ersetzbar). Aktuelle MMR: `rankedEnsure().mmr`.
- Modus-Tag `#comp-mode-tag` zeigt "Rang · MMR".

## Persistenz / Datenformat
- Lokal: `mg_ranked` = `{mmr, peak, games, answered, correct, lastDate}`.
- Cloud (Account): Firestore `ranked/{uid}`: `{uid, displayName, photoURL, mmr, peak, games, answered, correct, rank, tier, lastDate, updatedAt}`. Beim Login: Cloud gewinnt, außer lokal wurde mehr beantwortet (Gast-Start) -> lokal wird hochgeladen.
- Rangliste = `ranked` nach `mmr` desc (limit 100), Tab "Heute" filtert `lastDate`. Eigener Rang oben ("Du", Rang, Fortschritt), bei Gästen "nur auf diesem Gerät". Fehler/Gast: verständliche Meldung + lokaler Rang.
- Die alte `leaderboard`-Collection wird nicht mehr beschrieben.
- sw.js: `ranked.js`, `bell-minecraft.mp3` vorgecacht (Version über `tools/gen-sw-assets.js`).


## Runde 6: Leaderboard nur MMR, Tabs Heute / Allzeit
Dokument `ranked/{uid}` (und lokal `mg_ranked`) hat zusätzlich:
- `tier`: Rang-Id `'copper'|'iron'|'gold'|'diamond'|'netherite'` (vorher Zahl), `division`: 1..3 (3 = höchste Stufe des Rangs, Anzeige "Copper III"), `rank` bleibt = `tier` (Kompatibilität).
- `lastPlayedDay`: `'YYYY-MM-DD'` (lokaler Kalendertag des letzten Ranked-Spiels), `mmrToday`: MMR-Änderung seit der ersten Antwort des Tages (lokal zusätzlich `mmrDayStart`).
- Es gibt keine Punkte im Ranked-Dokument. Der Wettkampf-Punktespeicher (`sessionPoints`, `mg_lb_local` für Blitz/Daily) bleibt intern, wird im Leaderboard nicht angezeigt.

Laden (game.html `loadLeaderboard`): ein Query `ranked orderBy mmr desc limit 100` (kein Composite-Index nötig).
- **Allzeit**: die Liste wie geladen. Zeile: Name, Rang (`MGRanked.rankInfo(mmr)`: `rankId`, `tier` = Division, `label`), MMR.
- **Heute**: dieselbe Liste, clientseitig gefiltert auf `lastPlayedDay === MGRanked.dayKey()`, Reihenfolge nach aktuellem MMR; Zeile zeigt zusätzlich `mmrToday` ("+37 heute").
- Lokaler Fallback: eigene Zeile "Du" (Rang, Fortschritt, MMR); Tab Heute ohne Spiel heute: Hinweis "Heute noch kein Ranked-Spiel."
- Helfer: `MGRanked.rankData(mmr)` -> `{tier:'copper', division:3}`, `MGRanked.dayKey()`.
