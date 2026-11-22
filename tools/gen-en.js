/**
 * Englische Fassung aller Fragen: schreibt questions.en.json (IDs identisch zu questions.json, nichts Deutsches wird veraendert).
 *   node tools/gen-en.js [--dry]
 *
 * Aufbau von questions.en.json:
 *   { v:1, categories:{ "<deutsche Kategorie>": "<englische Kategorie>" },
 *     q: { "<id>": { question, answer?, acceptedAnswers?, choices?, funFact?, unit? } | null } }
 *   - answer/acceptedAnswers: englische Antwort(en) (Zahlfragen: nur unit/Texte, die Zahl bleibt die der deutschen Frage)
 *   - choices: englische Optionen in DERSELBEN Reihenfolge wie die deutschen (Index-gleich, auch fuer Wahr/Mythos)
 *   - null: keine (sinnvolle) englische Fassung, die Frage wird fuer Englisch ausgeblendet
 * Quellen: (1) Vorlagen + Namenstabelle aus ../mineguess-cache/en_us.json (offizielle Namen, Java 1.21.4) fuer alle generierten Fragen,
 * (2) handgeschriebene Uebersetzungen in tools/en-data/*.js (nach ID bzw. Zeilenindex), (3) alles andere: null (offen).
 */
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const CACHE = process.env.MC_CACHE || path.join(root, '..', 'mineguess-cache');
const dry = process.argv.includes('--dry');
const de = JSON.parse(fs.readFileSync(path.join(CACHE, 'de_de.json'), 'utf8'));
const en = JSON.parse(fs.readFileSync(path.join(CACHE, 'en_us.json'), 'utf8'));
const qs = JSON.parse(fs.readFileSync(path.join(root, 'questions.json'), 'utf8'));

// ───── Namenstabellen DE -> EN je Namensraum (offizielle Namen) ─────
const NS = { item: ['item.minecraft.', 'block.minecraft.'], block: ['block.minecraft.', 'item.minecraft.'], mob: ['entity.minecraft.'], biome: ['biome.minecraft.'], ench: ['enchantment.minecraft.'], effect: ['effect.minecraft.'] };
const okKey = (k, p) => { const rest = k.slice(p.length); return !rest.includes('.') || (p === 'item.minecraft.' && /^potion\.effect\.[a-z_]+$/.test(rest)) || (p === 'entity.minecraft.' && /^villager\.[a-z]+$/.test(rest)); };
const maps = {};
Object.entries(NS).forEach(([ns, prefixes]) => {
  const m = new Map();
  prefixes.forEach(p => Object.keys(de).forEach(k => { if (k.startsWith(p) && okKey(k, p) && typeof de[k] === 'string' && typeof en[k] === 'string' && !m.has(de[k])) m.set(de[k], en[k]); }));
  maps[ns] = m;
});
const missing = new Map();
const NAME_FIX = { 'Schild|stack': 'Sign' };      // Schild als Stapelfrage = Schild (Sign), sonst Shield
let CUR = null;
function nm(de0, ns, ctx) {
  if (NAME_FIX[de0 + '|' + ctx]) return NAME_FIX[de0 + '|' + ctx];
  const v = maps[ns].get(de0);
  if (v) return v;
  const other = Object.keys(maps).map(k => maps[k].get(de0)).find(Boolean);
  if (other) return other;
  missing.set(de0 + ' [id ' + CUR + ']', 1);
  return null;
}
const fixNum = s => String(s).replace(/(\d),(\d)/g, '$1.$2');
const TOOL = { Spitzhacke: 'Pickaxe', Axt: 'Axe', Schaufel: 'Shovel', Hacke: 'Hoe' };
const DIM = { Oberwelt: 'Overworld', Nether: 'Nether', Ende: 'The End' };
const CATS = { Mobs: 'Mobs', 'Blöcke': 'Blocks', Items: 'Items', Redstone: 'Redstone', Verzauberungen: 'Enchantments', Spielmechanik: 'Game Mechanics', 'Tränke': 'Potions', Dorfbewohner: 'Villagers', Biome: 'Biomes', Gameplay: 'Gameplay', 'Erze & Ressourcen': 'Ores & Resources', 'Geschichte & Updates': 'History & Updates', Strukturen: 'Structures', 'Essen & Nahrung': 'Food', Dimensionen: 'Dimensions', Crafting: 'Crafting', 'Hardcore-Wissen': 'Hardcore Knowledge', Weltgenerierung: 'World Generation' };

const quotedOf = (s) => (String(s).match(/„([^“]+)“/g) || []).map(x => x.slice(1, -1));
const numsOf = (s) => (String(s).replace(/„[^“]+“/g, '').match(/-?\d+(?:,\d+)?/g) || []).map(fixNum);
const Q = (s) => '“' + s + '”';
const plural = (n, a, b) => (Number(n) === 1 ? a : b);

