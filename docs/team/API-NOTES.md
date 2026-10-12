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
