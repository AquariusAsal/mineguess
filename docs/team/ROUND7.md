# Runde 7 – Aufgaben vom Auftraggeber (backend + frontend)

Regeln wie bisher (BRIEF.md): gezielte Edits, nichts committen, logo.svg nicht anfassen, sparsam arbeiten (knappes Session-Limit), kurze Berichte (max. 8 Zeilen), Doku in API-NOTES.md.

## 1. Solo: 3 Versuche, 15 Sekunden pro Versuch (backend; frontend nur Anzeige)
- In allen Solo-Modi: pro Frage **3 Versuche**, **15 s pro Versuch** (der Timer startet bei jedem neuen Versuch neu). Nach dem 3. Fehlversuch oder Timeout des 3. Versuchs: Auflösung und nächste Frage. Ein Timeout verbraucht den Versuch.
- Leere/ungültige Eingabe: verbraucht weiterhin keinen Versuch und startet den Timer NICHT neu (Fix aus Runde 3 bleibt).
- Ausnahme: **Blitz** behält seine eigene Gesamtzeit-Logik; wenn die Regel dort mit der Blitz-Mechanik kollidiert, Blitz unverändert lassen und das in API-NOTES.md vermerken. Ranked: MMR-Berechnung bleibt, jeder Fehlversuch zählt als falsch (nur das Endergebnis der Frage zählt für MMR, Entscheidung des Backends, dokumentieren).
- Frontend: Anzeige "Versuch 2/3" und der 15-s-Timer.

## 2. Multiplayer-Minuspunkte (backend)
- Minuspunkte (−50, Score nie < 0) bekommt **nur derjenige, der als Erster die Glocke läutet** und dessen Antwort danach nicht zählt (siehe Punkt 5). Alle anderen Spieler bekommen nie Minuspunkte, auch nicht bei falscher Antwort oder Timeout.

## 3. Spotify Mini-Player (frontend)
- Playlist: https://open.spotify.com/playlist/7Js97HGm16FWMfZJVYI1Re (in `spotify-config.js` als Standard eintragen).
- Die Notenblock-Insel wird zum kompakten Mini-Player. Der offizielle Embed erlaubt über die **Spotify iFrame API** (`https://open.spotify.com/embed/iframe-api/v1`, `IFrameAPI.createController`, `togglePlay`, `pause`, `resume`, `seek`, `loadUri`, Event `playback_update`) eigene Bedienelemente für **Wiedergabe/Pause** und Fortschrittsanzeige. Skip und Like sind über den Embed technisch NICHT möglich (nur mit Spotify Web API/Playback SDK, eigener Spotify-App-Client-ID und Spotify-Login mit Premium). Setze daher um: Play/Pause + Fortschritt + "Nächster Titel" soweit die iFrame API es zulässt (z. B. durch `loadUri` mit Track-URIs, falls ermittelbar; sonst ausblenden statt vortäuschen) und lege eine optionale Erweiterung (Client-ID-Konstante in `spotify-config.js`) vor, die nur dokumentiert wird, nicht gebaut. Kein Autoplay, erst nach Klick laden (Datenschutz bleibt). Bei Unmöglichem ehrlich im Bericht benennen.

## 4. Totem (Joker) im Multiplayer (backend + frontend)
- **Genau ein Totem pro Spieler und Session (Raum)**, serverseitig erzwungen (nicht per Client manipulierbar). Einsatz spielt `sounds/totem.mp3` bei dem Spieler (und optional als kurzer Effekt für alle sichtbar: Totem-Textur `item/totem_of_undying.png` über der Figur).
- Wirkung: dieselbe Funktion wie der Joker in Solo (Tipp/Hilfe), soweit sie im Multiplayer fair umsetzbar ist; Backend liest die Solo-Joker-Logik in game.html, bestimmt die passende Multiplayer-Variante (z. B. Entity: zwei falsche Optionen entfernen, Zahl: Bereich eingrenzen), dokumentiert sie und informiert frontend. Einsatz nur nach dem Läuten in der Antwortphase und nur einmal; Anzeige "Totem verfügbar/verbraucht".

## 5. Multiplayer-Wertung "Wer am nächsten liegt" (backend Server, frontend UI)
Die Glocke und der Vorrang des ersten Läutenden bleiben unverändert. Neuer Ablauf bei **Zahlenfragen** (Typ `number`):
1. Erster Läutender antwortet zuerst (Vorrang). Nach dem Läuten dürfen **alle anderen Spieler ebenfalls ihre Antwort eintippen** (Antwortphase, 15 s wie bisher `ANSWER_TIME`); Antworten der anderen sind bis zur Auflösung nicht für alle sichtbar, die Anzeige zeigt nur "hat geantwortet".
2. Auswertung in dieser Reihenfolge:
   a) Antwort des ersten Läutenden ist **exakt richtig** (nach Toleranz): sofort volle Punkte (150 + Speedbonus) an ihn, Runde sofort beendet, die anderen Antworten werden ignoriert ("instant").
   b) Sonst: ist irgendeine Antwort eines anderen Spielers **exakt richtig**: die früheste exakte Antwort bekommt volle Punkte, Runde beendet.
   c) Sonst (nur Annäherungen): der Spieler mit der **kleinsten relativen Abweichung** bekommt **Teilpunkte**, gestaffelt, immer weniger als volle Punkte: Abweichung ≤ 5 % -> 100, ≤ 10 % -> 80, ≤ 20 % -> 60, ≤ 35 % -> 40, größer: keine Punkte (Backend darf die Bänder feinjustieren und dokumentiert sie; bei kleinen Zahlen absolute Mindestabweichung berücksichtigen). Gleichstand: frühere Abgabe gewinnt.
3. Minuspunkte (siehe 2): nur der erste Läutende, und nur wenn seine Antwort **außerhalb des Annäherungsbereichs** liegt (> 35 % Abweichung) bzw. bei Timeout. Liegt er im Annäherungsbereich, aber ein anderer ist näher, gibt es für ihn weder Punkte noch Abzug.
4. **Entity-Fragen** (Typ `entity`): keine Annäherung möglich; Verhalten wie bisher plus: alle dürfen antworten, die früheste richtige Antwort bekommt volle Punkte, der erste Läutende bekommt bei Falschantwort den Abzug.
5. Ergebnis-Event enthält pro Spieler: Antwort, Abweichung, vergebene Punkte, Gewinner; Frontend zeigt bei der Auflösung alle Antworten als Sprechblasen über den Figuren (Gewinner hervorgehoben, Abweichung "±12 %"), danach die Punkte.
- Server-seitige Umsetzung in server.js, Parser/Toleranz über `answer-check.js` (identisch Solo). Dokumentation des Ablaufs, der Events und der Bänder in API-NOTES.md ("Runde 7"), dann frontend informieren.

## Verteilung
- backend: 1, 2, 4 (Server/Logik), 5 (Server), API-NOTES.md, sw.js/gen-sw-assets falls neue Dateien.
- frontend: 1 (Anzeige), 3, 4 (UI + Sound), 5 (UI: Antwortphase für alle, Auflösung mit Sprechblasen).
- Backend zuerst das Protokoll für 4 und 5 in API-NOTES.md schreiben und frontend Bescheid geben.
