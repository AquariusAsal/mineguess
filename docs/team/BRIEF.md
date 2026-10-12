# MineGuess Redesign – Gemeinsames Briefing (alle Teammates zuerst lesen)

## Ziel
MineGuess ist ein funktionierendes Minecraft-Quizspiel (Node/Express/Socket.io, Firebase Auth/Firestore, gehostet auf Render, Repo `AquariusAsal/mineguess`).
Der Auftraggeber will: **neuer Look, bessere Animationen, Bugfixes, Mobile + Desktop, Schwerpunkt Multiplayer, neue schwere/lustige Fragen, Impressum + Datenschutz, eigener Spielerkopf (Skin-Upload)**.

## Harte Regeln
1. **Bestehende Funktionen und Spielmodi NICHT ändern oder entfernen.** Nur Look, Bugfixes und die ausdrücklich gewünschten Ergänzungen (Fragen, Rechtstexte, Skin-Kopf).
2. **Nichts committen, nichts pushen, kein `git add`.** Der Auftraggeber sieht das Ergebnis zuerst auf localhost und bestätigt dann. Der Lead übernimmt Git.
3. **Keine Datei komplett neu schreiben (kein Write auf bestehende Dateien)**, nur gezielte Edits. `game.html` hat ~10.600 Zeilen. Lies nur die Bereiche, die du brauchst (grep, offset/limit).
4. **Datei-Ownership** (nie in fremden Bereichen editieren; bei Bedarf Nachricht an den Owner):
   - **backend**: `server.js`, `questions.json`, `gen_questions.py`, `fetch-wiki.js`, `package.json`, `sw.js`, `*-config.js`, sowie in `game.html` den Fragen-Block (`const questions = [...]`) und reine Spiellogik-JS (Scoring, Timer, Validierung, Firebase-Aufrufe, Socket-Events).
   - **frontend**: alle `<style>`-Blöcke und das HTML-Markup/Klassen in `index.html`, `game.html`, `multiplayer.html`, `premium.html`, neue Seiten `impressum.html` und `datenschutz.html`, Logos/Assets, Animationen, UI-Rendering-JS (DOM-Aufbau, Transitions).
   - **forscher**: schreibt nur nach `docs/team/` (Recherche, Designbrief, Faktenlisten).
   - **tester**: schreibt nur nach `docs/team/` (Berichte) und Wegwerf-Skripte außerhalb des Repos. Fixes macht der jeweilige Owner.
5. Grenzfälle (z. B. Skin-Kopf braucht UI **und** Server): Backend liefert die Schnittstelle (Socket-Events/Datenformat) und schreibt sie in `docs/team/API-NOTES.md`, Frontend baut die UI dagegen.
6. Kommuniziere über SendMessage mit Namen: `forscher`, `backend`, `frontend`, `tester`, Lead = `team-lead`. Melde dich kurz und konkret, wenn du etwas lieferst oder blockiert bist. Keine Romane.
7. Sprache der UI und der Fragen: **Deutsch** (wie bisher). Code-Kommentare knapp.
8. Keine offiziellen Mojang-Texturen, -Logos oder -Schriften kopieren. Eigene CSS-/SVG-Pixel-Optik ist okay. Fakten dürfen aus dem Minecraft-Wiki stammen, aber nicht wörtlich kopiert werden (Wiki steht unter CC BY-NC-SA; im Impressum/Credits Quelle nennen).
9. Secrets/Keys nicht ausgeben oder neu einführen. Firebase-Web-Config ist bereits im Repo.

## Ist-Zustand (Analyse des Leads)
- Dateien: `index.html` (Landing, 747 Z.), `game.html` (Hauptspiel, ~10.600 Z., enthält CSS + HTML + Logik + Fragen), `multiplayer.html` (1019 Z., Socket.io-Client), `premium.html` (484 Z.), `server.js` (Express + Socket.io, Räume, Buzzer-Modus), `sw.js` (Service Worker, Cache `mineguess-v2`, cache-first → kann nach Deploys veraltete Dateien ausliefern), `questions.json` (150 Fragen, Typen `number` und `entity`, Felder `question`, `answer`, `unit`, `tolerance`, `acceptedAnswers`, `category`, `funFact`).
- **`server.js` liest die Fragen per Regex aus `game.html`** (`const questions = [...]`). Das ist fragil: jede Änderung am Format bricht den Multiplayer. `questions.json` und `game.html` können auseinanderlaufen. Backend prüft das und löst es robust (ohne Verhalten zu ändern).
- Multiplayer (server.js): max. 8 Spieler, 10 Runden, Buzzer 30 s, Antwort 15 s, Ergebnis 6 s, 150 Punkte + 50 Speedbonus, öffentliche/private Räume mit Passwort, Premium-Kategoriefilter. Events: `create_room`, `join_room`, `get_public_rooms`, `player_ready`, `buzz`, `submit_answer`, `continue_game`, `disconnect`.
- Auth/Daten: Firebase Auth (Google) + Firestore, Gastmodus möglich. Hosting: Render (Node-Server liefert auch die statischen Dateien).
- Repo-Hinweise: `node_modules/` ist versehentlich im Git getrackt, es gibt keine `.gitignore`. Nicht anfassen, nur melden.
- Umlaute: `questions.json` muss UTF-8 bleiben (Windows-Konsole zeigt sie sonst kaputt an, das ist nur Anzeige).

