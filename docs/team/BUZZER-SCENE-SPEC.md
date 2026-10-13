# BUZZER-SCENE-SPEC (forscher, Runde 3)

Für frontend. Koordinaten: Einheiten = Skin-Pixel (1 Einheit = 1 Pixel der 64x64-Skin-Textur). Figur ist 32 Einheiten hoch. Y nach oben. Alle Winkel in Grad.

## 0. Assets (liegen bereit)
- `assets/mc/entity/player/wide/{alex,ari,efe,kai,makena,noor,steve,sunny,zuri}.png` und `.../slim/<gleiche Namen>.png`, jeweils 64x64 RGBA, unverändert aus dem Vanilla-Client (1.21.11). Wichtig: **Steve = wide/steve.png, Alex = slim/alex.png**. (Im Spiel ist jeder Standardskin in beiden Armbreiten vorhanden; für die Charakter-Wahl reichen `wide/steve.png` und `slim/alex.png`.)
- `assets/mc/block/scaffolding_{top,side,bottom}.png` (16x16) für den Tisch.
- Alle weiteren Texturen: `docs/team/TEXTURE-MAP.json`.

## 1. Modell: Körperteile (Java-Spielermodell)

Maße B×H×T in Einheiten. Positionen relativ zu Figurmitte am Boden (0,0,0), Blickrichtung der Figur = −Z (vorne).

| Teil | Box | Mittelpunkt (x,y,z) | Pivot (Drehpunkt) |
|---|---|---|---|
| Beine (je) | 4×12×4 | (±2, 6, 0) | Hüfte (±2, 12, 0) |
| Körper | 8×12×4 | (0, 18, 0) | (0, 24, 0) oben Mitte (für Lehnen: Hüfte (0,12,0)) |
| Kopf | 8×8×8 | (0, 28, 0) | Nacken (0, 24, 0) |
| Arme wide (je) | 4×12×4 | (±6, 18, 0) | Schulter (±6, 22, 0) |
| Arme slim (je) | 3×12×4 | (±5.5, 18, 0) | Schulter (±5.5, 22, 0) |
| Hut / Jacke / Ärmel / Hosen (Overlay) | gleiche Box + Aufblähung | wie Basisteil | wie Basisteil |

Aufblähung (Overlay-Box ist an allen Seiten größer): Hut +0,5 (Faktor 1,125 auf 8 = 9×9×9), Jacke/Ärmel/Hosen +0,25 (Körper 8,5×12,5×4,5). Overlay immer **zusätzlich** zur Basis zeichnen, mit Alpha-Test (alpha < 0,5 verwerfen, besser: Alpha-Blend nach Basis).

Hinweis: Rechter Arm/Bein = Figur-rechts. Von vorne gesehen liegt Figur-rechts links im Bild, deshalb steht beim rechten Arm x = −6.

## 2. UV-Tabelle (64×64, Pixelkoordinaten x,y Breite×Höhe)

Gesetz für jede Box (Ursprung u,v; Breite B, Höhe H, Tiefe T):
oben = (u+T, v, B, T), unten = (u+T+B, v, B, T), rechts = (u, v+T, T, H), vorne = (u+T, v+T, B, H), links = (u+T+B, v+T, T, H), hinten = (u+2T+B, v+T, B, H).
Die Tabelle ist daraus berechnet.

