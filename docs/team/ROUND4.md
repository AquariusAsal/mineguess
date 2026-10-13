# Runde 4 – Aufgaben vom Auftraggeber

Es gelten weiter BRIEF.md und ROUND3.md (Ownership, nichts committen/pushen, gezielte Edits, logo.svg nicht anfassen, sparsam arbeiten: wenige Screenshots, kurze Berichte, der Auftraggeber hat ein knappes Session-Limit).
Referenzbilder: `docs/team/ref/glocke.png` (Glocke), `docs/team/ref/reporter-alex.png` (Reporter).

## 1. Glocke statt Buzzer (Multiplayer)
- Der rote Buzzer in der Tischmitte wird durch die **offizielle Minecraft-Glocke** ersetzt (Block: zwei Steinpfosten, Balken oben, goldene Glocke hängt darin, siehe glocke.png).
- Beim Buzz **läutet** die Figur die Glocke: die Glocke pendelt sichtbar (wie im Spiel, Schwingen um die Balkenachse, gedämpft ausklingend) und es wird **Ton** abgespielt.
- Ton: `bell-minecraft.mp3` (liegt im Projektstamm, 47 KB). Alle Clients hören den Ton beim `buzzed`-Event, nicht nur der Buzzende. Anforderungen: vorgeladen und dekodiert (WebAudio-Buffer, geringe Latenz), Autoplay-Sperre beachten (Audio beim ersten Nutzerklick freischalten), Lautstärke/Stummschalten über das vorhandene Sound-System (Sound-Button), kein Ton bei reduced-motion irrelevant (Ton bleibt, er hat eigenen Schalter), Datei in sw.js vorcachen.
- Der große BUZZ-Button als Bedienelement bleibt (Leertaste), beschriftet "Läuten" oder ähnlich.
- Modell: aus den offiziellen Texturen (Glocken-Entity-Textur `entity/bell/bell_body.png`, Stein und Holz aus `block/`). Tischgröße-Skalierung aus Runde 3 bleibt, die Glocke bleibt zentral; die Hand muss die Glocke **tatsächlich erreichen** (offener Punkt aus Runde 3: bei großem Tisch erreicht der Arm den Buzzer nicht, bitte lösen: Figur tritt näher oder Arm streckt sich).

## 2. Musik (nur Recherche + Vorschlag, forscher)
- Offizielle Minecraft-Songs, hauptsächlich von **C418** (z. B. "Aria Math", "Sweden", "Wet Hands", "Mice on Venus", "Living Mice", "Subwoofer Lullaby", "Minecraft", "Dry Hands"). Liste mit offiziellem Titel, Album (Volume Alpha/Beta) und Quelle.
- **Keine Musikdateien herunterladen und nicht ins Repo legen** (urheberrechtlich geschützt, Verbreitung ohne Lizenz). Stattdessen: Vorschlag für eine rechtlich saubere Einbindung (offizieller Embed-Player von C418 bzw. Mojang-Kanälen, z. B. YouTube-nocookie oder Bandcamp/Spotify-Embed, nur nach Klick, Datenschutzhinweis nötig) und eine Empfehlung mit Vor-/Nachteilen. Ergebnis in `docs/team/MUSIC-OPTIONS.md`. Der Auftraggeber entscheidet.

## 3. Solo: Reporter-Szene
- In **allen Solo-Modi** (Endlos, Blitz, Daily, Wettkampf/Ranked, Joker, Premium-Kategorien) stellt ein **zufälliger Charakter (Alex oder Steve)** als **Reporter** die Fragen (siehe reporter-alex.png: Figur hält eine Karte/Papier vor sich wie eine Zeitung).
- Szene (WebGL, wiederverwenden: `mg-scene.js`): Tisch in der Mitte, **Spieler links vom Tisch**, **Reporter gegenüber**. **Keine Glocke in Solo** (Tischplatte frei oder mit Papier/Notizbuch). **Im Multiplayer gibt es keinen Reporter.**
- Spielerfigur = gewählter Charakter bzw. hochgeladener Skin (aus dem Spielerprofil). Reporter = zufällig Steve oder Alex pro Spielrunde (nicht gleich dem Spieler, wenn der Spieler Standard-Steve/-Alex ist, sonst frei).
- Ablauf: Reporter "stellt" die Frage (Karte/Sprechblase mit Frage, die Frage steht zusätzlich als normaler Text im DOM für Lesbarkeit/Barrierefreiheit; die Szene ist dekorativ, `aria-hidden`), Spieler tippt, die Antwort erscheint als Sprechblase am Spieler, Reporter reagiert (nicken/Kopfschütteln, Notiz), bei richtig jubelt der Spieler. Kurze, leichte Animationen; reduced-motion = statische Posen.
- Performance: Solo-Timer (Blitz!) dürfen nicht leiden; Szene klein, nur bei Änderung rendern, auf Mobile kompakt (höchstens ~35 % der Höhe), Textfeld/Eingabe nie verdeckt.