// ───── Vorlagen je gen: (q, ctx) -> { question, funFact, unit?, answer?, acceptedAnswers?, choices? } oder null ─────
// Hilfen: ctx.qn[i] = i-ter Name der Frage (DE), ctx.fn[i] = i-ter Name der Erklaerung, ctx.nums = Zahlen der Erklaerung (EN-Format)
function build(q) {
  const g = q.gen || '';
  const base = String(g).replace(/^d2_/, '');
  const qn = quotedOf(q.question), fn = quotedOf(q.funFact), nums = numsOf(q.funFact);
  const miss0 = missing.size;
  const N = (d, ns) => nm(d, ns, base.includes('stack') ? 'stack' : '');
  const out = {};
  const cmpOf = (ns, qtext, ftext) => {
    const a = N(qn[0], ns), b = N(qn[1], ns), ans = N(q.answer, ns);
    if (!a || !b || !ans) return null;
    out.question = qtext(Q(a), Q(b)); out.answer = ans; out.acceptedAnswers = [ans]; out.choices = q.choices.map(c => N(c, ns));
    if (out.choices.some(x => !x)) return null;
    out.funFact = ftext(Q(ans), Q(out.choices.find(c => c !== ans)));
    return out;
  };
  // erste Zahl pro Seite aus der Erklaerung: Gewinner/Verlierer je Reihenfolge der Namen
  const n0 = nums[0], n1 = nums[1], n2 = nums[2];
  const nameOfFact = (ns, i) => { const x = fn[i]; return x ? N(x, ns) : null; };
  let r = null;
  switch (base) {
    case 'block_haerte': { const b = N(qn[0], 'block'); if (!b) return null; r = { question: `What is the hardness of the block ${Q(b)}?`, funFact: `${Q(b)} has hardness ${n0}. For comparison: stone has ${n1}, obsidian ${n2}.` }; break; }
    case 'block_resistance': { const b = N(qn[0], 'block'); if (!b) return null; r = { question: `What is the blast resistance of the block ${Q(b)}?`, funFact: `${Q(b)} has blast resistance ${n0}. For comparison: stone has ${n1}, obsidian ${n2}.` }; break; }
    case 'block_light': { const b = N(qn[0], 'block'); if (!b) return null; r = { question: q.gen === 'd2_block_light' ? `What light level (0 to 15) does the block ${Q(b)} emit?` : `What light level does the block ${Q(b)} emit?`, funFact: q.gen === 'd2_block_light' ? `${Q(b)} glows at light level ${n0}.` : `${Q(b)} glows at light level ${n0} out of a maximum of ${n1}.` }; break; }
    case 'block_tool': { const b = N(qn[0], 'block'); const t = TOOL[q.answer]; if (!b || !t) return null; r = { question: `Which tool breaks the block ${Q(b)} the fastest?`, answer: t, acceptedAnswers: [t], funFact: `${Q(b)} is broken fastest with the ${t.toLowerCase()}.` }; break; }
    case 'min_pickaxe': { const b = N(qn[0], 'block'), a = N(q.answer, 'item'); if (!b || !a) return null; r = { question: `Which pickaxe is the minimum needed for ${Q(b)} to drop something when mined?`, answer: a, acceptedAnswers: [a], funFact: `${Q(b)} only drops something from the ${lcName(a)} upwards.` }; break; }
    case 'block_drop': {
      const b = N(qn[0], 'block'), a = N(q.answer, 'item'); if (!b || !a) return null;
      r = { question: q.gen === 'd2_block_drop' ? `Which item do you normally get when mining ${Q(b)} (with the right tool, without Silk Touch)?` : `Which item do you normally get when you mine ${Q(b)} without Silk Touch?`, answer: a, acceptedAnswers: [a], funFact: q.gen === 'd2_block_drop' ? `${Q(b)} drops ${lcName(a)}.` : `${Q(b)} drops ${lcName(a)} when mined, with the right tool tier.` }; break;
    }
    case 'item_stack': {
      const i = N(qn[0], 'item'); if (!i) return null;
      const f = /nicht stapeln/.test(q.funFact) ? `${Q(i)} cannot be stacked.` : /Standardwert/.test(q.funFact) ? `${Q(i)} stacks up to ${n0}, which is the default.` : /nicht bis/.test(q.funFact) ? `${Q(i)} only stacks up to ${n0}, not up to ${n1}.` : /nicht stapelbar/.test(q.funFact) ? `${Q(i)} stacks up to ${n0} (not stackable).` : `${Q(i)} stacks up to ${n0}.`;
      r = { question: `What is the maximum stack size of ${Q(i)}?`, funFact: f, unit: 'items' }; break;
    }
    case 'item_durability': { const i = N(qn[0], 'item'); if (!i) return null; r = { question: q.gen === 'd2_item_durability' ? `How many uses does ${Q(i)} last (durability)?` : `What is the durability of ${Q(i)}?`, funFact: q.gen === 'd2_item_durability' ? `${Q(i)} has a durability of ${n0}.` : `${Q(i)} lasts ${n0} uses.`, unit: 'durability' }; break; }
    case 'food_points': {
      const i = N(qn[0], 'item'); if (!i) return null;
      if (q.gen === 'd2_food_points') r = { question: `How many hunger points (half drumsticks) does ${Q(i)} restore?`, funFact: `${Q(i)} restores ${n0} hunger points (${n1} drumsticks).`, unit: 'hunger points' };
      else r = { question: `How many hunger points does ${Q(i)} restore?`, funFact: /halbe Keule/.test(q.funFact) ? `${Q(i)} restores ${n0} hunger point${plural(n0, '', 's')}, which is half a drumstick in the hunger bar.` : /eine Keule/.test(q.funFact) ? `${Q(i)} restores ${n0} hunger points, which is one drumstick in the hunger bar.` : `${Q(i)} restores ${n0} hunger points, which is ${n1} drumsticks in the hunger bar.`, unit: 'hunger points' };
      break;
    }
    case 'mob_height': case 'mob_width': {
      const m = N(qn[0], 'mob'); if (!m) return null; const h = base === 'mob_height';
      r = { question: `How many blocks ${h ? 'tall' : 'wide'} is the mob ${Q(m)}?`, funFact: `${Q(m)} is ${n0} blocks ${h ? 'tall' : 'wide'}. The player is ${n1} blocks ${h ? 'tall' : 'wide'}.`, unit: 'blocks' }; break;
    }
    case 'mob_by_size': { const a = N(q.answer, 'mob'); if (!a) return null; r = { question: `Which mob is ${nums.length ? numsOf(q.question)[0] : ''} blocks wide and ${numsOf(q.question)[1]} blocks tall?`, answer: a, acceptedAnswers: [a], funFact: `${Q(a)} measures ${n0} x ${n1} blocks.` }; break; }
    case 'enchant_max': { const e = N(qn[0], 'ench'); if (!e) return null; r = { question: q.gen === 'd2_enchant_max' ? `Up to which level can ${Q(e)} normally be enchanted?` : `Up to which level can ${Q(e)} be enchanted?`, funFact: `${Q(e)} normally goes up to level ${n0}${/Fluch/.test(q.funFact) ? ' and is a curse' : ''}.` }; break; }
    case 'cmp_hardness': r = cmpOf('block', (a, b) => `Which block is harder: ${a} or ${b}?`, (w, l) => `${w} (hardness ${n0}) is harder than ${l} (hardness ${n1}).`); break;
    case 'cmp_resistance': r = q.gen === 'd2_cmp_resistance' ? cmpOf('block', (a, b) => `Which block withstands explosions better: ${a} or ${b}?`, (w, l) => `${w} (resistance ${n0}) withstands more than ${l} (resistance ${n1}).`) : cmpOf('block', (a, b) => `Which block withstands explosions better: ${a} or ${b}?`, (w, l) => `${w} has blast resistance ${n0}, ${l} only ${n1}.`); break;
    case 'cmp_height': r = cmpOf('mob', (a, b) => `Which mob is taller: ${a} or ${b}?`, (w, l) => `${w} is ${n0} blocks tall, ${l} only ${n1}.`); break;
    case 'cmp_width': r = cmpOf('mob', (a, b) => `Which mob is wider: ${a} or ${b}?`, (w, l) => `${w} is ${n0} blocks wide, ${l} only ${n1}.`); break;
    case 'cmp_durability': r = cmpOf('item', (a, b) => `Which lasts longer: ${a} or ${b}?`, (w, l) => (q.gen === 'd2_cmp_durability' ? `${w} has durability ${n0}, ${l} only ${n1}.` : `${w} lasts ${n0} uses, ${l} only ${n1}.`)); break;
    case 'cmp_food': r = cmpOf('item', (a, b) => `Which restores more hunger points: ${a} or ${b}?`, (w, l) => `${w} restores ${n0} hunger points, ${l} only ${n1}.`); break;
    case 'cmp_light': r = cmpOf('block', (a, b) => `Which block glows brighter: ${a} or ${b}?`, (w, l) => (q.gen === 'd2_cmp_light' ? `${w} (light level ${n0}) glows brighter than ${l} (light level ${n1}).` : `${w} glows at light level ${n0}, ${l} only at ${n1}.`)); break;
    case 'cmp_biome_temp': r = cmpOf('biome', (a, b) => (q.gen === 'd2_cmp_biome_temp' ? `Which biome is warmer (higher temperature): ${a} or ${b}?` : `Which biome has the higher base temperature: ${a} or ${b}?`), (w, l) => (q.gen === 'd2_cmp_biome_temp' ? `${w} has temperature ${n0}, ${l} only ${n1}.` : `${w} has base temperature ${n0}, ${l} only ${n1}.`)); break;
    case 'cmp_enchant': r = cmpOf('ench', (a, b) => `Which enchantment has the higher maximum level: ${a} or ${b}?`, (w, l) => `${w} goes up to level ${n0}, ${l} only up to level ${n1}.`); break;
    case 'biome_dimension': {
      const b = N(qn[0], 'biome'), d = DIM[q.answer]; if (!b || !d) return null;
      r = { question: q.gen === 'd2_biome_dimension' ? `In which dimension is the biome ${Q(b)} located?` : `Which dimension does the biome ${Q(b)} belong to?`, answer: d, acceptedAnswers: d === 'The End' ? ['The End', 'End'] : [d], funFact: `The biome ${Q(b)} belongs to the dimension ${d}.` }; break;
    }
    case 'biome_precip': { const b = N(qn[0], 'biome'); if (!b) return null; const yes = q.answer === 'Ja'; r = { question: `Does the biome ${Q(b)} have precipitation (rain or snow)?`, answer: yes ? 'Yes' : 'No', acceptedAnswers: [yes ? 'Yes' : 'No'], choices: ['Yes', 'No'], funFact: yes ? `It rains or snows in the biome ${Q(b)}.` : `There is neither rain nor snow in the biome ${Q(b)}.` }; break; }
    case 'effect_type': { const e = N(qn[0], 'effect'); if (!e) return null; const pos = q.answer === 'Positiv'; r = { question: `Is the status effect ${Q(e)} considered positive or negative in the game?`, answer: pos ? 'Positive' : 'Negative', acceptedAnswers: [pos ? 'Positive' : 'Negative'], choices: ['Positive', 'Negative'], funFact: `${Q(e)} is a ${pos ? 'positive' : 'negative'} effect.` }; break; }
    case 'craft_count': { const i = N(qn[0], 'item'); if (!i) return null; r = { question: `How many items does one crafting recipe for ${Q(i)} produce?`, funFact: `One recipe yields ${n0} × ${Q(i)}.`, unit: 'items' }; break; }
    case 'craft_result': { const i = N(qn[0], 'item'); if (!i) return null; r = { question: `How many items does one crafting recipe for ${Q(i)} produce?`, funFact: `A recipe for ${Q(i)} yields ${n0}.`, unit: 'items' }; break; }
    case 'craft_slots': { const i = N(qn[0], 'item'); if (!i) return null; r = { question: `How many slots of the crafting grid does the standard recipe for ${Q(i)} use?`, funFact: `The recipe for ${Q(i)} uses ${n0} slots.`, unit: 'slots' }; break; }
    case 'craft_compress': {
      const ing = N((q.question.match(/Stück „([^“]+)“/) || [])[1], 'item'), a = N(q.answer, 'item'); const nIn = numsOf(q.question)[0];
      if (!ing || !a) return null; r = { question: `What do you craft in the crafting grid from ${nIn} ${Q(ing)}?`, answer: a, acceptedAnswers: [a], funFact: `${nIn} x ${lcName(ing)} make ${Q(a)}.` }; break;
    }
    case 'craft_ingredient': {
      const i = N(qn[0], 'item'), a = N(q.answer, 'item'); if (!i || !a) return null; r = { question: `From which single ingredient do you craft ${Q(i)} in the crafting grid?`, answer: a, acceptedAnswers: [a], funFact: `${Q(i)} needs ${n0} x ${lcName(a)}.` }; break;
    }
    case 'block_by_hardness': case 'block_by_resistance': { const a = N(q.answer, 'block'); if (!a) return null; const h = base === 'block_by_hardness'; r = { question: `Which block has ${h ? 'hardness' : 'blast resistance'} ${numsOf(q.question)[0]}?`, answer: a, acceptedAnswers: [a], funFact: `${Q(a)} is the only block with ${h ? 'hardness' : 'blast resistance'} ${n0}.` }; break; }
    case 'item_repair': { const i = N(qn[0], 'item'), a = N(q.answer, 'item'); if (!i || !a) return null; r = { question: `With which material do you repair ${Q(i)} on an anvil?`, answer: a, acceptedAnswers: [a], funFact: `${Q(i)} can be repaired on an anvil with ${lcName(a)}.` }; break; }
    default: return undefined;
  }
  if (!r) return null;
  if (missing.size > miss0) return null;
  return r;
}