| Teil | Ursprung (u,v) | Maße B×H×T | oben | unten | rechts | vorne | links | hinten |
|---|---|---|---|---|---|---|---|---|
| Kopf | 0,0 | 8×8×8 | 8,0 8x8 | 16,0 8x8 | 0,8 8x8 | 8,8 8x8 | 16,8 8x8 | 24,8 8x8 |
| Hut (Overlay) | 32,0 | 8×8×8 | 40,0 8x8 | 48,0 8x8 | 32,8 8x8 | 40,8 8x8 | 48,8 8x8 | 56,8 8x8 |
| Körper | 16,16 | 8×12×4 | 20,16 8x4 | 28,16 8x4 | 16,20 4x12 | 20,20 8x12 | 28,20 4x12 | 32,20 8x12 |
| Jacke (Overlay) | 16,32 | 8×12×4 | 20,32 8x4 | 28,32 8x4 | 16,36 4x12 | 20,36 8x12 | 28,36 4x12 | 32,36 8x12 |
| Rechter Arm wide | 40,16 | 4×12×4 | 44,16 4x4 | 48,16 4x4 | 40,20 4x12 | 44,20 4x12 | 48,20 4x12 | 52,20 4x12 |
| Rechter Arm slim | 40,16 | 3×12×4 | 44,16 3x4 | 47,16 3x4 | 40,20 4x12 | 44,20 3x12 | 47,20 4x12 | 51,20 3x12 |
| Rechter Ärmel wide | 40,32 | 4×12×4 | 44,32 4x4 | 48,32 4x4 | 40,36 4x12 | 44,36 4x12 | 48,36 4x12 | 52,36 4x12 |
| Rechter Ärmel slim | 40,32 | 3×12×4 | 44,32 3x4 | 47,32 3x4 | 40,36 4x12 | 44,36 3x12 | 47,36 4x12 | 51,36 3x12 |
| Linker Arm wide | 32,48 | 4×12×4 | 36,48 4x4 | 40,48 4x4 | 32,52 4x12 | 36,52 4x12 | 40,52 4x12 | 44,52 4x12 |
| Linker Arm slim | 32,48 | 3×12×4 | 36,48 3x4 | 39,48 3x4 | 32,52 4x12 | 36,52 3x12 | 39,52 4x12 | 43,52 3x12 |
| Linker Ärmel wide | 48,48 | 4×12×4 | 52,48 4x4 | 56,48 4x4 | 48,52 4x12 | 52,52 4x12 | 56,52 4x12 | 60,52 4x12 |
| Linker Ärmel slim | 48,48 | 3×12×4 | 52,48 3x4 | 55,48 3x4 | 48,52 4x12 | 52,52 3x12 | 55,52 4x12 | 59,52 3x12 |
| Rechtes Bein | 0,16 | 4×12×4 | 4,16 4x4 | 8,16 4x4 | 0,20 4x12 | 4,20 4x12 | 8,20 4x12 | 12,20 4x12 |
| Rechte Hose | 0,32 | 4×12×4 | 4,32 4x4 | 8,32 4x4 | 0,36 4x12 | 4,36 4x12 | 8,36 4x12 | 12,36 4x12 |
| Linkes Bein | 16,48 | 4×12×4 | 20,48 4x4 | 24,48 4x4 | 16,52 4x12 | 20,52 4x12 | 24,52 4x12 | 28,52 4x12 |
| Linke Hose | 0,48 | 4×12×4 | 4,48 4x4 | 8,48 4x4 | 0,52 4x12 | 4,52 4x12 | 8,52 4x12 | 12,52 4x12 |

Orientierung innerhalb der Rechtecke: **vorne/hinten/rechts/links** stehen aufrecht (obere Kante der Textur = obere Kante der Fläche). **oben**: untere Kante des Rechtecks liegt an der Vorderkante der Box (dort, wo vorne anschließt). **unten** ist vertikal gespiegelt gegenüber oben (wird bei der Kamera von oben nicht gesehen, darf per Backface-Culling entfallen).

Mit "rechts"/"links" ist die Seite der Figur gemeint (rechts = Figur-rechts, wird von vorne gesehen links im Bild).

Kopf-Chip (Listen/Avatare): `Kopf vorne (8,8,8,8)` zeichnen, darüber `Hut vorne (40,8,8,8)` mit Alpha. Auf 32 px mit `image-rendering: pixelated` hochskalieren (Faktor 4).

## 3. Slim-Erkennung

Gilt für 64×64: Skin ist **slim**, wenn das Rechteck x = 54..55, y = 20..31 vollständig alpha = 0 ist (beim breiten Arm liegt dort die Rückseite des rechten Arms: Hinten-Fläche x=52..55). Sicherer zusätzlicher Test: linker Arm x = 46..47, y = 52..63 (ebenfalls komplett transparent bei slim). Beides geprüft an allen 18 mitgelieferten Skins: wide erkannt als wide, slim als slim. Ist der Skin 64×32: immer wide (das alte Format hat nur 4-breite Arme).
Bei slim gelten die Arm-/Ärmel-UVs mit B = 3 (Tabelle oben, "slim").

## 4. 64×32 → 64×64 (Legacy)

