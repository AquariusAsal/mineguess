# Runde 3 – Aufgaben vom Auftraggeber (alle Teammates lesen)

Es gelten weiter alle Regeln aus BRIEF.md (Ownership, nichts committen/pushen, gezielte Edits, Funktionen nur ändern, wo hier ausdrücklich verlangt).
Referenzbilder: `docs/team/ref/konzept-buzzer-scene.png` (Szene) und `docs/team/ref/konzept-sprechblase.png` (Sprechblase "Die Antwort ist 10!").

## A. Bugfixes

| # | Bug / Wunsch | Owner | Anmerkung |
|---|---|---|---|
| A1 | **Endlosmodus: leere Eingabe + "Antworten" gibt mehr Zeit, ohne dass ein Versuch verbraucht wird.** | backend | Ursache vermutlich der "ungültige Eingabe verbraucht keinen Versuch"-Pfad (Timer wird neu gestartet/pausiert). Entscheidung des Leads: leere Eingabe wird ignoriert, der Timer läuft **unverändert weiter** (kein Zeitgewinn, kein Neustart), kurzer Hinweis "Bitte eine Antwort eingeben". Prüfe denselben Pfad in Blitz, Daily, Wettkampf, Joker und Multiplayer (Server: `answer_invalid` darf Timer nicht verlängern). |
| A2 | **Multiplayer: Minuspunkte für falsche Antworten.** | backend (Server), frontend (Anzeige) | Entscheidung des Leads: falsche Antwort = **−50 Punkte**, Gesamtpunktzahl fällt nicht unter 0. Konstante `PTS_WRONG` in server.js. Gilt für Buzzer-Falschantwort und Antwort-Timeout nach Buzz (Timeout: gleiche Strafe). Leere/ungültige Eingabe (answer_invalid) = keine Strafe, aber auch kein Zeitgewinn. Anzeige "−50" im Ergebnis, in der Live-Punkteliste und im Endscreen; in API-NOTES.md dokumentieren. |
| A3 | **Leaderboard: Button im Wettkampf defekt, Leaderboard funktioniert allgemein nicht.** | tester (reproduzieren), backend (Logik/Firestore), frontend (Button/Modal) | Fundstellen: game.html `showLeaderboard`, `loadLeaderboard`, `submitLeaderboard` (Firestore-Collection `leaderboard`), `#btn-leaderboard` (versteckt bis Login), `.btn-ce-lb` im Wettkampf-Endscreen, `#lb-modal`. Gäste haben laut Text keinen Zugang. Finde die echte Ursache (Button-Handler, Sichtbarkeit, Firestore-Regeln/Index, `orderBy` ohne Index, Auth-State, fehlende Felder, Fehler wird verschluckt). Ist es ein Problem der Firestore-Regeln/Konsole des Auftraggebers: exakte Regeln in docs/team/FIRESTORE-RULES.md dokumentieren. Zusätzlich: **lokaler Fallback** (Bestenliste aus localStorage, klar als "nur auf diesem Gerät" beschriftet), damit der Button für Gäste und bei Firestore-Fehler nie tot ist, plus verständliche Fehlermeldung statt leerem Modal. |
| A4 | **Toleranzen bei "Haltbarkeit"-Fragen** (niemand kennt die exakte Zahl). | backend | Betroffen u. a. ids 153, 159, 343-368, 666 (Suche `Haltbarkeit` in questions.json). Vorschlag: relative Toleranz (z. B. ±10 %, bei Werten < 100 mindestens ±5), vom Server und `answer-check.js` identisch ausgewertet (Solo + Multiplayer). Wer nahe dran liegt, bekommt volle Punkte; Anzeige der exakten Zahl im Ergebnis bleibt. Prüfe, ob andere Fragen mit "unmerkbaren" Zahlen (z. B. Blast Resistance, Generierungshöhen, Drop-Chancen in %) dieselbe Behandlung brauchen, und liste sie im BACKEND-FINDINGS.md. |
| A5 | **Premium ohne Werbung.** | frontend | Im Code gibt es aktuell **keine Werbung** (geprüft per grep). Es gibt also nichts zu entfernen. Ergänze auf premium.html "Werbefrei" in der Vorteilsliste und eine Zeile in der Datenschutzerklärung; füge keinen Werbecode hinzu. Wenn du doch Werbeelemente findest (Banner, Platzhalter, externe Skripte), melde das an den Lead. |
| A6 | **Footer-Hinweis zu Mojang-Texturen.** | frontend | Auf allen Seiten im Footer: "Nicht offizielles Minecraft-Produkt. Nicht von Mojang oder Microsoft genehmigt oder mit ihnen verbunden. Minecraft-Texturen und -Namen © Mojang Studios / Microsoft." sowie dieselbe Zeile im Impressum, Credits mit Wiki-Quelle (CC BY-NC-SA). |