// ───── Crafting-Raetsel ─────
const FAM_EN = {
  'Boote tragen Spieler über Wasser; es gibt sie für jede Holzart, Bambus wird zum Floß.': 'Boats carry players across water; there is one for every wood type, and bamboo makes a raft.',
  'Holztüren öffnet man per Rechtsklick, Eisentüren nur mit Redstone.': 'Wooden doors open with a right-click, iron doors only with redstone.',
  'Zäune sind 1,5 Blöcke hoch, deshalb springen Spieler und die meisten Mobs nicht darüber.': 'Fences are 1.5 blocks tall, so players and most mobs cannot jump over them.',
  'Zauntore schließen Lücken im Zaun und öffnen sich per Rechtsklick.': 'Fence gates close gaps in a fence and open with a right-click.',
  'Hängeschilder bestehen aus Ketten und entrindeten Stämmen und lassen sich beschriften.': 'Hanging signs are made of chains and stripped logs and can be written on.',
  'Druckplatten senden ein Redstone-Signal, solange etwas darauf steht.': 'Pressure plates send a redstone signal while something stands on them.',
  'Schilder lassen sich beschriften, mit Farbstoff färben und mit Honigwaben wachsen.': 'Signs can be written on, dyed, and waxed with honeycomb.',
  'Platten sind halbe Blöcke, zwei übereinander ergeben einen vollen Block.': 'Slabs are half blocks; two stacked on top of each other make a full block.',
  'Treppen bestehen aus sechs Blöcken und ergeben vier Stufen auf einmal.': 'Stairs are made from six blocks and give four steps at once.',
  'Falltüren lassen sich als Boden, Decke oder Leiter-Ersatz nutzen.': 'Trapdoors can be used as floors, ceilings or as a ladder substitute.',
  'Aus vier Stämmen entsteht Holz mit Rinde auf allen Seiten.': 'Four logs make wood with bark on all sides.',
  'Mauern sind 1,5 Blöcke hoch und verbinden sich mit ihren Nachbarn.': 'Walls are 1.5 blocks tall and connect to their neighbors.',
  'Banner werden aus Wolle und einem Stock gebaut und lassen sich mit Farbstoffen mustern.': 'Banners are made from wool and a stick and can be patterned with dyes.',
  'Betten setzen den Spawnpunkt; im Nether und im Ende explodieren sie.': 'Beds set your spawn point; in the Nether and the End they explode.',
  'Teppiche sind sehr flach und dämpfen Vibrationen.': 'Carpets are very flat and dampen vibrations.',
  'Glas ist durchsichtig; gefärbtes Glas entsteht mit Farbstoffen.': 'Glass is transparent; stained glass is made with dyes.',
  'Terrakotta wird aus Ton gebrannt und lässt sich mit Farbstoff einfärben.': 'Terracotta is fired from clay and can be dyed.',
  'Ziegel entstehen aus gebranntem Ton und ergeben Ziegelblöcke.': 'Bricks are fired from clay and make brick blocks.',
  'Kupfer oxidiert mit der Zeit, Wachs hält den Zustand fest.': 'Copper oxidizes over time; wax preserves its state.',
  'Werkzeuge und Waffen unterscheiden sich in Haltbarkeit und Schaden je nach Material.': 'Tools and weapons differ in durability and damage depending on the material.',
  'Aus einem Stamm entstehen vier Bretter.': 'One log makes four planks.',
  'Zementpulver wird zu Beton, sobald es mit Wasser in Berührung kommt.': 'Concrete powder turns into concrete as soon as it touches water.',
  'Knöpfe senden ein kurzes Redstone-Signal, Holzknöpfe länger als Steinknöpfe.': 'Buttons send a short redstone signal; wooden buttons stay on longer than stone buttons.',
  'Kerzen leuchten, wenn sie angezündet sind; bis zu vier passen in einen Block.': 'Candles glow when lit; up to four fit into one block.',
  'Farbstoffe färben Wolle, Glas, Banner und viele andere Blöcke.': 'Dyes color wool, glass, banners and many other blocks.',
};
function craftingEn(q) {
  const key = q.resultKey; const name = en['item.minecraft.' + key] || en['block.minecraft.' + key];
  if (!name) return null;
  const n = q.resultCount || 1;
  let fact;
  if (q.gen === 'crafting') fact = `The recipe yields ${n} × ${lcName(name)}.`;
  else {
    const m = String(q.funFact).match(/^(.*?)(?: Ein Rezept liefert (\d+) .*)?$/);
    const head = m ? m[1] : q.funFact;
    let h = FAM_EN[head];
    if (!h) { const z = head.match(/entsteht im Handwerksraster aus (\d+) Zutat(?:en)?\.$/); if (z) h = `${name} is crafted in the crafting grid from ${z[1]} ingredient${z[1] === '1' ? '' : 's'}.`; }
    if (!h) return null;
    fact = `${h} One recipe yields ${n} × ${lcName(name)}.`;
  }
  return { question: /formlos/.test(q.question) ? 'What is crafted here? (shapeless recipe)' : 'What is crafted here?', answer: name, acceptedAnswers: [name], funFact: fact };
}