1. Neues 64×64-Canvas (transparent), alten Skin an (0,0) kopieren.
2. **Hut-Hack:** Wenn im Bereich (32,0)-(63,15) *kein* Pixel mit alpha < 128 existiert, ist der Hut-Layer nur eine undurchsichtige Fläche (Altskin): alle Pixel dieses Bereichs auf alpha = 0 setzen (Vanilla macht genau das). Overlays für Körper/Arme/Beine gibt es im 64×32-Format nicht.
3. Linke Gliedmaßen aus den rechten **horizontal spiegeln** (jedes Rechteck für sich mirrored kopieren, die Seitenflächen tauschen den Platz):

| Quelle (alt) | Ziel (neu) | Größe | Teil |
|---|---|---|---|
| (4,16) | (20,48) | 4×4 | Bein oben |
| (8,16) | (24,48) | 4×4 | Bein unten |
| (8,20) | (16,52) | 4×12 | Bein rechts (aus altem links) |
| (4,20) | (20,52) | 4×12 | Bein vorne |
| (0,20) | (24,52) | 4×12 | Bein links (aus altem rechts) |
| (12,20) | (28,52) | 4×12 | Bein hinten |
| (44,16) | (36,48) | 4×4 | Arm oben |
| (48,16) | (40,48) | 4×4 | Arm unten |
| (48,20) | (32,52) | 4×12 | Arm rechts (aus altem links) |
| (44,20) | (36,52) | 4×12 | Arm vorne |
| (40,20) | (40,52) | 4×12 | Arm links (aus altem rechts) |
| (52,20) | (44,52) | 4×12 | Arm hinten |

Jedes Rechteck beim Kopieren **spiegeln** (x → B−1−x). Ergebnis ist ein regulärer 64×64-wide-Skin. Server und Client sollten dieselbe Konvertierung kennen: der Client konvertiert vor dem Rendern (Canvas 2D `drawImage` mit `scale(-1,1)`), der Server prüft nur die Datei (64×64 oder 64×32).

## 5. Posen und Keyframes

Winkel um den jeweiligen Pivot, Rotation X: **negativ = Arm nach vorne/oben**, positiv = nach hinten. Y-Rotation des Kopfes positiv = Blick nach links der Figur. Z-Rotation positiv = Arm seitlich nach außen (rechter Arm) bzw. Kopf kippt nach rechts. Easing wenn nicht anders genannt: `cubic-bezier(.2,.8,.2,1)` (out); Loops `ease-in-out`.

Alle Figuren schauen zum Buzzer (Kopf-Yaw zur Tischmitte, 0° wenn Figur direkt gegenüber). Zeit t in ms ab Pose-Start.

### 5.1 idle (Loop, dauerhaft, alle Figuren)
Nach Vanilla-Werten (Tick = 50 ms):
- Rechter Arm: rotZ = 2.9° + 2.9°·cos(2π·t/3490), rotX = 2.9°·sin(2π·t/4690).
- Linker Arm: rotZ = −(2.9° + 2.9°·cos(2π·t/3490)), rotX = −2.9°·sin(2π·t/4690).
- Atmung: Körper scaleY 1 → 1.012 → 1 (Periode 3200 ms), Kopf y +0.15.
- Blick: Kopf-Yaw zum Buzzer; alle 3–6 s zufällig 400 ms leichtes Wegschauen ±8°.
Alle Figuren starten mit zufälligem Phasenversatz (0–3500 ms).

### 5.2 buzz / klicken (520 ms, einmalig, rechter Arm)
| t (ms) | rechter Arm rotX | Körper rotX (Lehnen) | Kopf rotX | Buzzer Y |
|---|---|---|---|---|
| 0 | idle | 0° | 0° | 0 |
| 140 | −60° (Ausholen) | +3° | +4° | 0 |
| 230 | −100° (Treffer, Hand auf Buzzer) | +8° | +8° | −2 |
| 330 | −100° (Halten) | +8° | +8° | −2 |
| 520 | idle | 0° | 0° | 0 (ease-out 120 ms) |
Zusätzlich bei 230 ms: Buzzer-Oberseite 160 ms heller (Farbwechsel kurz), optional Klick-Sound bei 230 ms.
Nach 520 ms **nahtlos** in `denken` (5.3) übergehen, wenn keine Antwort da ist.

