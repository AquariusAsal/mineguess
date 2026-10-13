# MUSIC-OPTIONS (forscher, Runde 4)

Nur Recherche und Vorschlag. Keine Audiodateien geladen, keine im Repo. Quellen konnten wegen Web-Filter nicht live geöffnet werden, Zuordnungen aus Kenntnisstand: **vor Verwendung auf der offiziellen Seite prüfen**.

## 1. Titelliste (Komponist C418 = Daniel Rosenfeld)
| Titel | Album | Hinweis |
|---|---|---|
| Minecraft | Minecraft – Volume Alpha (2011) | Titelmusik-Klassiker (Klavier) |
| Sweden | Volume Alpha | meist gespielt im Overworld-Menü |
| Mice on Venus | Volume Alpha | Hauptmenü |
| Living Mice | Volume Alpha | |
| Subwoofer Lullaby | Volume Alpha | |
| Dry Hands | Volume Alpha | |
| Wet Hands | Volume Alpha | |
| Clark | Volume Alpha | |
| Haggstrom | Volume Alpha | |
| Danny | Volume Alpha | |
| Key, Door, Moog City | Volume Alpha | |
| Aria Math | Minecraft – Volume Beta (2013) | |
| Dreiton, Taswell, Beginning | Volume Beta | Zuordnung prüfen |
| Floating Trees, Haunt Muskie, Biome Fest | Volume Beta | Zuordnung prüfen |

Spätere offizielle Soundtracks stammen von weiteren Komponisten (z. B. Lena Raine, Kumi Tanioka, Aaron Cherof, Samuel Åberg). Für diese gelten eigene Kanäle.

## 2. Offizielle Quellen
- C418 Bandcamp (c418.bandcamp.com): Volume Alpha und Volume Beta, Kauf/Stream, **Embed-Player vorhanden** (Teilen -> Einbetten).
- C418 Website (c418.org), Kanäle auf YouTube und Spotify (Künstlerprofil C418).
- Minecraft-Wiki-Seiten "Music" und "C418" nennen Album/Track-Zuordnung (CC BY-NC-SA, nicht kopieren).

## 3. Rechtlich saubere Einbindung
Urheberrecht: Musik ist geschützt, Download/Hosting/Konvertierung ist tabu. Zulässig ist das Einbetten offizieller Player, die der Rechteinhaber selbst anbietet.

| Option | Vorteile | Nachteile / Datenschutz |
|---|---|---|
| A. Nur Link-Buttons "Auf Bandcamp/Spotify/YouTube anhören" (neuer Tab) | Keine Drittanbieter-Requests, kein Consent, rechtlich einfachste Lösung, kein Absturzrisiko | Kein Hören im Spiel |
| B. Click-to-load Embed (Bandcamp-Player) | Hören im Spiel möglich, erst nach Klick wird iframe geladen, Künstler bekommt Plays/Verkäufe | Drittanbieter-Requests nach Klick (IP etc.), Hinweis in Datenschutz nötig, `loading="lazy"`, `sandbox`-Attribut |
| C. Click-to-load YouTube (`youtube-nocookie.com`) | Verbreitet, Mobile gut | YouTube setzt nach Interaktion trotzdem Speicher/Tracking, Werbung möglich, Datenschutzhinweis nötig, Inhalte können von Dritten stammen (nur offizielle C418-Playlist verwenden) |
| D. Click-to-load Spotify-Embed | Bekannt, kompakt | Spotify-Tracker, Vorschau nur 30 s ohne Login, Datenschutzhinweis nötig |
| E. Eigene Hintergrundmusik als mp3 | Volle Kontrolle | **Nicht zulässig** (Lizenz), nur mit lizenzfreier Musik (z. B. CC0) möglich |

**Empfehlung:** A als Standard plus B als "Musik hören (lädt Bandcamp)". Umsetzung: Button "Musik" öffnet kleines Panel mit zwei Zeilen (Titel, Album), Klick lädt erst den iframe; Text darüber: "Beim Laden werden Daten an Bandcamp (USA) übertragen." Ergänzung in der Datenschutzerklärung (Drittanbieter, Zweck, Rechtsgrundlage Einwilligung durch Klick). Kein Autoplay, kein Loop im Hintergrund während Fragen (Aufmerksamkeit, Latenz). Die Glocke (bell-minecraft.mp3) bleibt davon getrennt (siehe Hinweis unten).

## 4. Glocken-Ton
`bell-minecraft.mp3` im Projektstamm: MPEG-1 Layer III, 44,1 kHz, mono, 128 kbit/s, ca. 2,6–3 s, 47 KB, mit ID3-Tag, kein Xing-Header (konstante Bitrate), problemlos per WebAudio `decodeAudioData` abspielbar. Herkunft/Lizenz des Klangs ist unklar (vermutlich aus dem Spiel). Kurzer Soundeffekt, geringe Ausprägung, aber: vor kommerzieller Nutzung klären (siehe Mojang-Einschätzung in BUZZER-SCENE-SPEC.md §11).
