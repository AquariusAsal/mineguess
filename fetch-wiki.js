/**
 * fetch-wiki.js – Lädt Mob-Daten vom Minecraft Wiki und ergänzt questions.json
 *
 * Ausführen: node fetch-wiki.js
 * Benötigt Node.js 18+ (fetch ist eingebaut)
 */

const fs = require('fs');
const path = require('path');

const WIKI_API = 'https://minecraft.wiki/w/api.php';
const OUT_FILE = path.join(__dirname, 'questions.json');

// ─── Mobs mit bekannten Werten ────────────────────────────────────────────────
// Format: [name_de, name_en_wiki, hp, schaden_nahe, kategorie, funFact]
const MOB_DATA = [
  ['Axolotl',      'Axolotl',         28,  2,  'Mobs', 'Axolotls spielen tote, wenn sie Schaden nehmen (Regeneration + kurze Unverwundbarkeit). Sie greifen Guardian-Mobs an!'],
  ['Frog',         'Frog',            20,  0,  'Mobs', 'Frösche essen kleine Slimes und Magma Cubes. Je nach Biom-Typ, in dem sie aufwachsen, haben sie verschiedene Farben.'],
  ['Camel',        'Camel',           64, 0,   'Mobs', 'Kamele können 2 Spieler tragen und machen einen Dash-Sprung über 2 Blöcke Lücken. Sie spawnen in Wüstendörfern.'],
  ['Sniffer',      'Sniffer',         30,  0,  'Mobs', 'Der Sniffer ist das älteste Mob in Minecraft und gewann die Mob-Abstimmung 2022. Er gräbt antike Samenkörner aus.'],
  ['Tadpole',      'Tadpole',          6,  0,  'Mobs', 'Kaulquappen entstehen aus Frosch-Eiern. Nach ~20 Minuten verwandeln sie sich in Frösche – je nach Biom mit anderer Farbe.'],
  ['Goat',         'Goat',            20,  9,  'Mobs', 'Ziegen rammen alles in ihrer Nähe. Schreiende Ziegen sind seltener und rufen lauter. Ziegen droppen Ziegen-Hörner.'],
  ['Glow Squid',   'Glow Squid',      20,  0,  'Mobs', 'Der leuchtende Tintenfisch gibt leuchtende Tintenbeutel, die leuchtende Item-Rahmen (Glow Item Frames) ermöglichen.'],
  ['Drowned',      'Drowned',         20,  2,  'Mobs', 'Ertränkte spawnen im Wasser oder entstehen, wenn Zombies zu lange unter Wasser sind. Sie droppen manchmal Dreizack.'],
  ['Husk',         'Husk',            20,  2,  'Mobs', 'Hüllenzombies (Husks) spawnen nur in Wüsten. Ihr Angriff verursacht Hunger-Effekt statt direkten Schaden.'],
  ['Stray',        'Stray',           20,  0,  'Mobs', 'Irrlichter (Strays) sind Skelett-Varianten aus Schneebiomen. Ihre Pfeile verursachen Verlangsamung I für 30 Sekunden.'],
  ['Zombie Villager', 'Zombie Villager', 20, 2, 'Mobs', 'Zombie-Dorfbewohner können mit einem Schwächetrank + Goldenem Apfel geheilt werden. Das dauert 2-5 Minuten.'],
  ['Piglin Brute', 'Piglin Brute',   100,  9,  'Mobs', 'Piglin-Brutes greifen immer an, ohne Provokation und auch wenn man Gold-Rüstung trägt. Sie droppen keine Gold-Items.'],
  ['Zoglin',       'Zoglin',          80, 0,   'Mobs', 'Zoglins entstehen, wenn Hoglins in die Overworld oder den End gehen. Sie greifen alles außer anderen Zoglins an.'],
  ['Vindicator',   'Vindicator',      24,  0,  'Mobs', 'Bestraferer sind die gefährlichsten Plünderer-Mobs. Mit einer Axt machen sie auf Hard bis zu 19 Schaden pro Treffer.'],
];

