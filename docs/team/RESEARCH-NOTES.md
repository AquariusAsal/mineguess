# RESEARCH-NOTES (forscher)

**Quellenlage, ehrlich:** WebFetch auf die Wikis scheiterte (Zertifikat), per Shell lieferte die Umgebung nur "Web Filter Violation". Die WebSearch lieferte kaum belastbares UX-Material (eine Produktseite, Foren, Mirror-Seiten). Die Beobachtungen unten beruhen daher auf bekanntem Verhalten der Spiele (eigene Kenntnis, Stand Wissensbasis) und sind als Muster zu lesen, nicht als zitierbare Studie. Einzig gestützt durch Suche: Skribbl.io 2 bis 12 Spieler pro Lobby und Privatraum per Code/Link, Gartic Phone mit Link/QR-Einladung und Verwirrung "Lobby-Link vs. Beitritts-Link" (itch.io-Thread), Gartic Phone ohne Punktwertung, mit Abschluss-Playback.

## 1. Muster aus bekannten Webgames

| Spiel | Landing / Eintritt | Lobby / Raumcode | Spielphase | Ergebnis | Übertragbar auf MineGuess |
|---|---|---|---|---|---|
| **Skribbl.io** | Name + Avatar-Würfel (Gesicht aus Teilen, zufällig), ein großer "Play!"-Button, "Create Private Room" daneben | Privatraum teilt Link; Einstellungen (Runden, Zeit) im Raum, Host sieht "Start" | Wortwahl, Chat als Antwortkanal; Spieler, die richtig geraten haben, werden grün markiert; Punkte "+x" fliegen neben dem Namen | Rundenende zeigt das Wort und Punkte pro Spieler, Endscreen mit Podium (Platz 1–3) | Ein Hauptbutton "Spielen", kleiner Avatar neben jedem Namen, Zustand direkt im Chip ("hat geraten" = bei uns "hat gebuzzert") |
| **Kahoot** | Pin-Eingabe als einziges Feld auf der Startseite (`kahoot.it`), Mobile-first | Warteraum mit Spielernamen als Wolke, großer Pin oben, Zähler "x Spieler" | Spieler sehen nur 4 farbige Formen (Antwortfelder), großer Timer-Balken und Countdown-Zahl | Nach der Frage: richtig/falsch Vollfarbe, Punkte, Rang; Podium am Ende | Raum-Code als primäres Feld, riesige Antwortziele am Handy, kurze Ergebnisseite mit Rang. Kahoot-Fehler: bunte Vollflächen (zu laut), nicht übernehmen |
| **Gartic Phone** | Name + Avatar, "Neues Spiel" / Code-Feld | Link/QR, Spielerliste mit Aktivität, Modusauswahl durch Host | Timer-Balken oben, klare Ein-Aufgabe-Screens | Playback der Ketten (Unterhaltungswert statt Punkte) | Einladung per Link/QR; Lobby ohne Konfigurationsüberladung |
| **Spyfall-/Imposter-Webversionen** (spyfall.app, Among-Us-Klone) | Name + Raumcode, Code ist 4–6 Zeichen | Spielerliste mit Bereit-Häkchen, Host startet | Eine Info pro Bildschirm, Rollenkarte; Timer groß und ruhig | Auflösung mit Rollen aller Spieler | Code kurz halten (nicht `epiccreeper42`), Statusmeldung "Warte auf x" statt leerer Bildschirm |
| **GeoGuessr** | Landing hat zwei Wege: Spielen / Anmelden; Spielmodi als schlichte Karten | Duell-Lobby: Gegnersuche mit Fortschritt | Vollbild-Spiel, UI minimal am Rand, Tipp-Button groß unten | Ergebnis mit Entfernung und Punkten, Animation nur beim Wert (Zahl zählt hoch) | Ergebnis als eine große Zahl plus Abweichung, Zahl zählt hoch |
| **Wordle** | Kein Konto, sofort spielen, Anleitung als kurzes Modal (3 Zeilen) | – | Feedback pro Zeile: Flip-Animation, Farbe plus Position | Teilbare Ergebnisgrafik ohne Spoiler | Onboarding als 3-Zeilen-Modal, teilbarer Ergebnistext, Farbe nie allein (Wordle bietet Hochkontrast-Modus) |
| **Quizduell / Trivia-Apps** | Konto-Pflicht, aber Gast schnell möglich | Runden-basiert, Gegnerliste | Frage + 4 Antworten, Timer-Balken | Gesamtübersicht der Runde mit grün/rot-Häkchen | Rundenübersicht am Ende (Frage, deine Antwort, richtige) wäre ein starker Zusatz |

