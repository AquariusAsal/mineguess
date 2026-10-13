# BADGES

Daten und Logik: `mg-badges.js` (global `MGBadges`), eingebunden in game.html und (vom Frontend) multiplayer.html. Bestehende Abzeichen (erste 10 Zeilen) bleiben mit unveränderten Bedingungen und IDs gültig.

## Tabelle (34 Abzeichen)
| id | Name | Beschreibung | Bedingung (Datenquelle) | Icon-Textur | Seltenheit |
|---|---|---|---|---|---|
| `first_correct` | Erster Treffer | Erste richtige Antwort | Summe richtiger Antworten (mg_cat_stats) >= 1 | `item/arrow` | common |
| `mob_expert` | Mob-Experte | 20x Mobs korrekt beantwortet | Kategorie Mobs: >= 20 richtig | `item/rotten_flesh` | uncommon |
| `nether_lord` | Nether-Herr | 10x Dimensionen richtig | Dimensionen: >= 10 richtig | `block/netherrack` | uncommon |
| `craft_master` | Handwerksmeister | 15x Crafting richtig | Crafting: >= 15 richtig | `block/crafting_table_front` | uncommon |
| `redstone_guru` | Redstone-Guru | 10x Redstone richtig | Redstone: >= 10 richtig | `item/redstone` | uncommon |
| `potion_master` | Trank-Meister | 10x Tränke richtig | Tränke: >= 10 richtig | `item/potion` | uncommon |
| `blitz_rookie` | Blitz-Neuling | Blitz-Modus gespielt | mg_blitz_games >= 1 | `item/firework_rocket` | common |
| `daily_3` | 3er Streak | 3 Tage tägl. Challenge | Daily-Serie >= 3 Tage | `item/clock_00` | common |
| `daily_7` | 7er Streak | 7 Tage tägl. Challenge | Daily-Serie >= 7 Tage | `item/filled_map` | rare |
| `100_played` | Centurio | 100 Fragen gespielt | mg_stats.played >= 100 (nur angemeldet gezählt) | `item/nether_star` | rare |
| `streak_5` | Heiße Phase | 5 richtige Antworten in Folge | bestStreak >= 5 (richtige Endergebnisse in Folge, alle Solo-Modi) | `item/bread` | common |
| `streak_10` | Lauf | 10 richtige Antworten in Folge | bestStreak >= 10 | `item/cooked_beef` | uncommon |
| `streak_20` | Unaufhaltsam | 20 richtige Antworten in Folge | bestStreak >= 20 | `item/cake` | epic |
| `daily_30` | Monatsserie | 30 Tage tägl. Challenge in Folge | Daily-Serie >= 30 Tage | `item/clock_01` | legendary |
| `answered_100` | Wissbegierig | 100 Fragen beantwortet | Summe beantworteter Fragen (mg_cat_stats.t) >= 100 | `item/book` | common |
| `answered_500` | Bibliothekar | 500 Fragen beantwortet | >= 500 | `item/enchanted_book` | rare |
| `answered_1000` | Archivar | 1000 Fragen beantwortet | >= 1000 | `block/bookshelf` | epic |
| `hard_correct` | Knifflig | Eine sehr schwere Frage (Stufe 4) richtig | Frage mit rating >= 3200 (Tier 4) richtig: hardCorrect >= 1 | `item/diamond_sword` | uncommon |
| `hard_10` | Meisterdenker | 10 sehr schwere Fragen (Stufe 4) richtig | hardCorrect >= 10 | `item/diamond_pickaxe` | epic |
| `all_categories` | Allrounder | In allen Kategorien gespielt | Alle 18 Kategorien mindestens einmal gespielt | `item/map` | rare |
| `blitz_5000` | Blitzschnell | Blitz-Rekord von 5000 Punkten | mg_blitz_best >= 5000 | `item/blaze_powder` | uncommon |
| `blitz_10000` | Gewitter | Blitz-Rekord von 10000 Punkten | mg_blitz_best >= 10000 | `item/blaze_rod` | epic |
| `ranked_first` | Erste Ranked-Partie | Eine Ranked-Partie (10 Fragen) beendet | mg_ranked.games >= 1 (10. Antwort eines Ranked-Laufs) | `item/writable_book` | common |
| `rank_iron` | Eisenrang | Rang Iron erreicht (1000 MMR) | mg_ranked.peak >= 1000 | `item/iron_ingot` | uncommon |
| `rank_gold` | Goldrang | Rang Gold erreicht (2000 MMR) | peak >= 2000 | `item/gold_ingot` | rare |
| `rank_diamond` | Diamantrang | Rang Diamond erreicht (3000 MMR) | peak >= 3000 | `item/diamond` | epic |
| `rank_netherite` | Netherit-Rang | Rang Netherite erreicht (4000 MMR) | peak >= 4000 | `item/netherite_ingot` | legendary |
| `rankup_3` | Aufstiegsserie | 3 Rangaufstiege ohne Abstieg dazwischen | bestRankUpStreak >= 3 (Aufstiege ohne Abstieg dazwischen) | `item/experience_bottle` | epic |
| `perfect_run` | Perfekte Runde | Ranked-Partie mit 10 von 10 richtig | Ranked-Lauf mit 10 von 10 richtig: perfectRuns >= 1 | `item/golden_apple` | rare |
| `mp_round_win` | Rundensieg | Eine Multiplayer-Runde gewonnen | mpRoundWins >= 1 (MP-Runde: Spieler ist in winnerIds) | `item/gold_nugget` | common |
| `mp_game_win` | Tischkönig | Ein Multiplayer-Spiel gewonnen | mpGameWins >= 1 (game_over: Platz 1 bei >= 2 Spielern) | `block/gold_block` | rare |
| `mp_first_exact` | Erster und exakt | Als erster Läutender exakt richtig | mpExactFirst >= 1 (erster Läutender mit exakter Antwort) | `item/bow` | uncommon |
| `mp_closest_win` | Am nächsten dran | Eine Runde durch die kleinste Abweichung gewonnen | mpClosestWins >= 1 (mode closest, Spieler gewinnt) | `item/compass_00` | uncommon |
| `totem_used` | Unsterblich | Ein Totem im Multiplayer eingesetzt | totems >= 1 (totem_result erhalten) | `item/totem_of_undying` | common |

