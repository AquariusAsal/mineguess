# FACTS-CANDIDATES

Kandidaten für neue Fragen (60 Stück, davon 30 als lustig/überraschend markiert). Maschinenlesbar: `docs/team/facts-candidates.json` (Felder wie in questions.json, plus `source`, `difficulty`, `funny`, `confidence`).

## Wichtige Hinweise für backend
- **Quelle nicht live geprüft:** de.minecraft.wiki und minecraft.wiki sind von der Netzwerk-Filterregel der Umgebung blockiert (Web Filter Violation / Zertifikat). Alle Fakten stammen aus gesichertem Wissen, `source` nennt die Wiki-Seite zum Gegenprüfen. **Vor Übernahme bitte 1x gegen das Wiki prüfen**, besonders bei `confidence` = mittel/niedrig.
- Texte (Fragen, funFact) sind eigene Formulierungen, nichts kopiert.
- `acceptedAnswers` ergänzen Tippvarianten; Gross/Klein regelt der Server normalerweise schon.
- Duplikatcheck gegen die 150 Fragen in questions.json: questions.json hat inzwischen 639 Einträge (Backend-Erweiterung); gegen diesen Stand wurden 9 Dubletten bereits entfernt (Release 2011, Phantome 3 Tage, Lavaeimer, Diamant-/Goldspitzhacke, Kessel, Wither-Schädel, Kaninchenfuß-Trank, Katzenvarianten). Verbleibend prüfen: Eier-Stapel (Stack 16 existiert für Schneebälle/Enderperlen, Eier nicht).

## Auffälliger Befund in bestehenden Fragen (Audit)
Bei vielen Mob-Fragen 'Wie viele halbe Herzen hat ...' ist die Antwort doppelt so groß wie die Lebenspunkte im Spiel (1 Lebenspunkt = 1 halbes Herz). Wahrscheinlich falsch (laut Java Edition, bitte gegen Wiki prüfen):
| ID | Mob | im questions.json | vermutlich korrekt |
|---|---|---|---|
| 8 | Ghast | 20 | 10 |
| 9 | Witherskelett | 40 | 20 |
| 10 | Wither | 600 | 300 |
| 14 | Iron Golem | 200 | 100 |
| 15 | Ravager | 200 | 100 |
| 16 | Strider | 40 | 20 |
| 17 | Hoglin | 80 | 40 |
| 18 | Hexe | 52 | 26 |
| 21 | Shulker | 60 | 30 |
| 23 | Evoker | 48 | 24 |
| 24 | Biene | 20 | 10 |
| 106 | Axolotl | 28 | 14 |
| 107 | Kamel | 64 | 32 |
| 108 | Ziege | 20 | 10 |
| 109 | Piglin Brute | 100 | 50 |
| 110 | Zoglin | 80 | 40 |
| 130 | Sniffer | 30 | 14 |
Ebenfalls prüfen: ID 118 (Wither-Effekt: 1 Lebenspunkt alle 2 s, nicht pro Sekunde), ID 137 (Wolf zähmen: 'durchschnittlich 3 Knochen' ist zufallsabhängig, 1 von 3 pro Knochen), ID 150 (Bogenreichweite 52 Blöcke ist unklar definiert), ID 26 (Biomanzahl 1.20 prüfen), ID 88 (Frage wirkt unklar formuliert).
Hinweis (Stand 150er-Satz): ID 3-7, 11, 13, 22, 25 (Creeper 20, Zombie 20, Skelett 20, Enderman 40, Blaze 20, Drache 200, Warden 500, Pillager 24, Phantom 20) sind plausibel.

## Kandidaten