### Gemeinsame Beobachtungen
1. **Ein Weg rein:** Name (optional Avatar) plus ein primärer Button. Alles weitere erst nach dem ersten Klick.
2. **Raumcode kurz, groß, kopierbar,** zusätzlich Link/QR. Nie Passwortzwang als erster Schritt.
3. **Status im Spielerchip,** nicht als separate Meldungsflut.
4. **Timer als Balken** mit Zahl, ruhiger Farbwechsel, kein Blinken.
5. **Ergebnis kurz:** Antwort, Punkte, Rang. Fun-Fact als Nebensatz, nicht als Box mit Titel.
6. **Endscreen:** Platz 1 hervorgehoben, Rest als Liste, "Nochmal" direkt neben Podium. Konfetti kurz und nur für den Sieger.
7. **Animationen sind klein und funktional** (Zahl zählt, Chip wechselt Zustand, Shake bei falsch).
8. **Mobile-first:** Eingabe unten, Aktionen mit Daumen, Zahlenfelder mit `inputmode`.

## 2. Premium-Prinzip: fair, nervig, dezent

| Modell | Beispiel | Wirkung |
|---|---|---|
| Kosmetik / Komfort | Skribbl.io (Avatare, Farben, "Kein Werbung"), Wordle (kostenlos, später NYT-Konto für Archiv) | Wird akzeptiert, weil kein Spielvorteil. Das ist die fairste Variante. |
| Host-Features | Kahoot (mehr Spieler, Berichte, Medienfragen) | Bezahlt wird von Menschen, die das Spiel leiten. Sinnvoll, wenn es Räume gibt. |
| Werbefrei | viele Browsergames | Nur sinnvoll, wenn es Werbung gäbe. Bei uns nicht. |
| Pay-to-win | Punkteboost in Ranglisten | Nervt, zerstört Ranglistenvertrauen. Vermeiden oder klar trennen. |
| Dauerhafte Nagging-Hinweise | Pop-up pro Runde, "Jetzt upgraden" | Nervt, senkt Spielfluss. |
| Falscher Zeitdruck/FOMO | "Nur heute", "Beliebteste Wahl" | Wirkt unseriös, besonders bei nur zwei Plänen. |

**Konsequenzen für MineGuess (Ist-Stand der Stellen):**
- `premium.html`: Hero-Satz "Das ultimative Minecraft-Quiz Erlebnis" und "Climb faster, rank higher" (Englisch), "Beliebteste Wahl" bei 2 Plänen, Glow 50 px beim CTA, "Premium-Channel / Early Access" ohne sichtbare Umsetzung. Ersetzen/kürzen (Details DESIGN-BRIEF §8).
- `game.html` Z. ~1985, 2310 ff.: **1,5x Punkteboost** (`isPremium ? base*1.5`) geht in Blitz, Daily und Endless-Score und damit in die Ranglisten. Das ist Pay-to-win auf geteilten Ranglisten. Funktion bleibt (Regel 1), aber: Boost im Leaderboard kennzeichnen oder getrennt führen, Entscheidung Auftraggeber.
- `game.html` Z. 1637/1641/9573: Stern im Header, Premium-Link in einem Menü im Gold-Ton mit Inline-Hover, Badge "⭐ PREMIUM" mit Hex-Farben pro Stelle: vereinheitlichen (eine Komponente, 12-px-Text in Gold).
- `multiplayer.html` Z. 287–295, 556: der Kategorienfilter zeigt gesperrt einen Kasten mit Schloss, Preis "5€/Monat" und einen Toast "kommt bald! ?premium=1 zum Testen." Entwickler-Parameter im Nutzertext entfernen, Preis aus dem Spielbildschirm nehmen.
- `multiplayer.html` Z. 505–527: Premium wird per URL-Parameter oder `localStorage` gesetzt (`mg_premium`). Jeder kann es sich selbst setzen. **Meldung an backend** (Funktion nicht ändern, aber der Server sollte `premium` nicht dem Client glauben, falls Kategorienfilter ein echtes Feature sein soll).
- `game.html` Z. 9608: `isPremium = !!d.premium` kommt aus Firestore: ok, aber der Client-Wert zählt; Firestore-Regeln müssen verhindern, dass Nutzer `premium` selbst schreiben (an backend/Lead melden, nicht prüfbar von hier).