## 4. Ranked-Modus (ersetzt Wettkampfmodus und Leaderboard)
Entscheidungen des Leads (Auftraggeber hat nur Ränge und das Prinzip vorgegeben):
- **Ränge:** Copper, Iron, Gold, Diamond, Netherite (Icons: offizielle Barren/Diamant-Texturen `copper_ingot`, `iron_ingot`, `gold_ingot`, `diamond`, `netherite_ingot`). Schwellen (Vorschlag, Backend darf feinjustieren und dokumentiert): Copper 0-999, Iron 1000-1999, Gold 2000-2999, Diamond 3000-3999, Netherite ab 4000. Start-MMR neuer Spieler: 500. Optional Unterstufen I-III je Rang.
- **MMR pro Frage** (Elo-artig, klassisch): jede Frage hat eine **Schwierigkeitswertung** (Frage-Rating, z. B. leicht ~700, mittel ~1700, schwer ~2800, sehr schwer ~3800). Erwartete Trefferchance p = 1 / (1 + 10^((R_frage − MMR_spieler)/400)). Änderung = K * (Ergebnis − p), K ca. 24-32. Folge: **schwere Fragen richtig = viel MMR**, leichte richtig = wenig MMR, leichte falsch = viel Verlust, schwere falsch = wenig Verlust. Zeitbonus (Speed) optional klein. MMR nie unter 0.
- **Fragenauswahl:** im Ranked passend zur MMR-Zone des Spielers (Mix, aber schwerere Fragen bei höherem Rang).
- **Schwierigkeitswerte:** Fragen haben noch kein Feld `difficulty`. Backend ergänzt in `questions.json` ein Feld (z. B. `rating` oder Tier 1-4) per nachvollziehbarer Heuristik (Typ, Größenordnung der Zahl, Toleranz, Kategorie, Antwortlänge, Entity-Seltenheit) und dokumentiert die Regeln; die Werte sind später justierbar.
- **Persistenz:** pro Account (Firestore, `leaderboard`/Nutzerdokument) und lokal als Fallback ("nur auf diesem Gerät" für Gäste, klar beschriftet). Bekannte Grenze: clientseitig manipulierbar (kein Serverkonto möglich); dokumentieren.
- **Leaderboard:** wird zur **Ranked-Rangliste** (nach MMR, Rang-Badge, Rangfortschritt zum nächsten Rang, eigener Platz). Bestehende Tabs/Fallback aus Runde 3 sinnvoll übernehmen. Firestore-Regeln in `docs/team/FIRESTORE-RULES.md` aktualisieren.
- **UI:** nach jeder Frage MMR-Änderung "+37" / "−12" kurz einblenden, Fortschrittsbalken zum nächsten Rang, Aufstieg/Abstieg als kurze, ruhige Zeremonie (Barren-Textur, kein Konfetti-Overkill). Der Rest des bisherigen Wettkampfmodus (Timer, Serie/Streak) bleibt, soweit er zum MMR passt; Backend entscheidet und dokumentiert, wie Streak/Speed zum MMR beitragen.

## Verteilung
- **forscher:** Texturen (Glocke inkl. Entity-Textur, Steine, Balkenholz, Karte `map`/`filled_map`/`paper`, Barren falls noch nicht da) nach `assets/mc/`; `docs/team/MUSIC-OPTIONS.md`; kurze `docs/team/RANKED-SPEC.md` (Elo-/Glicko-Varianten in Quiz-Spielen, K-Faktor, Schwierigkeitskalibrierung, Anti-Frust-Regeln) und Pose-Beschreibung Reporter (Karte halten, Notizen) in `BUZZER-SCENE-SPEC.md` ergänzen. Zügig, frontend/backend warten darauf. Bell-Sound: prüfen, dass `bell-minecraft.mp3` abspielbar ist (Länge, Format).
- **backend:** Ranked-Logik als gemeinsames Modul (wie `answer-check.js`), Frage-Ratings in `questions.json`, Auswahl nach MMR, Persistenz/Leaderboard-Logik, Firestore-Regeln dokumentieren, sw.js (Glocken-mp3 und neue Dateien, Cache-Version über `tools/gen-sw-assets.js`), API-NOTES.md aktualisieren.
- **frontend:** Glocke + Sound + Läute-Animation inkl. erreichbarer Hand, Reporter-Szene in allen Solo-Modi, Ranked-UI (Badges, MMR-Delta, Fortschritt, Rangliste), Musik-UI erst nach Entscheidung des Auftraggebers (nicht umsetzen).
- **tester:** erst nach Lieferungen: Glocke/Ton im Multiplayer mit >=3 Clients (Ton bei allen, Autoplay-Sperre, Mute), Reporter in allen Solo-Modi (Blitz-Timer nicht gestört, Mobile), Ranked-Berechnung (Grenzfälle: MMR 0, Rangwechsel, nie negativ, richtig/falsch an leichten/schweren Fragen), Leaderboard, Regression, Konsole/Netzwerk 0.