## B. Neues System: Buzzer-Szene mit Minecraft-Charakteren (Multiplayer)

**Ziel:** Statt des klassischen Buzzer-Buttons zeigt der Multiplayer eine kleine Szene: ein Tisch (Scaffolding-Optik) mit dem roten Buzzer in der Mitte, die Spielerfiguren stehen darum (siehe Konzeptbild). Beim Buzzen drückt **die Figur dieses Spielers** den Buzzer. Die gegebene Antwort erscheint als **Sprechblase** über der Figur. Dauert die Antwort, macht die Figur eine **Nachdenk-Animation**, die Sprechblase zeigt "…" (drei Punkte).

**Qualität:** hochwertig und "offiziell" wirkend, **kein Spin-off-Look**. Das bedeutet konkret:
- Originale Minecraft-Spielermodell-Proportionen: Kopf 8×8×8, Körper 8×12×4, Arme 4×12×4 (Alex/slim: 3×12×4), Beine 4×12×4 (Einheiten = Skin-Pixel), korrekte UV-Belegung inkl. Overlay-Schicht (Hut, Jacke, Ärmel, Hosen), `image-rendering: pixelated`, keine Glättung.
- Bewegung wie im Spiel: Idle mit leichter Atem-/Armschwung-Bewegung, "Schlag"-Schwung des rechten Arms für den Klick, Kopf folgt dem Blick, Kopfneigen beim Nachdenken (Hand ans Kinn oder Kopf kippt leicht seitlich), Jubeln (beide Arme hoch) bei richtiger Antwort, Kopfschütteln/Zusammensinken bei falscher.
- Saubere Easing-Kurven, 60 fps, nur transform/opacity (GPU), `prefers-reduced-motion` = statische Pose + Sprechblase ohne Bewegung.
- Buzzer drückt sich sichtbar ein (Y-Versatz), Licht-/Farbwechsel kurz, optional ein kurzes Klick-Geräusch per WebAudio (stumm schaltbar; das Spiel hat bereits Sounds, vorhandenes System nutzen).
- Mobile: Szene skaliert; bei vielen Spielern sind die Nicht-Aktiven klein, der aktive Spieler groß und in Reichweite des Daumens. Der eigene Buzz-Button bleibt als großes, gut treffbares Bedienelement (Barrierefreiheit: Tastatur/Space, ARIA-Live für die Sprechblase).

**Skins:** Ganze Skins (nicht nur der Kopf) werden verwendet. Hochgeladene Skins erscheinen in der Szene, Listen/Chips zeigen weiter nur den Kopf (aus demselben Skin). Standard ohne Upload: **Steve** (Charakter-Wahl "Steve") bzw. **Alex** (Wahl "Alex").
- Unterstützt: 64×64 und altes 64×32 (linke Gliedmaßen spiegeln), wide und slim (Erkennung: Armspalte x=54-55, y=20-31 vollständig transparent => slim), Transparenz/Hut-Layer.
- Datenschutz: Skin nur flüchtig im RAM des Servers, wird mit dem Raum gelöscht.

**Charakter-Wahl:** Beim ersten Start des Spielerprofils bzw. nach Account-Erstellung (Google-Login, erster Login) kommt eine Abfrage "Wähle deinen Charakter: **Steve** oder **Alex**" (Auftraggeber nennt es "männlich/weiblich"; formuliere neutral über die Figurennamen, keine Geschlechtsabfrage speichern). Gäste bekommen dieselbe Abfrage beim ersten Spielerprofil/Multiplayer-Start (localStorage). Später im Spielerprofil änderbar. Speichere nur das Feld `character: 'steve' | 'alex'` (bei Account zusätzlich im Nutzerdokument, wenn die vorhandene Firestore-Logik dafür passt, sonst nur lokal).