// ───── w2-Fakten (Vorlagen) ─────
function w2En(q) {
  const qn = quotedOf(q.question);
  const M = (x) => nm(x, 'mob', ''), I = (x) => nm(x, 'item', '');
  const g = q.gen;
  if (g === 'w2_mob_health') { const m = M(qn[0]); const hp = q.answer; if (!m) return null; return { question: `How many health points (one heart = 2 health points) does the mob ${Q(m)} have?`, unit: 'health points', funFact: `${Q(m)} has ${hp} health points, which is ${hp / 2} hearts. The player has 20 health points (10 hearts).` }; }
  if (g === 'w2_job_block') { const job = nm(qn[0], 'mob', ''), a = I(q.answer); if (!job || !a) return null; return { question: `Which block is the workstation of a villager with the profession ${Q(job)}?`, answer: a, acceptedAnswers: [a], funFact: `The profession ${Q(job)} belongs to the block ${Q(a)}.` }; }
  if (g === 'w2_block_job') { const b = I(qn[0]), a = nm(q.answer, 'mob', ''); if (!b || !a) return null; return { question: `Which profession does a villager get when it uses the block ${Q(b)} as its workstation?`, answer: a, acceptedAnswers: [a], funFact: `The profession ${Q(a)} works at the block ${Q(b)}.` }; }
  if (g === 'w2_brew') { const p = I(qn[0]), a = I(q.answer); if (!p || !a) return null; return { question: `Which ingredient do you need to brew ${Q(p)} from an Awkward Potion?`, answer: a, acceptedAnswers: [a], funFact: `${Q(p)} is brewed from an Awkward Potion and ${lcName(a)}.` }; }
  if (g === 'w2_mob_drop') { const m = M(qn[0]), a = I(q.answer); if (!m || !a) return null; return { question: `Which item does the mob ${Q(m)} typically drop or provide?`, answer: a, acceptedAnswers: [a], funFact: `${Q(m)} drops ${Q(a)}.` }; }
  if (g === 'w2_drop_mob') { const i = I(qn[0]), a = M(q.answer); if (!i || !a) return null; return { question: `Which mob drops ${Q(i)}?`, answer: a, acceptedAnswers: [a], funFact: `${Q(i)} comes from ${Q(a)}.` }; }
  if (g === 'w2_breed') { const m = M(qn[0]), a = I(q.answer); if (!m || !a) return null; const acc = (q.acceptedAnswers || []).map(x => maps.item.get(x)).filter(Boolean); return { question: `Which item puts the mob ${Q(m)} into love mode (to breed)?`, answer: a, acceptedAnswers: [...new Set([a, ...acc])], funFact: `${Q(m)} breeds with ${Q(a)}${/weiteren Futtersorten/.test(q.funFact) ? ' (and other kinds of food)' : ''}.` }; }
  if (g === 'w2_tame') { const m = M(qn[0]), a = I(q.answer); if (!m || !a) return null; const acc = (q.acceptedAnswers || []).map(x => maps.item.get(x)).filter(Boolean); return { question: `Which item tames the mob ${Q(m)}?`, answer: a, acceptedAnswers: [...new Set([a, ...acc])], funFact: m === 'Cat' ? 'Cats are tamed with raw cod or raw salmon.' : m === 'Parrot' ? 'Parrots are tamed with seeds.' : 'Wolves are tamed with bones.' }; }
  return undefined;
}