// ─── Blöcke / Items mit Wiki-Daten ───────────────────────────────────────────
const BLOCK_QUESTIONS = [
  {
    type: 'number',
    question: 'Wie viele halbe Herzen hat ein Axolotl?',
    answer: 28, unit: '♥', tolerance: 0,
    category: 'Mobs',
    funFact: 'Axolotls spielen tote, wenn sie Schaden nehmen (Regeneration + kurze Unverwundbarkeit). Sie greifen Guardian-Mobs an!'
  },
  {
    type: 'number',
    question: 'Wie viele halbe Herzen hat ein Kamel (Camel)?',
    answer: 64, unit: '♥', tolerance: 0,
    category: 'Mobs',
    funFact: 'Kamele spawnen in Wüstendörfern, können 2 Spieler tragen und machen einen Dash-Sprung über 2 Blöcke breite Lücken.'
  },
  {
    type: 'number',
    question: 'Wie viele halbe Herzen hat eine Ziege (Goat)?',
    answer: 20, unit: '♥', tolerance: 0,
    category: 'Mobs',
    funFact: 'Ziegen rammen Spieler und Mobs. Schreiende Ziegen (Screaming Goats) sind seltener. Ziegen-Hörner klingen wie Raids.'
  },
  {
    type: 'number',
    question: 'Wie viele halbe Herzen hat ein Piglin Brute?',
    answer: 100, unit: '♥', tolerance: 0,
    category: 'Mobs',
    funFact: 'Piglin-Brutes sind gefährlicher als normale Piglins. Sie greifen immer an – auch wenn man goldene Rüstung trägt.'
  },
  {
    type: 'number',
    question: 'Wie viele halbe Herzen hat ein Zoglin?',
    answer: 80, unit: '♥', tolerance: 0,
    category: 'Mobs',
    funFact: 'Zoglins entstehen, wenn Hoglins in die Overworld oder den End teleportiert werden. Sie greifen alles außer Creeper an.'
  },
  {
    type: 'number',
    question: 'Wie viele Farb-Varianten hat ein Axolotl?',
    answer: 5, unit: 'Varianten', tolerance: 0,
    category: 'Mobs',
    funFact: 'Axolotl-Farben: Leucas (weiß), Wild (braun), Gold (gelb), Cyan und selten Blue (1:1200 Chance beim Züchten).'
  },
  {
    type: 'number',
    question: 'Wie viele Frosch-Varianten gibt es in Minecraft 1.19+?',
    answer: 3, unit: 'Varianten', tolerance: 0,
    category: 'Mobs',
    funFact: '3 Frosch-Farben: Temperate (orange), Warm (weiß), Cold (grün). Die Farbe bestimmt sich durch das Biom, in dem der Kaulquapp aufwächst.'
  },
  {
    type: 'entity',
    question: 'Welcher seltene Block entsteht, wenn ein kleiner Magma Cube von einem Frosch gefressen wird?',
    answer: 'Froschlicht',
    acceptedAnswers: ['Froschlicht', 'Froglight', 'Frog Light'],
    category: 'Blöcke',
    funFact: 'Es gibt 3 Froschlicht-Farben (Purpur, Grünlich, Gelb), je nach Frosch-Variante. Alle haben Lichtstärke 15.'
  },
  {
    type: 'number',
    question: 'Wie viel Schaden macht ein Warden-Angriff auf Normal (in halben Herzen)?',
    answer: 30, unit: '♥ Schaden', tolerance: 0,
    category: 'Mobs',
    funFact: 'Der Warden macht auf Normal 30 Schaden (15 Herzen) – genug um einen voll gerüsteten Spieler fast zu töten. Auf Hard: 45 Schaden!'
  },
  {
    type: 'number',
    question: 'Wie weit kann der Warden seinen Sonic Boom (Schallkanone) schießen (in Blöcken)?',
    answer: 15, unit: 'Blöcke', tolerance: 2,
    category: 'Mobs',
    funFact: 'Der Sonic Boom durchdringt Rüstung und Schilde vollständig! Er macht 10 Schaden (5 Herzen) unabhängig von Rüstung.'
  },
  {
    type: 'number',
    question: 'Wie viele Vibrations muss man im Sculk-Biom auslösen, bevor ein Warden spawnt?',
    answer: 3, unit: 'Anrufe', tolerance: 0,
    category: 'Mobs',
    funFact: 'Erst nach 3 Shriek-Ereignissen (je 90 Ticks Abstand) erscheint ein Warden. Schleichen verhindert Vibrations – Wolle blockiert sie.'
  },
  {
    type: 'entity',
    question: 'Welcher Block kann Vibrationen "blockieren" und Wardens blind machen?',
    answer: 'Wollblock',
    acceptedAnswers: ['Wolle', 'Wollblock', 'Wool', 'Wool Block'],
    category: 'Blöcke',
    funFact: 'Wollblöcke absorbieren Vibrationssignale und verhindern, dass Sculk-Sensoren und Wardens Geräusche durch sie hindurch erkennen.'
  },
  {
    type: 'number',
    question: 'Wie viel Schaden macht Wither-Effekt pro Sekunde (in halben Herzen)?',
    answer: 1, unit: '♥/s', tolerance: 0,
    category: 'Spielmechanik',
    funFact: 'Wither-Effekt ähnelt Gift, kann aber bis zum Tod töten und wirkt auf Untote. Milch heilt ihn sofort.'
  },
  {
    type: 'number',
    question: 'Wie viele halbe Herzen regeneriert ein Leuchtturm-Effekt (Regeneration) pro Sekunde?',
    answer: 1, unit: '♥/s', tolerance: 0,
    category: 'Blöcke',
    funFact: 'Regeneration durch Beacon (Leuchtturm) ist Regeneration I = 1 HP alle 2,5 Sek. Für Regen II braucht man Beacon-Stufe 4 mit sekundärem Effekt.'
  },
  {
    type: 'number',
    question: 'Wie viele Smaragde braucht man für eine Rüstungsverzauberung bei einem Armorer-Dorfbewohner (Meister-Level)?',
    answer: 14, unit: 'Smaragde', tolerance: 5,
    category: 'Dorfbewohner',
    funFact: 'Armorer-Meister können Diamant-Rüstung mit zufälligen Verzauberungen verkaufen – oft günstiger als selbst zu verzaubern.'
  },
  {
    type: 'entity',
    question: 'Welches Item findet man in einer Truhenboot (Chest Boat)?',
    answer: 'Truhe',
    acceptedAnswers: ['Truhe', 'Chest', 'Kiste'],
    category: 'Items',
    funFact: 'Seit 1.19 kann man eine Truhe mit einem Boot kombinieren. Das Truhenboot hat 27 Inventarslots und transportiert Items über Wasser.'
  },
  {
    type: 'number',
    question: 'Wie hoch sind die maximalen Y-Koordinaten von Ancient Debris-Spawns?',
    answer: 119, unit: 'Y-Level', tolerance: 5,
    category: 'Weltgenerierung',
    funFact: 'Ancient Debris spawnt zwischen Y=8 und Y=119, am häufigsten bei Y=15. Es spawnt in kleinen Erznestern und einzeln.'
  },
  {
    type: 'number',
    question: 'Wie viel Schaden macht Magma Block pro Sekunde (beim Draufstehen)?',
    answer: 1, unit: '♥ Schaden', tolerance: 0,
    category: 'Blöcke',
    funFact: 'Magmablöcke schaden 1 HP alle 0,5 Sek. Schleichen auf Magmablöcken verhindert den Schaden. Sie erzeugen absinkende Wasserströmungen.'
  },
  {
    type: 'number',
    question: 'Wie viele Blöcke breit ist das Spielfeld des End-Portals (innere Fläche)?',
    answer: 3, unit: 'x 3 Blöcke', tolerance: 0,
    category: 'Weltgenerierung',
    funFact: 'Das End-Portal hat eine 3×3-Öffnung, umgeben von 12 End-Portal-Rahmen-Blöcken. Man fällt direkt in den End-Spawn-Bereich.'
  },
  {
    type: 'entity',
    question: 'Was ist der einzige Block, der nicht bewegt werden kann und unter dem Ender-Drachen-Brunnen steht?',
    answer: 'Endstein',
    acceptedAnswers: ['Endstein', 'End Stone', 'Endstone'],
    category: 'Blöcke',
    funFact: 'Endstein ist der Haupt-Baublock des End. Mit Endstein-Ziegelsteinen und -Mauern gibt es inzwischen viele dekorative Varianten.'
  },
  {
    type: 'number',
    question: 'Wie groß ist die End-Insel bei der Spawn-Plattform (Radius in Blöcken)?',
    answer: 1000, unit: 'Blöcke vom Zentrum', tolerance: 100,
    category: 'Weltgenerierung',
    funFact: 'Die äußeren End-Inseln (mit Städten und Shulkern) beginnen erst ca. 1000 Blöcke vom Zentrum. Mit Elytra leicht zu erreichen!'
  },
  {
    type: 'number',
    question: 'Wie viele Flammen schießt ein Blaze in einer Angriffsserie?',
    answer: 3, unit: 'Feuerbälle', tolerance: 0,
    category: 'Mobs',
    funFact: 'Blazes schießen immer 3 Feuerbälle in schneller Folge, pausieren dann kurz. Schneebälle sind die günstigste Gegenmaßnahme.'
  },
  {
    type: 'number',
    question: 'Wie viele verschiedene Banner-Muster (Patterns) gibt es in Minecraft?',
    answer: 42, unit: 'Muster', tolerance: 3,
    category: 'Items',
    funFact: 'Banner können mit Farbstoffen, Blumen, Wohnungen und speziellen Mustern dekoriert werden. Shields können Banner aufnehmen.'
  },
  {
    type: 'number',
    question: 'Wie viele Feuerwerksraketen kann eine Elytra-Boostrakete bei maximaler Kraft geben (Boost-Dauer in Sekunden)?',
    answer: 3, unit: 'Sekunden', tolerance: 1,
    category: 'Items',
    funFact: 'Elytra-Schub mit Feuerwerksraketen: 1 Stern = ~1 Sek., 3 Sterne = ~3 Sek. Viele Sterne erhöhen Explosions-Schaden, nicht Schub-Dauer.'
  },
];