**Ablauf & Events (Server-Protokoll, Backend entwirft, Frontend implementiert):**
1. `buzz` -> Server vergibt Buzz (Buzzer-Fenster bleibt) und sendet an alle `buzzed { playerId }` -> Client animiert Klick der Figur.
2. Die buzzende Person tippt die Antwort. Optional alle ~1 s `typing { playerId }` (ohne Inhalt) damit alle die Nachdenk-Animation sehen. Rate-Limit beachten.
3. `submit_answer` -> Server sendet an **alle** `answer_given { playerId, text, correct }` (Text bereinigt, max. 40 Zeichen, nie als HTML rendern) -> Sprechblase "Die Antwort ist <text>!" (bei Entity: "Die Antwort ist <text>!", bei Zahl mit Einheit: "Die Antwort ist 10!"), danach grün/rot und Figuren-Reaktion; Punkte (+/−) einblenden.
4. Timeout: Nachdenk-Pose endet, Sprechblase "Zeit abgelaufen", Minuspunkte wie A2.
5. Reconnect/Snapshot: ein später Beitretender bekommt den aktuellen Szenenzustand (wer steht wo, wer hat gebuzzert, Sprechblasentext) im Snapshot.

**Skin-Protokoll:** `skin` ist jetzt der **ganze** Skin (PNG-Data-URL, ≤64×64, Limit auf ca. 16 KB Base64 anheben, IHDR/Signatur weiter strikt prüfen, dekodierbar). Damit der Verkehr klein bleibt, überträgt der Server die Skins **einmalig** (`player_joined` / Snapshot) und danach nur noch IDs; `room_state` trägt keine Skin-Daten mehr. Dokumentation in API-NOTES.md.

## C. Verteilung

- **forscher:** (1) offizielle Steve- und Alex-Skins (`entity/player/wide/steve.png`, `.../slim/alex.png`, alle Standard-Skins falls verfügbar) nach `assets/mc/entity/`; Scaffolding-Texturen (`block/scaffolding_top|side|bottom`) für den Tisch; (2) `docs/team/BUZZER-SCENE-SPEC.md`: Spielermodell-Maße, UV-Tabelle (alle 6 Flächen je Körperteil für wide/slim, Basis + Overlay, 64×64 und 64×32-Konvertierung), Slim-Erkennung, Pose-Definitionen und Keyframe-Zeitleisten in ms (idle, klicken, nachdenken, richtig, falsch, getrennt), Szenenlayout für 2-8 Spieler (Desktop und Mobile), Empfehlung Render-Technik (CSS-3D mit Gesichtern pro Körperteil vs. WebGL/Canvas) mit Performance-Begründung, Sprechblasen-Gestaltung. Zügig liefern, frontend wartet darauf. (3) Antworte zusätzlich kurz und ehrlich im Bericht, was bei Texturen/Charakteren aus Sicht der Mojang-Richtlinien gilt (privat vs. öffentlich, kommerziell), mit Vorbehalt, dass das keine Rechtsberatung ist.
- **backend:** A1, A2 (Server), A3 (Logik/Firestore), A4, Protokoll für B (Events, Skin-Format, Charakter-Feld), API-NOTES.md aktualisieren, sw.js (neue Assets, Cache-Version erhöhen). Antwort-Check-Änderungen in `answer-check.js` identisch für Solo + Server.
- **frontend:** A2 (Anzeige), A3 (Button/Modal/lokaler Fallback-UI), A5, A6, B (Szene, Charakter-Wahl, Spielerprofil mit Ganzkörper-Vorschau, Datenschutz-Update zu Skin/Charakterwahl), alles auf Mobile und Desktop. Solo-Modi bleiben ohne Szene.
- **tester:** A1-A6 zuerst reproduzieren (Baseline in TEST-REPORT.md), dann nach jeder Lieferung verifizieren; für B: mehrere Clients (≥4), alle Skin-Varianten (wide/slim, 64×32, transparent, Overlay, extrem helle/dunkle), Sprechblase mit langen Texten/Sonderzeichen/HTML (XSS), Reconnect mitten in der Szene, FPS/CPU mit 8 Figuren auf Mobile-Emulation, `prefers-reduced-motion`, Tastaturbedienung. Melde "freigabereif" an den Lead.

Reihenfolge: forscher-Spec und backend-Protokoll zuerst (kurz, damit frontend beginnen kann), parallel dazu A-Bugs. Kommuniziert direkt untereinander.