**Dezent wirken heißt:** ein Zeichen (Gold-Stern), ein Ort für Information (`premium.html`), nie auf Spielbildschirmen mit Preis, keine Sperrkästen, kein Rundenpopup, Vorteile nur in Komfort/Auswahl/Statistik.

## 3. Ist-Analyse der Screens (Auswahl)

- **`index.html`** (747 Z.): Nav mit `backdrop-filter`, Hero mit `radial-gradient`, pulsierender Punkt, Pille mit `text-transform: uppercase`, Stat-Leiste mit "∞", `block-rain-canvas` im Hintergrund, Premium-Section als Pricing-Karte mit Verlauf. Theme-Toggle per `data-theme="light"` (muss bleiben).
- **`game.html`**: Splash-Screen-Block ist zweimal identisch im Markup (Z. ~1400 ff.), Modi mit `--mc`-Farbvariable je Karte, Inline-Styles für Tag-Chips, Unterschied "225+ Fragen" vs. Landing "648" vs. `questions.json` 639. Auth-Modal mit Bezeichner "Gäste haben keinen Leaderboard-Zugang" (klar, behalten).
- **`multiplayer.html`**: Header "BETA"-Chip, Tab-Leiste mit Emoji, `linear-gradient` auf Haupt-Buttons, Ceremony mit mehreren Verläufen, `text-shadow`, Podium-Metallverläufe, Spieleravatar als Kreis mit Gradient (Initiale) – hier greift der neue Kopf-Avatar. `backdrop-filter: blur(14px)` im Game-Over-Overlay.
- Fonts: Inter + Space Mono (index), Space Grotesk + Space Mono (multiplayer): drei Familien.

## 4. UX-Risiken (für tester)
1. Kopieren des Raumcodes fehlt/ist unauffällig; Code per Hand zu tippen ist fehleranfällig (`epiccreeper42`, Groß/Klein).
2. Tastatur auf Mobile: Antwort-Eingabe kann unter der Tastatur verschwinden (Eingabe unten fixiert prüfen).
3. Zeitsynchronität: Timer clientseitig; bei Tab-Wechsel/Standby laufen Zeiten auseinander.
4. Doppeltippen auf Buzzer (iOS-Zoom) und doppelte Buzz-Events.
5. Spieler trennt sich im Ergebnis: Chip muss "getrennt" zeigen, Runde weiterlaufen.
6. Doppelte Namen und sehr lange Namen (Chip-Breite, `ellipsis`).
7. Reduced Motion: Countdown und Confetti.
8. Service Worker (cache-first) liefert alte CSS-Dateien nach dem Redesign aus: bei Tests hart neu laden/Cache-Version heben (backend).
9. Light-Theme-Kontraste nach dem Redesign erneut prüfen.

## 5. Fakten-Recherche (Backend-Zuarbeit)
Siehe `FACTS-CANDIDATES.md` / `facts-candidates.json`. Die Wiki-Seiten waren in der Umgebung nicht erreichbar, Seitennamen in `source` dienen zur Nachprüfung. Zusätzlich dort ein Audit der bestehenden Mob-HP-Fragen.

## 6. Quellen
- Web-Suche (Auszug): Product-Hunt-Eintrag "Game Night Central" (Raumcode-Flow, Selbstbericht), itch.io-Thread zu Gartic Phone ("Lobby-Link vs. Join-Link"), mechanicsofmagic.com (Spielstruktur Skribbl.io/Gartic Phone). Minecraft-Fakten: de.minecraft.wiki (CC BY-NC-SA, Quelle im Impressum/Credits nennen).
- Eigene Kenntnis der Produkte: Skribbl.io, Kahoot, Gartic Phone, Wordle (NYT), GeoGuessr, Spyfall.