## Design-Leitplanken (Auftraggeber findet das aktuelle Design "KI-generiert und zu viel")
**Vermeiden:** Verläufe überall, Glow/Neon, Glassmorphism, Emoji-Überladung, zu viele verschiedene Karten-Stile, Dauer-Animationen, Partikel ohne Zweck, generische SaaS-Optik, riesige Schatten.
**Anstreben:** ruhig, klar, flach, wenige Farben (Minecraft-Erdtöne/Grün/Stein), eine konsequente Typo, pixelige Akzente nur sparsam (Rahmen, Buttons), große Touch-Ziele, hoher Kontrast, klare Hierarchie. Animationen kurz (120–250 ms), mit Zweck (Feedback, Zustandswechsel), `prefers-reduced-motion` respektieren.
**Plattform:** Mobile-first. Prüfe 360×640, 390×844, 768×1024, 1280×720, 1920×1080. Kein horizontales Scrollen, Safe-Areas beachten, Eingabefelder ≥16 px (kein iOS-Zoom), Buttons ≥44 px.
**Barrierefreiheit:** Fokus sichtbar, Kontrast WCAG AA, Tastaturbedienung, sinnvolle Labels/ARIA, Farbe nie als einziger Informationsträger.

## Arbeitsablauf
1. **forscher** liefert früh (Ziel: erste Version zügig, dann verfeinern) `docs/team/DESIGN-BRIEF.md`: Muster aus Webgames wie Skribbl.io, Gartic Phone, Among-Us-/Imposter-Partyspielen, Kahoot, GeoGuessr, Wordle (Lobby, Raumcode, Spielerliste, Timer, Buzzer-Feedback, Ergebnis-/Endscreen, Mobile-Layout), Premium-Konzepte (was ist fair, was nervt) und konkrete, umsetzbare Empfehlungen (Farben, Typo, Komponenten, Animationen) – **und ein Vorschlag, wie Premium hier dezent wirken kann**.
2. **backend**: Bugs finden/fixen, Fragen-Pipeline robust machen, neue Fragen (schwer + lustig, Quelle de.minecraft.wiki) ergänzen, Skin-Kopf-Schnittstelle, Multiplayer-Stabilität (Reconnect, Leerräume aufräumen, doppelte Namen, Eingabevalidierung). Neue Fragen mit `funFact`, korrekten `acceptedAnswers`, Duplikatcheck.
3. **frontend**: Neues Design nach DESIGN-BRIEF umsetzen, Animationen, Mobile/Desktop, Visual Bugs, `impressum.html` + `datenschutz.html` (mit Platzhaltern `[NAME]`, `[ANSCHRIFT]`, `[E-MAIL]`, die der Auftraggeber ausfüllt – nichts erfinden), Footer-Links, Skin-Upload-UI (nur Kopf).
4. **tester**: Baseline-Bugliste des Ist-Zustands früh erstellen, dann jede Lieferung testen (Solo, Blitz/Daily/Joker, Multiplayer mit ≥3 Clients, Mobile-Viewports, Reconnect, Edge Cases, Konsolenfehler). Fehler an den Owner melden, Fix abwarten, erneut testen.
5. Abschluss: tester meldet dem Lead "freigabereif" mit Bericht in `docs/team/TEST-REPORT.md`. Der Lead zeigt es auf localhost; Push erst nach Bestätigung des Auftraggebers.

## Lokal starten
`npm install` (falls nötig), dann `node server.js` → http://localhost:3000 (Port ggf. in `server.js` prüfen). Nur eine Server-Instanz gleichzeitig: der **tester** besitzt den Server-Prozess; andere melden ihm, wenn ein Neustart nötig ist.
