# EMOJI-INVENTORY (frontend)

Stand: Regex-Scan ueber index/game/multiplayer/premium/impressum/datenschutz.html, mg-skin.js, mg.css, server.js, answer-check.js, sw.js, questions.json (Emoji-Bloecke 1F000-1FFFF, 2190-21FF, 2300-23FF, 25A0-25FF, 2600-27BF, 2B00-2BFF).
index.html, premium.html, multiplayer.html, impressum.html, datenschutz.html, mg-skin.js, mg.css, sw.js, answer-check.js: **0 Treffer** (schon bereinigt). Alle uebrigen Treffer stehen in `game.html`.
Wunsch-Texturen sind Java-Edition-IDs (item/ oder block/), 16x16 PNG. "Ersatz" ist der Plan, falls die Textur fehlt.

## game.html (UI-sichtbar)

| Zeile | Zeichen | Bedeutung | Textur-Wunsch | Ersatz |
|---|---|---|---|---|
| 1513, 3200-3210 | ☀ ☾ | Theme-Umschalter | (keine) | Wort "Hell"/"Dunkel" |
| 1514, 3319, 3474 | ♪ | Ton an/aus | block/note_block | Wort "Ton" |
| 1520 | ▾ | Dropdown-Pfeil | (CSS-Dreieck) | CSS |
| 1817 | ❓ | Pfeil-Spalte bei ungueltiger Eingabe | (keine) | "?" |
| 1820, 1829 | 🎉 ✅ | richtig | (keine) | "✓" als Text |
| 1827 | 🌡 | "nah dran" | (keine) | Text entfaellt |
| 1828, 1835 | ⬇ ⬆ | zu hoch / zu niedrig | (keine) | "↓" "↑" |
| 1839 | ❌ | falsch | (keine) | "✗" |
| 1966-1969 | 🟩 ⬜ 🟥 ⬛ | Teilen-Text (Zwischenablage) | (Text) | ■ □ ✗ · |
| 1973 | ⛏ | Teilen-Text Kopf | (Text) | "MineGuess" |
| 2007, 2012, 2026 | ⏱ | Zeit abgelaufen | item/clock | Text |
| 2166 | ✓ | Button "Antworten" | (keine) | Text |
| 2390-2394 | 🧟🧱⚔🛠🔴✨🧪🌀🌲🍎💎🏰🎮⚙📜🗺💀👨‍🌾 | Kategorie-Icons (nicht mehr angezeigt, toter Code) | s. Kategorie-Tabelle | entfernen |
| 2620, 2670 | 🃏 | Joker-Token / Toast | item/totem_of_undying | Wort "Joker" |
| 3221 | ⛏⚔🧱💎🪨❄🌲🍎 | Hintergrund-Regen (deaktiviert, `return` am Anfang) | - | toter Code, entfernen |
| 3398-3407 | 🎯🧟🔥🛠🔴🧪⚡📅🗓💯 | Abzeichen-Icons (10) | s. Abzeichen-Tabelle | Wort/Initiale |

## Kategorie-Icons (Wunsch)
Mobs item/creeper_spawn_egg? Besser: block/creeper_head nicht als Item vorhanden, daher `item/spider_eye`; Bloecke `block/grass_block_side`; Items & Waffen `item/iron_sword`; Crafting `block/crafting_table_front`; Redstone `item/redstone`; Verzauberungen `item/enchanted_book`; Traenke `item/potion`; Dimensionen `block/obsidian`; Biome `item/oak_sapling`; Essen `item/apple`; Erze `item/diamond`; Strukturen `block/stone_bricks`; Gameplay `item/compass_00`; Spielmechanik `item/repeater`; Geschichte `item/book`; Weltgenerierung `item/map`; Hardcore `item/wither_skeleton_skull`? (alt: `item/bone`); Dorfbewohner `item/emerald`.

## Abzeichen-Icons (Wunsch)
first_correct `item/arrow`; mob_expert `item/rotten_flesh`; nether_lord `block/netherrack`; craft_master `block/crafting_table_front`; redstone_guru `item/redstone`; potion_master `item/potion`; blitz_rookie `item/firework_rocket`; daily_3 `item/clock_00`; daily_7 `item/filled_map`; 100_played `item/nether_star`.

## Modus-Karten / sonstiges (neu geplant, bisher textlos)
Endlos `block/grass_block_side`; Wettkampf `item/golden_sword`; Multiplayer `item/ender_eye`; Blitz `item/firework_rocket`; Daily `item/clock_00`; Tipp `item/redstone_torch`? (alt `item/glowstone_dust`); Streak `item/blaze_powder`; Podium Platz 1/2/3 `item/gold_ingot`, `item/iron_ingot`, `item/copper_ingot`; Zeit `item/clock_00`; Joker `item/totem_of_undying`; Ton `block/note_block`.
GUI-Akzente (Rahmen/Hintergrund, gedimmt): `block/dirt`, `block/stone`, `block/oak_planks`, ggf. Slot-Rahmen aus GUI.

## Nicht-Emoji-Unicode (typografisch, bleibt)
| Datei:Zeile | Zeichen | Hinweis |
|---|---|---|
| game.html:1703, server.js:145/534/644 | → | nur Code-Kommentare |
| questions.json:1683, 1809 | → | Text in funFact (backend), typografischer Pfeil, kein Emoji |