### 5.3 denken (Loop bis `answer_given`, `typing` hält die Pose aktiv)
Einblendung 400 ms:
- Kopf: rotZ 0° → +10°, rotX 0° → −6° (Blick leicht nach oben).
- Rechter Arm: rotX −100° → −115°, rotY 0° → −25° (Hand Richtung Kinn).
Loop (period 1800 ms, ease-in-out): Kopf rotZ 10° ↔ 6°, Arm rotX −115° ↔ −108° (Tippen). Körper bleibt in idle. Linker Arm idle.
Sprechblase zeigt `…`: drei Punkte, jeder Punkt Opazität .3 → 1 → .3 (Periode 1200 ms, Versatz 200 ms).
Für den Ausstieg 200 ms zurück zu idle bzw. direkt in `richtig`/`falsch`.

### 5.4 richtig (1400 ms)
| t (ms) | Beide Arme rotX | Arme rotZ (außen) | Figur y | Kopf rotX |
|---|---|---|---|---|
| 0 | idle | idle | 0 | 0° |
| 160 | −165° | ±15° | +5 | −10° |
| 320 | −165° | ±15° | 0 | −10° |
| 480 | −170° | ±20° | +5 | −10° |
| 640 | −165° | ±15° | 0 | −10° |
| 1000 | −165° (Halten) | ±15° | 0 | −6° |
| 1400 | idle | idle | 0 | 0° |
Zwei Hüpfer, Landung mit ease-in (140 ms), Sprechblase wird grün (Rand `--grass`), Punkte "+150" schweben 700 ms nach oben (translateY −24, opacity 1→0).

### 5.5 falsch (1200 ms)
| t (ms) | Kopf rotY | Kopf rotX | Körper rotX | Arme rotX / rotZ |
|---|---|---|---|---|
| 0 | 0° | 0° | 0° | idle |
| 120 | −18° | +6° | +4° | +6° / ±3° |
| 240 | +18° | +10° | +7° | +8° / ±3° |
| 360 | −12° | +14° | +10° | +10° / ±3° |
| 480 | +10° | +18° | +10° | +10° / ±3° |
| 600 | 0° | +20° | +10° | +10° / ±3° |
| 1000 | 0° | +20° | +10° | halten |
| 1200 | 0° | 0° | 0° | idle |
Sprechblase bekommt roten Rand, Punkte "−50" in `--red`. Bei Zeitüberschreitung gleiche Pose, aber nur Kopf nach unten (kein Kopfschütteln), Blasentext "Zeit abgelaufen".

### 5.6 getrennt (statischer Zustand)
Wie Ende von `falsch` (Kopf nach unten +20°, Körper +10°), Opazität .45, Graustufen (`saturate(0)` nur falls WebGL: Shader-Faktor 0.3), Name mit "getrennt". Keine Idle-Animation.

### 5.7 Reduced Motion
Keine Keyframes: Figuren stehen in einer statischen Pose (idle bei t=0), `denken` = Kopf rotZ 8° ohne Bewegung, `richtig` = beide Arme −165° statisch, `falsch` = Kopf +20° statisch, Buzzer ändert nur Farbe. Sprechblase erscheint ohne Skalierung.

## 6. Tisch (Scaffolding) und Buzzer

Tisch = Vanilla-Scaffolding-Form (Platte oben, vier Pfosten), **Skalierung 1.5**:
- Platte: 24×3×24, Oberkante bei y = 21. Oben `scaffolding_top` (16x16 auf 24x24 gestreckt, pixelated), Seiten `scaffolding_side`, Unterseite `scaffolding_bottom` (unsichtbar, darf entfallen).
- Pfosten: 3×18×3 an den vier Ecken, `scaffolding_side` (Streifen), Höhe 0–18.
- Buzzer: Zylinder Radius 5, Höhe 3, auf (0,21,0). Körper rot `#D40000`, Kante/Ring grau `#A8A8AE`, Sockel `#2A2A2A`; gedrückt −2 Einheiten in Y. 12-Eck-Zylinder reicht (WebGL) oder CSS-Ellipse-Stapel.
- Figurabstand: Mittelpunkt der Figur 17 Einheiten von der Tischmitte; Hand erreicht bei rotX −100° die Buzzer-Oberkante.

## 7. Szenenlayout

Kamera: leicht von oben, Pitch 20°, FOV 28° (WebGL) bzw. `perspective: 900px; rotateX(-20deg)` (CSS), Szene zentriert. Figuren stehen auf Ellipse um den Tisch, schauen zur Mitte, Reihenfolge nach Beitrittsreihenfolge, **eigene Figur immer vorne links** (Slot 0), damit "du" konstant am gleichen Platz ist.