// ───── Handuebersetzungen (tools/en-data/*.js): { "<id>": { question, funFact, answer?, acceptedAnswers?, choices?, unit? } } ─────
const manual = {};
const dataDir = path.join(__dirname, 'en-data');
const W3 = {}, TFM = {};
// Altfragen als Array [Frage, Erklaerung, Antwort|null, Aliase|null, Einheit|null, Optionen|null] -> Objekt
const arr2obj = (v) => { if (!Array.isArray(v)) return v; const o = { question: v[0], funFact: v[1] }; if (v[4]) o.unit = v[4]; if (v[2]) { o.answer = v[2]; o.acceptedAnswers = [v[2], ...(v[3] || [])]; } if (v[5]) o.choices = v[5]; return o; };
if (fs.existsSync(dataDir)) fs.readdirSync(dataDir).filter(f => f.endsWith('.js')).sort().forEach(f => { (f.startsWith('w3') ? Object.assign(W3, require(path.join(dataDir, f))) : (() => { const m = require(path.join(dataDir, f)); if (m.tf) Object.assign(TFM, m.tf); const rest = Object.assign({}, m); delete rest.tf; Object.keys(rest).forEach(k => { manual[k] = arr2obj(rest[k]); }); })()); });
// englische Platzhalter ({key} Item/Block, {m:key} Mob, {b:key} Biom, {j:key} Beruf)
const subEn = (str) => String(str).replace(/{(?:(m|b|j):)?([a-z0-9_]+)}/g, (all2, kind, k) => {
  const v = kind === 'm' ? en['entity.minecraft.' + k] : kind === 'b' ? en['biome.minecraft.' + k] : kind === 'j' ? en['entity.minecraft.villager.' + k] : (en['item.minecraft.' + k] || en['block.minecraft.' + k]);
  if (!v) throw new Error('EN-Name fehlt fuer ' + all2); return v;
});
// w3: Zeilenindex -> englisches Objekt (nach der deutschen Frage, gleiche IDs)
if (Object.keys(W3).length) {
  const w3 = require('./gen-wiki3.js');
  w3.main({ noWrite: true }).forEach(o => {
    const E = W3[o.__row], r = w3.rows[o.__row]; if (!E) return;
    const e = { question: subEn(E[0]), funFact: subEn(E[1]) };
    if (o.type === 'number') { if (E[4]) e.unit = E[4]; }
    else {
      const a = E[2] || subEn(r.a); e.answer = a; e.acceptedAnswers = [a, ...(E[3] || [])];
      if (o.choices) { const b = E[5] || subEn(r.b); e.choices = o.choices.map(c => (c === o.answer ? a : b)); }
    }
    manual[o.id] = e;
  });
}

