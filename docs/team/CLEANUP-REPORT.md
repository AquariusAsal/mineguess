
## Frontend (Aufräumen)
**Verschoben nach `..\mineguess-trash\` (nicht gelöscht, Liste in `MOVED.txt` dort):** 35 Dateien, ca. 5,2 MB.
- Logos: `logo-green.png` (2,4 MB), `logo-white.png` (2,4 MB), `logo-transparent.png` (320 KB). Nirgends mehr referenziert (Seiten nutzen `logo-64.png`/`logo-128.png`); `logo.svg` unberührt.
- `assets/mc/gui/*` (16 Dateien, GUI-Texturen, im Code nie referenziert).
- `assets/mc/entity/player/wide|slim/*` außer `wide/steve.png` und `slim/alex.png` (Test-Skins, nicht in der App benutzt).
- Texturen unter `assets/mc/item|block` bleiben alle: `MGIcon.forName` baut Pfade dynamisch aus Mob-/Item-Namen.

**Entfernt/vereinfacht:**
- Toter CSS: 30 Regeln (mg.css 7, index 3, game 17, multiplayer 3) für nicht mehr vorkommende Klassen (Premium, Buzzer-Button-Reste, `.mc-grid`, `.mode-icon`, `.crit`, alte Podium-Farben u. a.).
- `mg-scene.js`: ungenutzte Funktionen/Felder (`damp`, Buzzer-Zylinder, `paper`-Textur/-Geometrie, `buzzPress`/`buzzLight`/`press()`/`_idleWake`), ca. 1,2 KB.
- `multiplayer.html`: `myPremium`/`initPremiumUI` -> `initUI` (Verhalten gleich).

**Bewusst geblieben:** `if (false …)`-Reste in `game.html` (Wettkampf-Endscreen, Rangliste lokale Liste: Logik-JS, backend), Doppel-Definitionen zwischen mg.css und Inline-Styles (Risiko für Optik, nur mit visuellem Regressionstest), Text "Buzzer" auf der Landing.

**QA:** alle JS-Dateien und Inline-Skripte parsen; Referenzscan ohne fehlende Dateien (nur erwartbar: `/socket.io/socket.io.js` vom Server, optionale `sounds/note-harp.mp3`, dynamische Pfade); `node tools/gen-sw-assets.js` (Cache v30, 152 Texturen). Screenshots: Landing 390 px und Szene (4 Spieler, Glocke) unverändert.

## backend
**Verschoben** nach `..\mineguess-trash\` (nicht gelöscht, jederzeit zurückholbar): `gen_questions.py` (alter Fragen-Generator, hätte `questions.json` überschrieben), `fetch-wiki.js` (ungenutzter Wiki-Fetcher), `google-services.json` (Android-Config, im Web nirgends referenziert). Logos `logo-green/-white/-transparent.png` waren unreferenziert (nur im Precache) und liegen dort bereits (frontend).
**Abhängigkeiten:** `firebase` aus `package.json` entfernt (Server nutzt es nicht, Client lädt Firebase von gstatic); `package-lock.json` offline per `npm install --package-lock-only` konsistent gemacht (-1014 Zeilen). `node_modules/` unangetastet (liegt im Git, kein Prune).
**game.html (nur Logik):** tote Funktionen entfernt: `get12hKey`, `getNext12hTime`, `pickQuestion`, `updateCountdown`, `buildShareText`, `restoreSession`, `playAsGuest`, `lbLocalGet`, `recordLocalLb`; tote Konstanten/Variablen: `MOB_NAMES`, `CLOSE_THRESHOLD_PERCENT`, `LB_LOCAL_KEY`, `compOrder`, `window._comp*`, `_att/_prev/_isBest`, `attUsed/maxAtt`; `if (false …)`-Reste im Leaderboard und in `showCompEnd` entfernt. Die nie angezeigte lokale Punkte-Liste (`mg_lb_local`) wird nicht mehr geschrieben.
**sw.js / tools:** `premium.html` und Logo-Originale aus der Precache-Liste; Version über `tools/gen-sw-assets.js` (aktuell v31).
**Bleibt bewusst:** `questions.json` Felder `rating`/`tier` (rating wird gelesen, `tier` ist dokumentiert/abgeleitet), `lockedOut`/`buzzer_reset`-Kompatibilitätsfelder im Protokoll, alte Events `answer_broadcast`/`answer_given`, bewusste Server-Logs (Start, Raum, Beitritt ohne Namen), `tools/rate-questions.js` und `tools/gen-sw-assets.js`, `spotify-config.js`/`firebase-config.js`/`multiplayer-config.js` (referenziert).
**Premium-Reste:** per grep keine mehr (nur der bewusste Redirect `/premium.html` -> `/` in server.js und ein Spotify-Kommentar).
**QS:** `node --check` für alle JS ok, Smoke-Test auf Port 3999 (create/join/buzz/answer, exakte Antwort + Läutender-Bonus, Totem, Ranked-Auswahl) bestanden, Browser-Lauf Gast-Ranked ok, `gen-sw-assets` gelaufen.