Slots (Winkel auf der Ellipse, 0° = rechts, 90° = hinten, 180° = links, 270° = vorne; Ellipse rx = 38, ry = 17 Einheiten Abstand vom Tisch):
| Spieler | Winkel der Figuren |
|---|---|
| 2 | 200°, 340° |
| 3 | 200°, 340°, 90° |
| 4 | 200°, 340°, 135°, 45° |
| 5 | 205°, 335°, 140°, 40°, 90° |
| 6 | 210°, 330°, 150°, 30°, 110°, 70° |
| 7 | 215°, 325°, 155°, 25°, 125°, 55°, 90° |
| 8 | 215°, 325°, 160°, 20°, 135°, 45°, 110°, 70° |
(vorne mittig, 270°, bleibt frei, damit der Tisch und Buzzer nicht verdeckt werden). Zeichenreihenfolge: nach Tiefe sortieren (hinten zuerst).

Größen:
- Desktop (≥ 900 px Breite, Szene ca. 720×420): Pixel pro Einheit k = 6 (Figur 192 px hoch) bei ≤ 4 Spielern, k = 4,5 bei 5–8. Aktiver Spieler (buzzert/antwortet) ×1.25 und `z-index` vorne.
- Mobile (360×640, Szene ca. 340×260 über dem Antwortfeld): k = 3,2 bei ≤ 4, k = 2,2 bei 5–8 (Figur ca. 70 px). Aktiver Spieler ×1.5, wandert per 250 ms Translate etwas Richtung Bildmitte. Eigenen Buzz-Button als große HTML-Taste unter der Szene (volle Breite, mindestens 30 vh hoch), nicht in die 3D-Szene legen.
- Namen: DOM-Label unter den Füßen, 12 px, ellipsis nach 10 Zeichen, "du" in Blau, Premium-Stern in Gold.
- Punkte-Chips bleiben in der Spielerliste (Seitenleiste/Ausklapp auf Mobile), nicht in der Szene.

## 8. Sprechblase

Referenz: `docs/team/ref/konzept-sprechblase.png` (weiße Ellipse mit schwarzem Rand, Text "Die Antwort ist 10!").
- DOM-Element über der Szene, per `getBoundingClientRect` oder projizierter Kopfposition + 6 px über dem Kopf.
- Füllung `#FFFFFF`, Text `#1D1F1A` (Kontrast 16,6), Rand 2 px `#1D1F1A`, Radius 18 px (Ellipsenform nur bei kurzem Text, sonst abgerundetes Rechteck), kleiner Schwanz 10 px zur Figur, Hartschatten 3 px links unten in `#1D1F1A` wie im Konzeptbild.
- Schrift: UI-Font 700, 15 px Mobile / 17 px Desktop, `max-width`: 220 px (Mobile 70 % der Szene), Zeilenumbruch, max. 3 Zeilen, Text auf 40 Zeichen vom Server gekürzt, immer `textContent`.
- Inhalte: Denken "…" (drei Punkte animiert), Antwort "Die Antwort ist <Text>!", Timeout "Zeit abgelaufen", Verbindungsverlust keiner.
- Animation: einblenden 160 ms (scale .85→1, opacity 0→1, Ursprung am Schwanz), Ausblenden 200 ms, Verweildauer nach Ergebnis 1500 ms. Stapelung: pro Figur nur eine Blase; mehrere gleichzeitige Blasen vermeiden, da im Buzzer-Modus nur einer antwortet.
- A11y: `role="status"` / `aria-live="polite"` in einem versteckten Textbereich: "Name antwortet: 10 (richtig)". Blase selbst `aria-hidden="true"`.
- Bei richtig Rand grün (`#6CBF3C`, plus Haken-Icon), bei falsch Rand rot (`#E5604D`, plus Kreuz-Icon); Farbe nie allein.

## 9. Render-Technik: Empfehlung

**Empfehlung: ein eigener WebGL-Mini-Renderer auf einem einzigen `<canvas>`**, DOM nur für Sprechblasen, Namen und Buttons.