| ID | Kat. | Typ | Frage | Antwort (Einheit, Toleranz) | Akzeptiert | Schw. | lustig | Quelle (Wiki-Seite) | Sicherheit |
|---|---|---|---|---|---|---|---|---|---|
| F01 | Spielmechanik | entity | Wie hieß Minecraft in der allerersten Entwicklungsphase, bevor es seinen heutigen Namen bekam? | Cave Game | Cave Game, Cavegame, Cave-Game | 2 | ja | Minecraft | hoch |
| F02 | Spielmechanik | number | In welchem Jahr erschien die allererste öffentliche Testversion von Minecraft? | 2009 Jahr | - | 2 |  | Minecraft | hoch |
| F03 | Spielmechanik | number | Für wie viele Milliarden US-Dollar kaufte Microsoft das Studio Mojang? | 2.5 Milliarden US-Dollar ±0.1 | 2,5, 2.5 | 2 | ja | Mojang_Studios | hoch |
| F04 | Mobs | entity | Aus welchem Mob-Modell entstand der Creeper durch einen Programmierfehler? | Schwein | Schwein, Pig | 1 | ja | Creeper | hoch |
| F05 | Spielmechanik | entity | Wie heißt der zweite offizielle Standard-Skin neben Steve, der in Version 1.8 hinzukam? | Alex | Alex | 1 |  | Skin | hoch |
| F06 | Spielmechanik | number | Wie viele Standard-Skins gibt es seit Version 1.19.3 für Spieler ohne eigenen Skin? | 9 Skins | - | 3 |  | Skin | mittel |
| F07 | Spielmechanik | entity | Unter welchem Künstlernamen veröffentlicht Daniel Rosenfeld die Minecraft-Musik? | C418 | C418, c418 | 2 |  | C418 | hoch |
| F08 | Spielmechanik | entity | Wie lautet der Vorname des Minecraft-Erfinders, den die Community 'Notch' nennt? | Markus | Markus | 1 |  | Markus_Persson | hoch |
| F09 | Spielmechanik | entity | Unter welchem Spielernamen ist Entwickler Jens Bergensten bekannt? | Jeb | Jeb, jeb_, Jeb_ | 2 |  | Jens_Bergensten | hoch |
| F10 | Mobs | entity | Wie muss ein Schaf per Namensschild heißen, damit seine Wolle ständig die Farbe wechselt? | jeb_ | jeb_, jeb | 1 | ja | Schaf | hoch |
| F11 | Mobs | entity | Mit welchem Namen auf dem Namensschild stellt man Mobs auf den Kopf (Name eines Mojang-Entwicklers)? | Dinnerbone | Dinnerbone, Grumm | 1 | ja | Namensschild | hoch |
| F12 | Mobs | entity | Wie muss ein Kaninchen heißen, damit es eine besondere weiße Textur bekommt, die auf ein Haustier zurückgeht? | Toast | Toast | 2 | ja | Kaninchen | hoch |
| F13 | Spielmechanik | entity | Wie heißt die berühmte Spieler-Legende mit leeren, weißen Augen, die laut Mojang nie im Spiel existierte? | Herobrine | Herobrine | 1 | ja | Herobrine | hoch |
| F14 | Mobs | number | Mit welcher Wahrscheinlichkeit (in Prozent) ist ein natürlich gespawntes Schaf rosa? | 0.164 % ±0.05 | 0,164, 0.164 | 3 | ja | Schaf | hoch |
| F15 | Mobs | number | Mit welcher Wahrscheinlichkeit (1 zu ...) ist ein natürlich gespawnter Axolotl blau? | 1200 (1 zu ...) | 1200, 1/1200 | 3 | ja | Axolotl | hoch |
| F16 | Mobs | entity | Welcher Gegenstand auf dem Kopf verhindert, dass Endermen beim Anblick wütend werden? | Kürbis | Kürbis, geschnitzter Kürbis, Kuerbis | 1 | ja | Enderman | hoch |
| F17 | Weltgenerierung | number | Wie viele Obsidiansäulen umgeben die Hauptinsel im End? | 10 Säulen | - | 2 |  | Ender-Drache | hoch |
| F18 | Blöcke | number | Wie viele Eisenblöcke braucht man für ein Leuchtfeuer-Fundament der größten Stufe? | 164 Blöcke | - | 3 |  | Leuchtfeuer | hoch |
| F19 | Mobs | entity | Welches Lebensmittel ist für Papageien tödlich? | Keks | Keks, Cookie, Kekse | 1 | ja | Papagei | hoch |
| F20 | Mobs | entity | Welcher Mob tanzt, wenn in der Nähe eine Jukebox Musik spielt? | Papagei | Papagei, Parrot | 1 | ja | Papagei | hoch |
| F21 | Mobs | number | Wie viel Prozent der Ziegen sind lärmende (Screaming) Ziegen? | 2 % | 2% | 3 | ja | Ziege | mittel |
| F22 | Items | number | Wie viele Haltbarkeitspunkte hat ein Elytra (Flügel)? | 432 Punkte | 432 | 3 |  | Elytra | hoch |
| F23 | Items | entity | Womit repariert man Elytra im Amboss? | Phantommembran | Phantommembran, Phantommembranen, Phantom Membrane | 2 |  | Elytra | hoch |
| F24 | Mobs | entity | Welcher Mob droppt einen Totem der Unsterblichkeit? | Magier | Magier, Evoker, Beschwörer | 1 | ja | Totem_der_Unsterblichkeit | mittel |
| F25 | Mobs | entity | Welcher Mob kann mit etwas Glück einen Dreizack droppen? | Ertrunkener | Ertrunkener, Drowned, Ertrunkene | 2 | ja | Dreizack | hoch |
| F26 | Blöcke | entity | Welche Blume entsteht, wenn ein Wither einen Mob tötet? | Wither-Rose | Wither-Rose, Witherrose, Wither Rose | 2 | ja | Wither-Rose | hoch |
| F27 | Blöcke | number | Wie viele Wasserblöcke kann ein Schwamm maximal aufsaugen? | 65 Blöcke | - | 3 |  | Schwamm | mittel |
| F28 | Blöcke | number | Wie viele Sekunden brennt aktiviertes TNT, bevor es explodiert? | 4 Sekunden | - | 1 |  | TNT | hoch |
| F29 | Spielmechanik | number | Ab welcher Levelstufe zeigt der Amboss im Überlebensmodus 'Zu teuer!' an? | 40 Level | - | 2 | ja | Amboss | hoch |
| F30 | Spielmechanik | number | Wie viele Erfahrungspunkte (insgesamt) benötigt man für Level 30? | 1395 XP | - | 3 |  | Erfahrung | hoch |
| F31 | Items | number | Wie viele Erfahrungspunkte gibt eine Erfahrungsflasche maximal beim Zerbrechen? | 11 XP | 11 | 3 |  | Erfahrungsflasche | hoch |
| F32 | Spielmechanik | number | Wie viele Mondphasen gibt es in Minecraft? | 8 Phasen | - | 1 |  | Mond | hoch |
| F33 | Weltgenerierung | number | Wie viel Prozent aller Chunks sind Slime-Chunks (in der Overworld)? | 10 % | 10% | 3 |  | Slime | hoch |
| F34 | Mobs | entity | Was verwandelt eine rote Pilzkuh in eine braune? | Blitz | Blitz, Blitzschlag | 2 | ja | Pilzkuh | mittel |
| F35 | Mobs | entity | In welchen Mob verwandelt ein Blitz einen Dorfbewohner? | Hexe | Hexe, Witch | 1 | ja | Hexe | hoch |
| F36 | Mobs | entity | Was macht einen Creeper zu einem geladenen Creeper? | Blitz | Blitz, Blitzschlag | 1 |  | Creeper | hoch |
| F37 | Mobs | entity | Auf welchem Schwierigkeitsgrad können Zombies Holztüren aufbrechen? | Schwer | Schwer, Hard, Schwierig | 2 |  | Zombie | hoch |
| F38 | Spielmechanik | number | Wie lange dauert der Effekt 'Schlechtes Omen' in Minuten? | 100 Minuten | - | 3 | ja | Schlechtes_Omen | mittel |
| F39 | Spielmechanik | number | Wie viele Wellen hat ein Raid auf dem Schwierigkeitsgrad Normal? | 5 Wellen | - | 3 |  | Raid | hoch |
| F40 | Spielmechanik | entity | Was explodiert, wenn man im Nether versucht zu schlafen? | Bett | Bett, Betten | 1 | ja | Bett | hoch |
| F41 | Crafting | number | Wie viele Items kann ein Block getrockneter Seetang in einem Ofen schmelzen? | 20 Items | - | 2 | ja | Brennstoff | hoch |
| F42 | Spielmechanik | number | Wie viele Blöcke tief darf man maximal fallen, ohne Fallschaden zu bekommen? | 3 Blöcke | - | 1 |  | Fallschaden | hoch |
| F43 | Spielmechanik | number | Mit wie viel Prozent Wahrscheinlichkeit löst faules Fleisch den Hunger-Effekt aus? | 80 % | 80% | 2 | ja | Faules_Fleisch | hoch |
| F44 | Redstone | number | Wie viele verschiedene Tonhöhen kann ein Notenblock erzeugen? | 25 Töne | - | 3 |  | Notenblock | hoch |
| F45 | Items | number | Wie viele Disc-Fragmente braucht man, um die Schallplatte 'Disc 5' herzustellen? | 9 Fragmente | - | 3 |  | Schallplatte | hoch |
| F46 | Crafting | number | Wie viele Kupferbarren braucht man für ein Fernglas? | 2 Barren | - | 2 |  | Fernglas | hoch |
| F47 | Crafting | number | Wie viele Eimer Milch benötigt man für einen Kuchen? | 3 Eimer | - | 1 |  | Kuchen | hoch |
| F48 | Spielmechanik | number | Wie viele Eier passen in einen Stapel? | 16 Eier | - | 2 |  | Stapel | hoch |
| F49 | Dorfbewohner | number | Wie viele Lamas begleiten einen Fahrenden Händler? | 2 Lamas | - | 1 |  | Fahrender_Händler | hoch |
| F50 | Spielmechanik | number | Mit wie viel Prozent Wahrscheinlichkeit zerbricht ein geworfenes Enderauge? | 20 % | 20% | 3 |  | Enderauge | hoch |
| F51 | Weltgenerierung | entity | Welcher Bereich extrem verzerrten Terrains beginnt bei etwa 12,5 Millionen Blöcken Entfernung? | Far Lands | Far Lands, Farlands, Ferne Lande, Fernes Land | 3 | ja | Far_Lands | hoch |
| F52 | Mobs | number | Wie hoch kann das beste Pferd maximal springen (in Blöcken)? | 5.3 Blöcke ±0.3 | 5,3 | 3 |  | Pferd | mittel |
| F53 | Spielmechanik | entity | Wie hieß die Bedrock Edition für Smartphones ursprünglich? | Pocket Edition | Pocket Edition, Minecraft Pocket Edition, MCPE | 2 |  | Bedrock_Edition | hoch |
| F54 | Mobs | entity | Welcher Mob flieht vor Katzen? | Creeper | Creeper | 1 | ja | Katze | hoch |
| F55 | Dorfbewohner | entity | Welcher Dorfbewohner-Typ in grüner Robe kann keinen Beruf annehmen? | Dummkopf | Dummkopf, Nitwit, Trottel, Dorftrottel, Einfaltspinsel, Tollpatsch | 2 | ja | Dorfbewohner | niedrig: deutschen Begriff im Wiki prüfen |
| F56 | Mobs | entity | Auf welchem Tier reitet ein Baby-Zombie manchmal als sogenannter Reiter? | Huhn | Huhn, Hühnchen, Chicken | 1 | ja | Zombie | mittel |
| F57 | Mobs | number | Wie viele Enderkristalle braucht man, um den Ender-Drachen erneut zu beschwören? | 4 Kristalle | - | 2 |  | Ender-Drache | hoch |
| F58 | Mobs | entity | Welches Item niest ein Baby-Panda manchmal aus? | Schleimball | Schleimball, Schleim, Slimeball | 3 | ja | Panda | mittel |
| F59 | Items | entity | Welches Item droppt der Ender-Drache nur ein einziges Mal beim ersten Kill? | Drachenei | Drachenei, Dragon Egg, Drachen-Ei | 2 | ja | Drachenei | hoch |
| F60 | Mobs | entity | Welches Tier ist unfruchtbar und entsteht aus der Paarung von Pferd und Esel? | Maultier | Maultier, Mule | 2 | ja | Maultier | hoch |

## funFact-Texte

Stehen im JSON unter `funFact` und sind kurz (1-2 Sätze).