Seltenheiten: common, uncommon, rare, epic, legendary (Frontend: Rahmenfarbe/Label).

## API (`MGBadges`)
- `MGBadges.list`: Array `{id, name, desc, texture, rarity, check(stats)}`. Icon: `texture` ist ein Pfad unter `assets/mc/` (z. B. `item/diamond`), ohne `.png`. Das alte Icon-Mapping `MGIcon.html('badge.' + id)` in mg-icons.js kennt die neuen IDs noch nicht, dort ergänzen oder direkt `texture` nutzen.
- `MGBadges.earned()` -> `Set` freigeschalteter IDs (localStorage `mg_badges`).
- `MGBadges.progress(id)` -> `{value, target}` für Fortschrittsbalken (bei nicht zählbaren Bedingungen 0/1).
- `MGBadges.stats()` -> alle Zählerstände (siehe Datenquellen).
- `MGBadges.record(name, data)` -> speichert Zähler, prüft alle Abzeichen, gibt neue zurück und ruft `MGBadges.onUnlock(badge)` (je 1,5 s versetzt). `MGBadges.check()` prüft nur.
- Persistenz: lokal `mg_badges` + Zähler `mg_bstats`; Cloud: `users/{uid}.badges` (Array der IDs, game.html speichert beim Cloud-Sync und vereinigt beim Laden per `MGBadges.merge`). Zähler (`mg_bstats`) bleiben lokal.

## Ereignisse (record)
| Name | Daten | Aufrufer |
|---|---|---|
| `answer` | `{correct, rating}` | game.html `recordCatStat` (alle Solo-Modi, Endergebnis der Frage) |
| `rank` | `{promoted, demoted}` | game.html `rankedAnswered` |
| `ranked_game` | `{correct, total}` | game.html bei der 10. Ranked-Antwort |
| `mp_round` | `{won, exactFirst, closest}` | **multiplayer.html (Frontend)**: bei `answers_revealed`: `won = winnerIds.includes(myId)`, `exactFirst = firstBuzzerId === myId && meinEintrag.correct`, `closest = mode === 'closest' && won` |
| `mp_game` | `{won}` | **multiplayer.html**: bei `game_over`: `won = scores.length >= 2 && scores[0].id === myId` |
| `totem` | `{}` | **multiplayer.html**: bei `totem_result` |

Frontend (multiplayer.html): `<script src="mg-badges.js"></script>` einbinden, `MGBadges.onUnlock = <Toast-Funktion>` setzen, die Ereignisse oben senden.

## Datenquellen
`mg_cat_stats` (je Kategorie `{c, t}`), `mg_stats`, `mg_blitz_games`, `mg_blitz_best`, `mg_ranked` (`games`, `peak`), `mg_daily_<Datum>` und `mg_bstats` (Serien, hardCorrect, perfectRuns, Rankup-Serie, MP-Zähler, Totems).