| Kriterium | CSS-3D (6 Faces pro Teil) | WebGL (1 Canvas) |
|---|---|---|
| DOM-Aufwand bei 8 Figuren | 8 × (12 Boxen × 6 Faces) = 576 Elemente + Tisch | 1 Canvas |
| Pixelgenaues Nearest-Sampling | über `image-rendering: pixelated` je Face, Safari verhält sich teils anders | `NEAREST` überall identisch |
| Z-Sortierung durchdringender Teile (Arm in Körper) | per Browser, in Safari mit `preserve-3d` fehleranfällig | Tiefenpuffer, exakt |
| Vanilla-Flächenlicht (oben 1.0, vorne/hinten 0.8, Seiten 0.6, unten 0.5) | je Face Overlay nötig | Shader, kostenlos |
| Overlay-Layer mit Alpha | Zusätzliche Faces, Sortierprobleme | Zweiter Pass, sauber |
| Animation 60 fps auf Low-End-Mobile | 576 Faces mit Transform sind machbar, aber Layout/Compositing-Last hoch | 1 Draw-Call pro Teil, ~100 Draw-Calls, unkritisch |
| Aufwand/Code | wenig Code, viel CSS | ca. 250 Zeilen JS, kein Framework nötig (kein three.js, spart 150 KB) |

Gründe: Konstante Qualität auf allen Browsern, korrektes Alpha der Overlay-Layer, echtes Vanilla-Shading (macht den "offiziellen" Look), geringe Last bei 8 Figuren. CSS-3D ist die einfachere Alternative und für 2–4 Spieler ausreichend, bei 8 Figuren auf Mobile aber riskanter.

Umsetzungshinweise:
- Skin als `Texture` mit `NEAREST`, kein Mipmap, `premultipliedAlpha` aus; Überlagerung: erst Basis, dann Overlay (Depth-Write aus, Blend an).
- Skin je Spieler einmal zu Textur hochladen und bei Charakterwechsel ersetzen; Canvas-DPR auf max. 2 begrenzen.
- Renderloop nur laufen lassen, wenn der Tab sichtbar ist (`visibilitychange`) und mindestens eine Figur animiert (sonst alle 500 ms ein Frame für Idle-Atmung, oder Idle als billiger Zustand).
- `webglcontextlost` abfangen, bei Fehler: Fallback auf **2D-Vorderansicht** (Canvas 2D: Kopf+Körper+Arme+Beine als Flächen aus dem Skin zusammengesetzt, ohne Animation) plus Sprechblasen. So bleibt das Spiel bedienbar.
- `prefers-reduced-motion`: Loop aus, nur bei Zustandswechsel ein einzelner Frame.
- Tastatur: Buzzer-Button bleibt das DOM-Element; Leertaste = Buzz. Die Szene ist rein dekorativ (`aria-hidden`), Inhalte laufen über die Live-Region.

## 10. Daten, die die Szene braucht (Abgleich mit backend)
`player_joined`/Snapshot: `id, name, character ('steve'|'alex'), skin (Data-URL | null)`. Skin `null` → `wide/steve.png` bzw. `slim/alex.png` je Charakter-Wahl. Pro Figur: Zustand (`idle|buzzed|thinking|correct|wrong|timeout|disconnected`), Blasentext (≤ 40 Zeichen). Alles weitere ist rein clientseitig.

## 11. Mojang-Richtlinien, ehrliche Kurzeinschätzung (kein Rechtsrat)
Die Richtlinien-Seiten selbst waren für mich nicht abrufbar (Web-Filter), dies beruht auf meinem Kenntnisstand:
- **Privat / nicht öffentlich** (nur du und Freunde, nichts im Netz): unkritisch, Fan-Nutzung der Spielassets fürs Spielen und Basteln ist üblich.
- **Öffentlich, kostenlos, nicht kommerziell:** Fan-Projekte mit Mojang-Assets sind in der Praxis verbreitet und werden geduldet, wenn klar als inoffiziell erkennbar. Voraussetzungen laut Brand Guidelines: kein Mojang-/Minecraft-Logo als eigene Marke, Hinweis "kein offizielles Minecraft-Produkt, nicht von Mojang/Microsoft genehmigt", keine Verwechslungsgefahr, Assets nicht als eigene Bibliothek zum Download anbieten.
- **Kommerziell (Bezahl-Premium, Werbung, Spenden mit Gegenleistung):** Mojangs Richtlinien erlauben Gewinnerzielung mit ihren Assets/Marke nur in eng umrissenen Fällen (z. B. Server nach den Commercial Usage Guidelines, bestimmte Merchandise-Lizenzen). Ein bezahltes Quiz-Premium mit Original-Texturen und Charakteren (Steve/Alex sind markenrechtlich Kernfiguren) gilt als **riskant bis nicht gedeckt**. Mögliche Folgen: Abmahnung/Takedown, im Extremfall Konto/Domain-Meldung.
- Wiki-Fakten stehen unter CC BY-NC-SA: Namensnennung nötig, Weitergabe unter gleicher Lizenz, **keine kommerzielle Nutzung**.
- Wege: (a) reines Fan-Projekt ohne Bezahlfunktion, mit Hinweis und Credits; (b) bei Bezahl-Premium eigene Pixelfiguren/Texturen und eigene Fragetexte; (c) Anfrage an Mojang/Microsoft vor Start. Entscheidung beim Auftraggeber.