// zusaetzliche Schreibweisen fuer englische Antworten (alle zeigen nur auf die richtige Antwort der Frage)
const ITEM_EN = new Set(), MOB_EN = new Set();
Object.keys(en).forEach(k => { if (/^(item|block).minecraft.[a-z_0-9]+$/.test(k)) ITEM_EN.add(en[k]); if (/^entity.minecraft.[a-z_0-9]+$/.test(k)) MOB_EN.add(en[k]); });
const MOB_PLURAL = { Wolf: 'Wolves', Zombie: 'Zombies', Creeper: 'Creepers', Skeleton: 'Skeletons', Spider: 'Spiders', Enderman: 'Endermen', Slime: 'Slimes', Ghast: 'Ghasts', Blaze: 'Blazes', Witch: 'Witches', Pig: 'Pigs', Cow: 'Cows', Sheep: 'Sheep', Chicken: 'Chickens', Villager: 'Villagers', Guardian: 'Guardians', Phantom: 'Phantoms', Bee: 'Bees', Fox: 'Foxes', Cat: 'Cats', Horse: 'Horses', Rabbit: 'Rabbits', Squid: 'Squids', Silverfish: 'Silverfish', 'Magma Cube': 'Magma Cubes', Piglin: 'Piglins', Hoglin: 'Hoglins', Strider: 'Striders', Shulker: 'Shulkers', Drowned: 'Drowned', Husk: 'Husks', Stray: 'Strays', Pillager: 'Pillagers', Vindicator: 'Vindicators', Evoker: 'Evokers', Vex: 'Vexes', Allay: 'Allays', Axolotl: 'Axolotls', Frog: 'Frogs', Turtle: 'Turtles', Dolphin: 'Dolphins', Panda: 'Pandas', Parrot: 'Parrots', Llama: 'Llamas' };
const lcName = (n) => String(n).toLowerCase();           // Itemnamen im Satz klein (Eigennamen von Mobs bleiben in Anfuehrungszeichen/Frage)
function aliasesOf(name, list) {
  const out = new Set(list.concat([name]));
  if (MOB_EN.has(name) && !ITEM_EN.has(name)) { if (MOB_PLURAL[name]) out.add(MOB_PLURAL[name]); return [...out]; }
  if (!ITEM_EN.has(name)) return [...out];
  let m;
  if ((m = name.match(/^Block of (.+)$/))) { out.add(m[1] + ' Block'); out.add(m[1]); }
  if ((m = name.match(/^(.+) Ingot$/))) out.add(m[1]);
  if ((m = name.match(/^(.+) Pickaxe$/))) out.add(m[1] + ' Pick');
  if ((m = name.match(/^(Raw|Cooked) (.+)$/))) out.add(m[2] + ' (' + m[1].toLowerCase() + ')');
  if (/'/.test(name)) out.add(name.replace(/'/g, ''));
  return [...out];
}
const pl1 = (t) => (typeof t === 'string' ? t.replace(/(?<![\d.])1 (blocks|uses|slots|drumsticks|hunger points)\b/g, (m0, w) => '1 ' + w.replace(/s$/, '').replace('hunger point', 'hunger point')) : t);
const result = {}, stat = { templ: 0, w2: 0, crafting: 0, manual: 0, pending: 0, bad: 0 };
const badList = [];
for (const q of qs) {
  CUR = q.id;
  let e;
  const g = String(q.gen || '');
  if (manual[q.id]) { e = manual[q.id]; stat.manual++; }
  else if (q.fmt === 'tf' && TFM[q.id]) { const [st, ex] = TFM[q.id]; const my = q.answer === 'Wahr'; e = { question: st, answer: my ? 'True' : 'Myth', acceptedAnswers: [my ? 'True' : 'Myth'], choices: ['True', 'Myth'], funFact: (my ? 'True: ' : 'Myth: ') + ex }; stat.manual++; }
  else if (g === 'crafting' || g === 'crafting2') { e = craftingEn(q); if (e) stat.crafting++; }
  else if (g.startsWith('w2_')) { e = w2En(q); if (e) stat.w2++; }
  else { e = build(q); if (e) stat.templ++; if (e === undefined) e = null; }
  if (e === undefined) e = null;
  if (e === null && /^(d2_|cmp_|block_|mob_|food_|item_|enchant_|craft_|biome_|crafting|w2_)/.test(g)) { stat.bad++; badList.push(q.id + ' ' + g); }
  if (e === null && !/^(d2_|cmp_|block_|mob_|food_|item_|enchant_|craft_|biome_|crafting|w2_)/.test(g)) stat.pending++;
  if (e) {
    e.question = pl1(e.question); e.funFact = pl1(e.funFact);
    if (q.type === 'number' && Number(q.answer) === 1 && e.unit) e.unit = ({ items: 'item', 'hunger points': 'hunger point', blocks: 'block', slots: 'slot', 'health points': 'health point' })[e.unit] || e.unit;
    if (e.answer && e.acceptedAnswers && q.type !== 'number') e.acceptedAnswers = aliasesOf(e.answer, e.acceptedAnswers);
  }
  result[q.id] = e;
}
// Plausibilitaet: choices index-gleich, Zahlfragen ohne answer
let probs = 0;
for (const q of qs) {
  const e = result[q.id]; if (!e) continue;
  if (q.choices && (!Array.isArray(e.choices) || e.choices.length !== q.choices.length)) { probs++; result[q.id] = null; }
  else if (!e.question) { probs++; result[q.id] = null; }
}
const have = Object.values(result).filter(Boolean).length;
console.log(`EN: ${have} von ${qs.length} Fragen haben en (Vorlagen ${stat.templ}, Crafting ${stat.crafting}, w2 ${stat.w2}, Handuebersetzung ${stat.manual}); offen/null: ${qs.length - have} (davon Vorlagen mit fehlendem Namen: ${stat.bad + probs}).`);
if (missing.size) console.log('Fehlende Namen (DE):', [...missing.keys()].slice(0, 40).join(' | '), missing.size > 40 ? '... (' + missing.size + ')' : '');
if (badList.length) console.log('Ohne EN trotz Vorlage:', badList.slice(0, 15).join(', '));
if (dry) process.exit(0);
fs.writeFileSync(path.join(root, 'questions.en.json'), JSON.stringify({ v: 1, categories: CATS, q: result }));
console.log('questions.en.json geschrieben,', (fs.statSync(path.join(root, 'questions.en.json')).size / 1024).toFixed(0), 'KB');