// ─── Bestehende Questions laden ───────────────────────────────────────────────
let existing = [];
try {
  existing = JSON.parse(fs.readFileSync(OUT_FILE, 'utf8'));
  console.log(`✅ ${existing.length} bestehende Fragen geladen.`);
} catch (e) {
  console.log('ℹ️ Keine bestehende questions.json gefunden, starte neu.');
}

// ─── Neue Fragen aus BLOCK_QUESTIONS generieren ───────────────────────────────
let nextId = existing.length > 0 ? Math.max(...existing.map(q => q.id)) + 1 : 1;
const newQuestions = [];

for (const q of BLOCK_QUESTIONS) {
  // Duplikat-Check: gleiche Frage bereits vorhanden?
  const duplicate = existing.some(e =>
    e.question.toLowerCase().trim() === q.question.toLowerCase().trim()
  );
  if (duplicate) {
    console.log(`⏭ Überspringe Duplikat: "${q.question.slice(0, 50)}..."`);
    continue;
  }
  newQuestions.push({ id: nextId++, ...q });
}

// ─── Zusammenführen & Speichern ───────────────────────────────────────────────
const combined = [...existing, ...newQuestions];
fs.writeFileSync(OUT_FILE, JSON.stringify(combined, null, 2), 'utf8');

console.log(`\n🎉 Fertig!`);
console.log(`   Vorher: ${existing.length} Fragen`);
console.log(`   Hinzugefügt: ${newQuestions.length} neue Fragen`);
console.log(`   Gesamt: ${combined.length} Fragen`);
console.log(`\n📁 Gespeichert: ${OUT_FILE}`);
