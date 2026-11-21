/**
 * Von Hand gepflegte Fakten (Runde 43, Java Edition 1.21.4, eigene Formulierung): Lebenspunkte, Berufe/Arbeitsbloecke, Brauzutaten,
 * Mob-Drops, Zaehmen/Zuechten.   node tools/gen-facts2.js [--dry]
 * Haengt Fragen mit gen 'w2_*' an questions.json an (bei jedem Lauf neu aufgebaut). IDs stabil ab 20001 (tools/facts2-ids.json).
 * Namen kommen aus de_de.json (Items/Mobs/Berufe), damit Schreibweisen zum Spiel passen. Eintraege, deren Name fehlt, werden gemeldet.
 */
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const CACHE = process.env.MC_CACHE || path.join(root, '..', 'mineguess-cache');
const dry = process.argv.includes('--dry');
const de = JSON.parse(fs.readFileSync(path.join(CACHE, 'de_de.json'), 'utf8'));
const item = k => de['item.minecraft.' + k] || de['block.minecraft.' + k];
const mob = k => de['entity.minecraft.' + k];
const job = k => de['entity.minecraft.villager.' + k];
const qPath = path.join(root, 'questions.json');
const all = JSON.parse(fs.readFileSync(qPath, 'utf8'));
const base = all.filter(q => !String(q.gen || '').startsWith('w2_'));
const hash = (s) => { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; } return h; };
const norm = s => String(s).toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/[^a-z0-9]/g, '');
const band = (t, h) => (t === 1 ? 700 + (h % 8) * 50 : t === 2 ? 1300 + (h % 8) * 100 : t === 3 ? 2300 + (h % 8) * 100 : 3300 + (h % 6) * 100);
const out = [], missing = [], seen = new Set(base.map(q => norm(q.question)));
function add(gen, key, tier, q) {
  if (seen.has(norm(q.question))) return;
  seen.add(norm(q.question));
  const h = hash(gen + key); q.rating = band(tier, h); q.tier = q.rating < 1200 ? 1 : q.rating < 2200 ? 2 : q.rating < 3200 ? 3 : 4;
  q.gen = gen; q.__key = gen + '|' + key; q.source = q.source || 'Minecraft Wiki (Java Edition 1.21.4)'; out.push(q);
}
const need = (...v) => { if (v.some(x => !x)) { missing.push(v.join('/')); return false; } return true; };

// 1) Lebenspunkte (halbe Herzen = Lebenspunkte; Spieler hat 20)
const HP = { creeper: 20, zombie: 20, skeleton: 20, spider: 16, enderman: 40, blaze: 20, ghast: 10, wither: 300, ender_dragon: 200, iron_golem: 100, witch: 26, villager: 20, cow: 10, pig: 10, sheep: 8,
  chicken: 4, guardian: 30, elder_guardian: 80, ravager: 100, warden: 500, shulker: 30, phantom: 20, drowned: 20, hoglin: 40, piglin: 16, zoglin: 40, evoker: 24, vindicator: 24, pillager: 24, vex: 14,
  silverfish: 8, endermite: 8, rabbit: 3, squid: 10, dolphin: 10, panda: 20, polar_bear: 30, fox: 10, turtle: 30, axolotl: 14, goat: 10, bee: 10, allay: 20, frog: 10, strider: 20, parrot: 6, snow_golem: 4,
  wither_skeleton: 20, breeze: 30, bogged: 16, camel: 32, sniffer: 14, armadillo: 12, husk: 20, stray: 20, cave_spider: 12, piglin_brute: 50, magma_cube: 16, mooshroom: 10, ocelot: 10, bat: 6 };