## 12. Reporter (Solo, Runde 4)

Referenz `docs/team/ref/reporter-alex.png`: Figur hält mit **beiden Händen** eine Karte (Item "Map") vor Brust und Gesicht. Textur der Karte: `assets/mc/map/map_background.png` (Papier-Hintergrund der Karte, 64x64), alternativ `item/paper.png` (16x16, kleiner) oder `item/filled_map.png`. Karte als flache Platte 14×14×0,3 Einheiten vor der Brust (Mittelpunkt (0, 21, −7) in Figurkoordinaten, leicht nach hinten gekippt rotX −10°).

Szene: Tisch (ohne Glocke) in der Mitte, Spieler links, Reporter gegenüber (rechts, schaut nach links zum Tisch/Spieler). Figurabstand wie Runde 3 (17 Einheiten). Alle Posen mit denselben Pivots/Easings wie §5; Karte ist ein Kind des Körpers, mit den Armen verbunden (beim Armheben folgt die Karte).

| Pose | Dauer | Keyframes |
|---|---|---|
| `report_hold` (Standard, Loop) | 3200 ms | Beide Arme rotX −80°, rotY ±15° nach innen, Ellbogen "gebeugt" durch Armneigung, Karte vor Brust. Atmung wie idle, Kopf hinter Karte leicht auf/ab (rotX ±2° bei 2400 ms) |
| `report_ask` (Frage stellen) | 700 ms | 0: hold; 150: Karte 4 Einheiten nach vorn/unten, Kopf rotX +10° (liest); 400: Kopf rotX −6° (schaut zum Spieler); 700: hold. Sprechblase der Frage erscheint bei 150 ms |
| `report_note` (Notiz schreiben, nach Antwort) | 900 ms | Linker Arm rotX −70° bleibt, rechter Arm: 0–150 ms zur Karte (−95°), dann 4 × kleine Schreibstriche rotZ ±4° im Abstand 120 ms, zurück auf hold bei 900 |
| `report_nod` (richtig) | 700 ms | Kopf rotX 0 → +14° → 0 → +10° → 0 (zweimaliges Nicken), Karte bleibt |
| `report_shake` (falsch) | 800 ms | Kopf rotY −16° → +16° → −10° → +10° → 0, 130 ms je Schritt; Karte leicht nach unten (−2 Einheiten) |
| `report_wait` (Spieler tippt) | Loop 1800 ms | wie hold, Kopf rotZ 4° ↔ 0°, alle 5 s ein Blick auf die Karte (rotX +8° für 500 ms) |

Spielerfigur links: idle (§5.1), beim Tippen `denken` (§5.3, Blasenpunkte), bei richtig `richtig` (§5.4), bei falsch `falsch` (§5.5). Reporter-Auswahl: zufällig Steve (wide) oder Alex (slim) pro Runde, anderer Charakter als der Spieler, falls der Spieler Standard-Steve/-Alex nutzt (§ Round 4).

Karteninhalt: Frage nicht auf die Karte rendern (nicht lesbar auf Mobile), sondern in der Sprechblase über dem Reporter und zusätzlich als DOM-Text; auf der Karte nur Kategorie-Icon und "?" (kleines Textur-Icon aus `docs/team/TEXTURE-MAP.json`). Reduced Motion: statisch `report_hold`, Blase ohne Animation.
Performance: Szene höchstens ca. 35 % der Höhe, Render nur bei Zustandswechsel und währenddessen 60 fps, im Blitz-Modus Idle-Loop auf 15 fps oder statisch.