// ───── assets/mc/answers.en.json: englische Namen fuer Antwort-Dropdowns (Schluessel = deutscher Name wie in answers.json/icons.json) ─────
{
  const ans = JSON.parse(fs.readFileSync(path.join(root, 'assets', 'mc', 'answers.json'), 'utf8'));
  const fromQ = new Map();      // deutsche Antwort -> englische Antwort (aus den Fragen)
  qs.forEach(q => { const e = result[q.id]; if (e && e.answer && q.type !== 'number' && typeof q.answer === 'string' && !fromQ.has(q.answer)) fromQ.set(q.answer, e.answer); });
  const STATIC = { Oberwelt: 'Overworld', Ende: 'The End', Nether: 'Nether', Ja: 'Yes', Nein: 'No', Positiv: 'Positive', Negativ: 'Negative', Wahr: 'True', Mythos: 'Myth', Spitzhacke: 'Pickaxe', Axt: 'Axe', Schaufel: 'Shovel', Hacke: 'Hoe' };
  const toEn = {}, aliases = {};
  let unmapped = 0;
  ans.names.forEach(n => {
    const v = STATIC[n] || fromQ.get(n) || ['item', 'block', 'mob', 'biome', 'ench', 'effect'].map(k => maps[k].get(n)).find(Boolean);
    if (v) toEn[n] = v; else unmapped++;
  });
  Object.entries(toEn).forEach(([d, e]) => { aliases[e.toLowerCase()] = e; });
  const enNames = [...new Set(Object.values(toEn))].sort((a, b) => a.localeCompare(b, 'en'));
  console.log(`answers.en.json: ${Object.keys(toEn).length} von ${ans.names.length} Namen uebersetzt (${unmapped} ohne EN)`);
  if (!dry) fs.writeFileSync(path.join(root, 'assets', 'mc', 'answers.en.json'), JSON.stringify({ v: 1, names: enNames, toEn, aliases }));
}