Object.entries(HP).forEach(([k, hp]) => {
  if (!need(mob(k))) return;
  const d = mob(k);
  add('w2_mob_health', k, hp >= 100 ? 3 : hp >= 30 ? 3 : 2, { type: 'number', question: `Wie viele Lebenspunkte (ein Herz = 2 Lebenspunkte) hat der Mob „${d}“?`, answer: hp, unit: 'Lebenspunkte', tolerance: 0, tolerancePct: hp >= 50 ? 10 : 0, toleranceMin: hp >= 50 ? 2 : 0, category: 'Mobs', funFact: `„${d}“ hat ${hp} Lebenspunkte, das sind ${hp / 2} Herzen. Der Spieler hat 20 Lebenspunkte (10 Herzen).` });
});
// 2) Berufe und Arbeitsplaetze
const JOBS = { farmer: 'composter', fisherman: 'barrel', shepherd: 'loom', fletcher: 'fletching_table', librarian: 'lectern', cartographer: 'cartography_table', cleric: 'brewing_stand', armorer: 'blast_furnace', weaponsmith: 'grindstone', toolsmith: 'smithing_table', butcher: 'smoker', leatherworker: 'cauldron', mason: 'stonecutter' };
Object.entries(JOBS).forEach(([j, blk]) => {
  if (!need(job(j), item(blk))) return;
  add('w2_job_block', j, 2, { type: 'entity', question: `Welcher Block ist der Arbeitsplatz eines Dorfbewohners mit dem Beruf „${job(j)}“?`, answer: item(blk), acceptedAnswers: [item(blk)], category: 'Dorfbewohner', funFact: `Der Beruf „${job(j)}“ gehört zum Block „${item(blk)}“.` });
  add('w2_block_job', blk, 2, { type: 'entity', question: `Welchen Beruf bekommt ein Dorfbewohner, wenn er den Block „${item(blk)}“ als Arbeitsplatz nutzt?`, answer: job(j), acceptedAnswers: [job(j)], category: 'Dorfbewohner', funFact: `Am Block „${item(blk)}“ arbeitet der Beruf „${job(j)}“.` });
});
// 3) Brauzutaten (auf einem Seltsamen Trank)
const BREW = { speed: ['sugar', 'swiftness'], fire_resistance: ['magma_cream', 'fire_resistance'], night_vision: ['golden_carrot', 'night_vision'], strength: ['blaze_powder', 'strength'], healing: ['glistering_melon_slice', 'healing'], regeneration: ['ghast_tear', 'regeneration'], poison: ['spider_eye', 'poison'], weakness: ['fermented_spider_eye', 'weakness'], water_breathing: ['pufferfish', 'water_breathing'], leaping: ['rabbit_foot', 'leaping'], slow_falling: ['phantom_membrane', 'slow_falling'], turtle_master: ['turtle_helmet', 'turtle_master'] };
Object.entries(BREW).forEach(([k, [ing, eff]]) => {
  const effName = de['effect.minecraft.' + (k === 'speed' ? 'speed' : k)] || de['item.minecraft.potion.effect.' + eff];
  if (!need(item(ing), de['item.minecraft.potion.effect.' + eff])) return;
  const tn = de['item.minecraft.potion.effect.' + eff].replace(/^Trank der? /, '').replace(/^Trank des? /, '');
  add('w2_brew', k, ing === 'sugar' || ing === 'blaze_powder' ? 2 : 3, { type: 'entity', question: `Welche Zutat braucht man, um aus einem Seltsamen Trank „${de['item.minecraft.potion.effect.' + eff]}“ zu brauen?`, answer: item(ing), acceptedAnswers: [item(ing)], category: 'Tränke', funFact: `„${de['item.minecraft.potion.effect.' + eff]}“ entsteht aus dem Seltsamen Trank und ${item(ing)}.` });
});
// 4) Mob-Drops (Was laesst X fallen / Wer laesst X fallen)
// nur eindeutige Drops (Mobs mit mehreren typischen Drops wie Zombie, Spinne, Skelett, Kuh, Eisengolem, Huhn sind ausgenommen)
const DROPS = { creeper: 'gunpowder', enderman: 'ender_pearl', blaze: 'blaze_rod', ghast: 'ghast_tear', slime: 'slime_ball', rabbit: 'rabbit_foot', squid: 'ink_sac', phantom: 'phantom_membrane', shulker: 'shulker_shell', guardian: 'prismarine_shard', wither_skeleton: 'wither_skeleton_skull', evoker: 'totem_of_undying', sniffer: 'sniffer_egg', turtle: 'scute' };
const NO_REVERSE = new Set(['creeper', 'guardian', 'rabbit', 'squid', 'slime', 'turtle', 'sniffer']);      // mehrere Mobs liefern dasselbe Item
Object.entries(DROPS).forEach(([m, it]) => {
  if (!need(mob(m), item(it))) return;
  add('w2_mob_drop', m, 2, { type: 'entity', question: `Welches Item lässt der Mob „${mob(m)}“ als typischen Drop fallen oder liefert er?`, answer: item(it), acceptedAnswers: [item(it)], category: 'Mobs', funFact: `„${mob(m)}“ lässt „${item(it)}“ fallen.` });
  if (!NO_REVERSE.has(m)) add('w2_drop_mob', it, 2, { type: 'entity', question: `Welcher Mob lässt „${item(it)}“ fallen?`, answer: mob(m), acceptedAnswers: [mob(m)], category: 'Mobs', funFact: `„${item(it)}“ bekommt man von „${mob(m)}“.` });
});
// 5) Zaehmen und Zuechten
const BREED = { cow: 'wheat', pig: 'carrot', sheep: 'wheat', chicken: 'wheat_seeds', rabbit: 'dandelion', llama: 'hay_block', turtle: 'seagrass', panda: 'bamboo', fox: 'sweet_berries', axolotl: 'tropical_fish_bucket', camel: 'cactus', frog: 'slime_ball', goat: 'wheat', hoglin: 'crimson_fungus', strider: 'warped_fungus', sniffer: 'torchflower_seeds', horse: 'golden_apple' };
const BREED_ALT = { pig: ['potato', 'beetroot'], chicken: ['pumpkin_seeds', 'melon_seeds', 'beetroot_seeds'], rabbit: ['carrot', 'golden_carrot'], fox: ['glow_berries'], horse: ['golden_carrot'], sheep: [], cow: [], goat: [] };
Object.entries(BREED).forEach(([m, it]) => {
  if (!need(mob(m), item(it))) return;
  add('w2_breed', m, 2, { type: 'entity', question: `Mit welchem Item bringt man den Mob „${mob(m)}“ in den Liebesmodus (Nachwuchs)?`, answer: item(it), acceptedAnswers: [item(it), ...(BREED_ALT[m] || []).map(item).filter(Boolean)], category: 'Mobs', funFact: `„${mob(m)}“ vermehrt sich mit „${item(it)}“${(BREED_ALT[m] || []).length ? ' (und weiteren Futtersorten)' : ''}.` });
});
const TAME = { wolf: 'bone', cat: 'cod', parrot: 'wheat_seeds' };
Object.entries(TAME).forEach(([m, it]) => {
  if (!need(mob(m), item(it))) return;
  add('w2_tame', m, 1, { type: 'entity', question: `Mit welchem Item zähmt man den Mob „${mob(m)}“?`, answer: item(it), acceptedAnswers: m === 'cat' ? [item(it), item('salmon')] : m === 'parrot' ? [item(it), item('melon_seeds'), item('pumpkin_seeds'), item('beetroot_seeds')] : [item(it)], category: 'Mobs', funFact: m === 'cat' ? `Katzen werden mit rohem Kabeljau oder Lachs gezähmt.` : m === 'parrot' ? `Papageien werden mit Samen gezähmt.` : `Wölfe werden mit Knochen gezähmt.` });
});

const idsPath = path.join(__dirname, 'facts2-ids.json');
const ids = fs.existsSync(idsPath) ? JSON.parse(fs.readFileSync(idsPath, 'utf8')) : {};
let next = Math.max(20000, ...Object.values(ids)) + 1;
out.forEach(q => { if (!ids[q.__key]) ids[q.__key] = next++; q.id = ids[q.__key]; delete q.__key; });
out.sort((a, b) => a.id - b.id);
const t = {}, c = {}; out.forEach(q => { t[q.tier] = (t[q.tier] || 0) + 1; c[q.category] = (c[q.category] || 0) + 1; });
console.log('Fakten-Fragen:', out.length, 'Tier', JSON.stringify(t), JSON.stringify(c), missing.length ? 'FEHLENDE NAMEN: ' + missing.join(', ') : '');
if (dry) process.exit(0);
fs.writeFileSync(idsPath, JSON.stringify(ids));
fs.writeFileSync(qPath, JSON.stringify(base.concat(out), null, 2));
console.log('questions.json:', base.length + out.length, 'Fragen');
