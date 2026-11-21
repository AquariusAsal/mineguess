/**
 * Datenbasierte Zusatzfragen (Runde 43) aus minecraft-data (Java 1.21.4, ../mineguess-cache): Zahl, ODER, Entity.
 *   node tools/gen-data2.js [--dry] [--limit=<n je Vorlage>]
 * Haengt Fragen mit gen 'd2_*' an questions.json an (bei jedem Lauf neu aufgebaut, bestehende Fragen/IDs bleiben unveraendert).
 * Stabile IDs ab 10001 ueber tools/data2-ids.json (Schluessel = Vorlage + Gegenstand/Paar).
 * Qualitaet: nur Gegenstaende mit deutschem Namen und Item/Block im Spiel, keine Technik-Bloecke, eine Farbvariante je Familie,
 * nichts, was schon als Zahl-/Vergleichsfrage existiert, Antwort eindeutig, Rating/Tier nach Bekanntheit (Rezepte/Nahrung/Werkzeuge = leichter).
 * Version: Java Edition 1.21.4 (Stand der minecraft-data). Quelle je Frage im Feld source.
 */
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const CACHE = process.env.MC_CACHE || path.join(root, '..', 'mineguess-cache');
const dry = process.argv.includes('--dry');
const LIMIT = Number((process.argv.find(a => a.startsWith('--limit=')) || '').slice(8)) || 140;
const J = f => JSON.parse(fs.readFileSync(path.join(CACHE, f), 'utf8'));
const de = J('de_de.json'), en = J('en_us.json');
const blocks = J('blocks.json'), items = J('items.json'), foods = J('foods.json'), ents = J('entities.json'), ench = J('enchantments.json'), effects = J('effects.json'), biomes = J('biomes.json'), recipes = J('recipes.json');
const nm = k => de['item.minecraft.' + k] || de['block.minecraft.' + k] || null;
const nmE = (key, pre) => de[pre + key] || null;
const itemByName = new Map(items.map(i => [i.name, i]));
const qPath = path.join(root, 'questions.json');
const all = JSON.parse(fs.readFileSync(qPath, 'utf8'));
const base = all.filter(q => !String(q.gen || '').startsWith('d2_'));
const hash = (s) => { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; } return h; };
const norm = s => String(s).toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/[^a-z0-9]/g, '');
const fmt = (n) => String(Math.round(n * 100) / 100).replace('.', ',');

// "Bekanntheit": Items/Bloecke, die in Rezepten vorkommen (Zutat oder Ergebnis) oder Nahrung/Werkzeug/Ruestung sind
const idName = new Map(items.map(i => [i.id, i.name]));
const common = new Set();
Object.entries(recipes).forEach(([rid, list]) => { common.add(idName.get(Number(rid))); list.forEach(v => (v.inShape ? v.inShape.flat() : v.ingredients || []).forEach(id => common.add(idName.get(id)))); });
foods.forEach(f => common.add(f.name));
// bereits gestellte Gegenstaende (Anfuehrungszeichen im Fragetext) je Familie von Vorlagen
const quoted = (q) => (String(q.question).match(/„([^“]+)“/g) || []).map(s => s.slice(1, -1));
const usedBy = {};      // Vorlagen-Gruppe -> Set(normierte Namen)
const mark = (grp, q) => quoted(q).forEach(n => { (usedBy[grp] = usedBy[grp] || new Set()).add(norm(n)); });
base.forEach(q => { if (q.gen === 'block_haerte') mark('haerte', q); if (q.gen === 'block_resistance') mark('resist', q); if (q.gen === 'block_light') mark('light', q); if (q.gen === 'item_durability') mark('dur', q); if (q.gen === 'item_stack') mark('stack', q); if (q.gen === 'food_points') mark('food', q); if (q.gen === 'mob_height') mark('mobh', q); if (q.gen === 'mob_width') mark('mobw', q); if (q.gen === 'enchant_max') mark('ench', q); if (q.gen === 'block_tool') mark('tool', q); });
const usedPairs = new Set(base.filter(q => /^cmp_/.test(q.gen || '')).map(q => q.gen + '|' + (q.choices || []).map(norm).sort().join('|')));
const isUsed = (grp, name) => (usedBy[grp] || new Set()).has(norm(name));

const TECH = /(command_block|structure|jigsaw|barrier|^light$|_air$|^air$|debug|spawner|test_|potted_|wall_sign|wall_banner|wall_head|wall_skull|wall_torch|wall_hanging|^infested_|cauldron|bubble_column|moving_piston|piston_head|_plant$|tripwire|redstone_wire|frosted_ice|^lava$|^water$|^fire$|soul_fire|_portal|end_gateway|^void|attached_|_stem$|_crop$|^carrots|^potatoes|^beetroots|sweet_berry|powder_snow$|player_|^skeleton_wall|reinforced_deepslate|^bedrock$|vault|trial|creaking|heavy_core|^cake$|candle_cake|_cake$|^sculk_vein|^glow_lichen|^kelp$|^seagrass|^tall_seagrass|^cobweb|^short_grass|^tall_grass|^large_fern|^fern$)/;
const COLOR = /^(white|orange|magenta|light_blue|yellow|lime|pink|gray|light_gray|cyan|purple|blue|brown|green|red|black)_/;
const famCount = {};
function famOk(k) { const f = k.replace(COLOR, 'COLOR_').replace(/^(oak|spruce|birch|jungle|acacia|dark_oak|mangrove|cherry|pale_oak|crimson|warped|bamboo)_/, 'WOOD_').replace(/^(waxed_|exposed_|weathered_|oxidized_)+/, 'CU_'); famCount[f] = (famCount[f] || 0) + 1; return famCount[f] <= 1; }

const out = [];
const ids = fs.existsSync(path.join(__dirname, 'data2-ids.json')) ? JSON.parse(fs.readFileSync(path.join(__dirname, 'data2-ids.json'), 'utf8')) : {};
const seenQ = new Set(base.map(q => norm(q.question)));
const tierOf = (r) => (r < 1200 ? 1 : r < 2200 ? 2 : r < 3200 ? 3 : 4);
const band = (t, h) => (t === 1 ? 700 + (h % 8) * 50 : t === 2 ? 1300 + (h % 8) * 100 : t === 3 ? 2300 + (h % 8) * 100 : 3300 + (h % 6) * 100);
const nice = (v) => (Math.abs(v * 1000 - Math.round(v * 1000)) < 1e-6 ? Math.round(v * 1000) / 1000 : Math.round(v * 100) / 100);      // keine krummen Nachkommastellen (1,3964844 -> 1,4)
function add(gen, key, q, tier) {
  if (q.type === 'number' && typeof q.answer === 'number') q.answer = nice(q.answer);
  const text = norm(q.question);
  if (seenQ.has(text)) return false;
  seenQ.add(text);
  const h = hash(gen + '|' + key);
  q.rating = band(tier, h); q.tier = tierOf(q.rating); q.gen = gen; q.source = q.source || 'minecraft-data 1.21.4';
  q.__key = gen + '|' + key; out.push(q); return true;
}
const perGen = {};
const capOk = (gen, cap) => { perGen[gen] = perGen[gen] || 0; return perGen[gen] < (cap || LIMIT); };
const bump = (gen) => { perGen[gen] = (perGen[gen] || 0) + 1; };
const shuf0 = (arr, seed) => arr.slice().sort((a, b) => hash(seed + a) - hash(seed + b) || (a < b ? -1 : 1));
// bekannte Gegenstaende (Rezepte, Nahrung) zuerst, danach seltene: so bleibt der Anteil Obskurer klein
const shuf = (arr, seed) => { const s0 = shuf0(arr, seed); return [...s0.filter(n => common.has(n)), ...s0.filter(n => !common.has(n))]; };
const obscureOk = (gen, isObscure) => { const c = perGen['com_' + gen] || 0, o = perGen['obs_' + gen] || 0; if (!isObscure) { perGen['com_' + gen] = c + 1; return true; } if (o >= Math.floor(c * 0.5) + 3) return false; perGen['obs_' + gen] = o + 1; return true; };
const toleranceFor = (v) => (Number.isInteger(v) ? (v <= 3 ? { tolerance: 0 } : { tolerance: 0, tolerancePct: 10, toleranceMin: 1 }) : { tolerance: 0, tolerancePct: 15, toleranceMin: 0.3 });

// ── Block-Kandidaten ──
const DERIV = /(_slab|_stairs|_wall|_fence|_fence_gate|_door|_trapdoor|_button|_pressure_plate|_pane|_carpet|_bed|_banner|_sign|_hanging_sign|_candle|_head|_skull)$/;
const blk = blocks.filter(b => b.boundingBox === 'block' && !DERIV.test(b.name) && nm(b.name) && itemByName.has(b.name) && !TECH.test(b.name) && nm(b.name) !== (en['block.minecraft.' + b.name] || '') + '#').filter(b => famOk(b.name));
const pre = (b) => (common.has(b.name) ? 0 : 1);        // 0 = bekannt (leichter), 1 = selten

// N1 Haerte
shuf(blk.filter(b => b.hardness > 0 && b.hardness <= 100 && !isUsed('haerte', nm(b.name))).map(b => b.name), 'h').forEach(n => {
  const b = blocks.find(x => x.name === n); if (!capOk('d2_block_haerte') || !obscureOk('haerte', pre(b))) return;
  const q = { type: 'number', question: `Wie hoch ist die Härte des Blocks „${nm(n)}“?`, answer: b.hardness, unit: '', ...toleranceFor(b.hardness), category: 'Blöcke', funFact: `„${nm(n)}“ hat die Härte ${fmt(b.hardness)}. Zum Vergleich: Stein hat 1,5, Obsidian 50.`, source: 'Härte (minecraft-data 1.21.4)' };
  if (add('d2_block_haerte', n, q, pre(b) ? 4 : 2)) bump('d2_block_haerte');
});
// N2 Explosionsresistenz
shuf(blk.filter(b => b.resistance > 0 && b.resistance < 3600000 && !isUsed('resist', nm(b.name))).map(b => b.name), 'r').forEach(n => {
  const b = blocks.find(x => x.name === n); if (!capOk('d2_block_resistance') || !obscureOk('resist', pre(b))) return;
  const q = { type: 'number', question: `Wie hoch ist die Explosionsresistenz des Blocks „${nm(n)}“?`, answer: b.resistance, unit: '', ...toleranceFor(b.resistance), category: 'Blöcke', funFact: `„${nm(n)}“ hat die Explosionsresistenz ${fmt(b.resistance)}. Zum Vergleich: Stein 6, Obsidian 1200.`, source: 'Explosionsresistenz (minecraft-data 1.21.4)' };
  if (add('d2_block_resistance', n, q, pre(b) ? 4 : 3)) bump('d2_block_resistance');
});
// N3 Lichtstufe
shuf(blk.filter(b => b.emitLight > 0 && !isUsed('light', nm(b.name))).map(b => b.name), 'l').forEach(n => {
  const b = blocks.find(x => x.name === n); if (!capOk('d2_block_light') || !obscureOk('light', pre(b))) return;
  const q = { type: 'number', question: `Welche Lichtstärke (0 bis 15) strahlt der Block „${nm(n)}“ aus?`, answer: b.emitLight, unit: '', tolerance: 0, category: 'Blöcke', funFact: `„${nm(n)}“ leuchtet mit Lichtstärke ${b.emitLight}.`, source: 'Licht (minecraft-data 1.21.4)' };
  if (add('d2_block_light', n, q, pre(b) ? 3 : 2)) bump('d2_block_light');
});
// N4 Stapelgroesse und Haltbarkeit
const itemOk = (i) => nm(i.name) && !TECH.test(i.name) && !/spawn_egg|_banner_pattern|music_disc|smithing_template|command|debug|knowledge|filled_map|written_book|^bundle|_bundle$|potion|tipped_arrow|firework_star|enchanted_book|suspicious/.test(i.name);
shuf(items.filter(i => itemOk(i) && !isUsed('stack', nm(i.name)) && i.stackSize !== 64 && famOk('stack_' + i.name)).map(i => i.name), 's').forEach(n => {
  const i = itemByName.get(n); if (!capOk('d2_item_stack')) return;
  const q = { type: 'number', question: `Wie viele „${nm(n)}“ passen höchstens in einen Stapel (ein Inventarfeld)?`, answer: i.stackSize, unit: 'Stück', tolerance: 0, category: 'Items', funFact: `„${nm(n)}“ stapelt sich bis ${i.stackSize}${i.stackSize === 1 ? ' (nicht stapelbar)' : ''}.`, source: 'Stapelgröße (minecraft-data 1.21.4)' };
  if (add('d2_item_stack', n, q, i.stackSize === 16 ? 3 : 2)) bump('d2_item_stack');
});
shuf(items.filter(i => itemOk(i) && i.maxDurability && !isUsed('dur', nm(i.name))).map(i => i.name), 'd').forEach(n => {
  const i = itemByName.get(n); if (!capOk('d2_item_durability')) return;
  const q = { type: 'number', question: `Wie viele Nutzungen hält „${nm(n)}“ aus (Haltbarkeit)?`, answer: i.maxDurability, unit: 'Haltbarkeit', tolerance: 0, tolerancePct: 10, toleranceMin: 2, category: 'Items', funFact: `„${nm(n)}“ hat eine Haltbarkeit von ${i.maxDurability}.`, source: 'Haltbarkeit (minecraft-data 1.21.4)' };
  if (add('d2_item_durability', n, q, common.has(n) ? 3 : 4)) bump('d2_item_durability');
});
// N6 Nahrung
shuf(foods.filter(f => nm(f.name) && !isUsed('food', nm(f.name))).map(f => f.name), 'f').forEach(n => {
  const f = foods.find(x => x.name === n); if (!capOk('d2_food_points')) return;
  const q = { type: 'number', question: `Wie viele Hungerpunkte (halbe Keulen) füllt „${nm(n)}“ auf?`, answer: f.foodPoints, unit: 'Hungerpunkte', tolerance: 0, category: 'Essen & Nahrung', funFact: `„${nm(n)}“ füllt ${f.foodPoints} Hungerpunkte auf (${fmt(f.foodPoints / 2)} Keulen).`, source: 'Nahrung (minecraft-data 1.21.4)' };
  if (add('d2_food_points', n, q, 2)) bump('d2_food_points');
});
// N7 Mobs: Hoehe und Breite
const mobs = ents.filter(e => ['hostile', 'animal', 'passive', 'water_creature', 'ambient', 'mob'].includes(e.type) && nm(e.name) === null && (de['entity.minecraft.' + e.name])).map(e => ({ name: e.name, de: de['entity.minecraft.' + e.name], w: e.width, h: e.height }));
shuf(mobs.filter(m => !isUsed('mobh', m.de)).map(m => m.name), 'mh').forEach(n => {
  const m = mobs.find(x => x.name === n); if (!capOk('d2_mob_height')) return;
  const q = { type: 'number', question: `Wie viele Blöcke hoch ist der Mob „${m.de}“?`, answer: m.h, unit: 'Blöcke', tolerance: 0, tolerancePct: 10, toleranceMin: 0.1, category: 'Mobs', funFact: `„${m.de}“ ist ${fmt(m.h)} Blöcke hoch. Der Spieler misst 1,8 Blöcke.`, source: 'Mob-Maße (minecraft-data 1.21.4)' };
  if (add('d2_mob_height', n, q, 3)) bump('d2_mob_height');
});
shuf(mobs.filter(m => !isUsed('mobw', m.de)).map(m => m.name), 'mw').forEach(n => {
  const m = mobs.find(x => x.name === n); if (!capOk('d2_mob_width')) return;
  const q = { type: 'number', question: `Wie viele Blöcke breit ist der Mob „${m.de}“?`, answer: m.w, unit: 'Blöcke', tolerance: 0, tolerancePct: 10, toleranceMin: 0.1, category: 'Mobs', funFact: `„${m.de}“ ist ${fmt(m.w)} Blöcke breit. Der Spieler misst 0,6 Blöcke.`, source: 'Mob-Maße (minecraft-data 1.21.4)' };
  if (add('d2_mob_width', n, q, 3)) bump('d2_mob_width');
});
// N8 Verzauberungen
shuf(ench.filter(e => de['enchantment.minecraft.' + e.name] && !isUsed('ench', de['enchantment.minecraft.' + e.name])).map(e => e.name), 'e').forEach(n => {
  const e = ench.find(x => x.name === n), d = de['enchantment.minecraft.' + n]; if (!capOk('d2_enchant_max')) return;
  const q = { type: 'number', question: `Bis zu welcher Stufe lässt sich „${d}“ normal verzaubern?`, answer: e.maxLevel, unit: '', tolerance: 0, category: 'Verzauberungen', funFact: `„${d}“ geht im Normalfall bis Stufe ${e.maxLevel}.`, source: 'Verzauberungen (minecraft-data 1.21.4)' };
  if (add('d2_enchant_max', n, q, 3)) bump('d2_enchant_max');
});

// ── ODER-Vergleiche (neue Paare) ──
function cmpGen(gen, label, list, key, qtext, fact, cat, cap, minRatio) {
  cap = Math.min(cap, 230);      // Vergleichsfragen begrenzen (Formatmix)
  const arr = list.filter(x => x[key] != null && x.de).sort((a, b) => a.name < b.name ? -1 : 1);
  const pairs = [];
  for (let i = 0; i < arr.length; i++) for (let j = i + 1; j < arr.length; j++) {
    const a = arr[i], b = arr[j], hi = Math.max(a[key], b[key]), lo = Math.min(a[key], b[key]);
    if (hi === lo || norm(a.de) === norm(b.de)) continue;
    const ratio = lo > 0 ? hi / lo : 99;
    if (ratio < minRatio) continue;
    pairs.push({ a, b, ratio });
  }
  let n = 0;
  for (const p of shuf(pairs.map((x, i) => i + ''), gen).map(i => pairs[Number(i)])) {
    if (n >= cap) break;
    const win = p.a[key] > p.b[key] ? p.a : p.b, lose = win === p.a ? p.b : p.a;
    const usedKey = gen + '|' + [norm(p.a.de), norm(p.b.de)].sort().join('|');
    const legacy = gen.replace('d2_', '');
    if (usedPairs.has(legacy + '|' + [norm(p.a.de), norm(p.b.de)].sort().join('|'))) continue;
    // jeder Gegenstand hoechstens 3x je Vorlage (Vielfalt)
    cmpGen.cnt = cmpGen.cnt || {};
    const ck1 = gen + norm(p.a.de), ck2 = gen + norm(p.b.de);
    if ((cmpGen.cnt[ck1] || 0) >= 5 || (cmpGen.cnt[ck2] || 0) >= 5) continue;
    const choices = hash(usedKey) % 2 ? [p.a.de, p.b.de] : [p.b.de, p.a.de];
    const tier0 = p.ratio >= 6 ? 1 : p.ratio >= 3 ? 2 : p.ratio >= 1.8 ? 3 : 4, kc = (p.a.c ? 1 : 0) + (p.b.c ? 1 : 0);
    const tier = kc === 2 ? tier0 : kc === 1 ? Math.max(tier0, 3) : 4;       // Tier 1/2 nur mit bekannten Dingen, Obskures = Tier 4
    const q = { type: 'entity', question: qtext(p.a.de, p.b.de), answer: win.de, acceptedAnswers: [win.de], category: cat, funFact: fact(win, lose), choices, source: label };
    if (add(gen, usedKey, q, tier)) { n++; cmpGen.cnt[ck1] = (cmpGen.cnt[ck1] || 0) + 1; cmpGen.cnt[ck2] = (cmpGen.cnt[ck2] || 0) + 1; }
  }
}
const KNOWN_MOB = new Set(['creeper', 'zombie', 'skeleton', 'spider', 'enderman', 'blaze', 'ghast', 'wither', 'ender_dragon', 'iron_golem', 'snow_golem', 'witch', 'villager', 'cow', 'pig', 'sheep', 'chicken', 'horse', 'wolf', 'cat', 'rabbit', 'squid', 'bat', 'slime', 'magma_cube', 'guardian', 'phantom', 'drowned', 'piglin', 'hoglin', 'panda', 'fox', 'bee', 'turtle', 'dolphin', 'llama', 'parrot', 'polar_bear', 'axolotl', 'warden', 'mooshroom', 'ocelot', 'donkey', 'mule', 'husk', 'stray', 'silverfish', 'vex', 'evoker', 'pillager', 'ravager', 'strider', 'goat', 'frog', 'allay', 'camel', 'sniffer', 'armadillo', 'cave_spider', 'wither_skeleton', 'zombie_villager']);
const KNOWN_BIOME = new Set(['plains', 'desert', 'forest', 'taiga', 'jungle', 'ocean', 'swamp', 'savanna', 'snowy_plains', 'nether_wastes', 'the_end', 'badlands', 'mushroom_fields', 'deep_dark', 'cherry_grove', 'meadow', 'dark_forest', 'birch_forest', 'ice_spikes', 'frozen_ocean', 'warm_ocean', 'lukewarm_ocean', 'crimson_forest', 'warped_forest', 'soul_sand_valley', 'basalt_deltas', 'dripstone_caves', 'lush_caves', 'mangrove_swamp', 'beach', 'river', 'windswept_hills', 'sunflower_plains', 'bamboo_jungle', 'old_growth_pine_taiga', 'snowy_taiga']);
const blkL = blk.map(b => ({ name: b.name, c: common.has(b.name), de: nm(b.name), h: b.hardness, r: b.resistance, l: b.emitLight })).filter(b => common.has(b.name) || b.l > 0 || b.h >= 5);
cmpGen('d2_cmp_hardness', 'Härte (minecraft-data 1.21.4)', blkL.filter(b => b.h > 0 && b.h < 100), 'h', (a, b) => `Welcher Block ist härter: „${a}“ oder „${b}“?`, (w, l) => `„${w.de}“ (Härte ${fmt(w.h)}) ist härter als „${l.de}“ (Härte ${fmt(l.h)}).`, 'Blöcke', LIMIT, 2);
cmpGen('d2_cmp_resistance', 'Explosionsresistenz (minecraft-data 1.21.4)', blkL.filter(b => b.r > 0 && b.r < 3600000), 'r', (a, b) => `Welcher Block widersteht Explosionen besser: „${a}“ oder „${b}“?`, (w, l) => `„${w.de}“ (Resistenz ${fmt(w.r)}) hält mehr aus als „${l.de}“ (Resistenz ${fmt(l.r)}).`, 'Blöcke', LIMIT, 2.5);
cmpGen('d2_cmp_light', 'Licht (minecraft-data 1.21.4)', blkL.filter(b => b.l > 0), 'l', (a, b) => `Welcher Block leuchtet heller: „${a}“ oder „${b}“?`, (w, l) => `„${w.de}“ (Lichtstärke ${w.l}) leuchtet heller als „${l.de}“ (Lichtstärke ${l.l}).`, 'Blöcke', Math.min(LIMIT, 80), 1.2);
const mobL = mobs.map(m => ({ name: m.name, c: KNOWN_MOB.has(m.name), de: m.de, h: m.h, w: m.w }));
cmpGen('d2_cmp_height', 'Mob-Maße (minecraft-data 1.21.4)', mobL, 'h', (a, b) => `Welcher Mob ist höher: „${a}“ oder „${b}“?`, (w, l) => `„${w.de}“ ist ${fmt(w.h)} Blöcke hoch, „${l.de}“ nur ${fmt(l.h)}.`, 'Mobs', LIMIT, 1.4);
cmpGen('d2_cmp_width', 'Mob-Maße (minecraft-data 1.21.4)', mobL, 'w', (a, b) => `Welcher Mob ist breiter: „${a}“ oder „${b}“?`, (w, l) => `„${w.de}“ ist ${fmt(w.w)} Blöcke breit, „${l.de}“ nur ${fmt(l.w)}.`, 'Mobs', LIMIT, 1.4);
const foodL = foods.filter(f => nm(f.name)).map(f => ({ name: f.name, c: true, de: nm(f.name), p: f.foodPoints, s: f.saturation }));
cmpGen('d2_cmp_food', 'Nahrung (minecraft-data 1.21.4)', foodL, 'p', (a, b) => `Was stellt mehr Hungerpunkte wieder her: „${a}“ oder „${b}“?`, (w, l) => `„${w.de}“ füllt ${w.p} Hungerpunkte auf, „${l.de}“ nur ${l.p}.`, 'Essen & Nahrung', Math.min(LIMIT, 100), 1.5);
// Saettigungsvergleich entfernt: das Feld saturation der minecraft-data ist kein Spielwert
// cmpGen('d2_cmp_saturation', 'Sättigung (minecraft-data 1.21.4)', foodL, 's', (a, b) => `Welches Essen sättigt länger (höhere Sättigung): „${a}“ oder „${b}“?`, (w, l) => `„${w.de}“ hat Sättigung ${fmt(w.s)}, „${l.de}“ nur ${fmt(l.s)}.`, 'Essen & Nahrung', Math.min(LIMIT, 100), 1.6);
const durL = items.filter(i => itemOk(i) && i.maxDurability).map(i => ({ name: i.name, c: common.has(i.name), de: nm(i.name), d: i.maxDurability }));
cmpGen('d2_cmp_durability', 'Haltbarkeit (minecraft-data 1.21.4)', durL, 'd', (a, b) => `Was hält länger: „${a}“ oder „${b}“?`, (w, l) => `„${w.de}“ hat Haltbarkeit ${w.d}, „${l.de}“ nur ${l.d}.`, 'Items', LIMIT, 1.4);
const bioL = biomes.filter(b => de['biome.minecraft.' + b.name] && b.name !== 'the_void').map(b => ({ name: b.name, c: KNOWN_BIOME.has(b.name), de: de['biome.minecraft.' + b.name], t: b.temperature }));
cmpGen('d2_cmp_biome_temp', 'Biom-Temperatur (minecraft-data 1.21.4)', bioL, 't', (a, b) => `Welches Biom ist wärmer (höhere Temperatur): „${a}“ oder „${b}“?`, (w, l) => `„${w.de}“ hat die Temperatur ${fmt(w.t)}, „${l.de}“ nur ${fmt(l.t)}.`, 'Biome', Math.min(LIMIT, 70), 1.4);

// ── Entity: Biom-Dimension, Werkzeug, Effekt gut/schlecht ──
const DIM = { overworld: 'Oberwelt', nether: 'Nether', the_end: 'Ende' };
const ownDim = new Set(base.filter(q => q.gen === 'biome_dimension').map(q => norm((quoted(q)[0]) || '')));
shuf(biomes.filter(b => de['biome.minecraft.' + b.name] && DIM[b.dimension] && !ownDim.has(norm(de['biome.minecraft.' + b.name]))).map(b => b.name), 'bd').forEach(n => {
  const b = biomes.find(x => x.name === n), d = de['biome.minecraft.' + n]; if (!capOk('d2_biome_dimension', 60)) return;
  if (b.dimension === 'overworld') { perGen.ow = (perGen.ow || 0) + 1; if (perGen.ow > 18) return; }       // Oberwelt-Biome nur einige (sonst zu einseitig)
  const q = { type: 'entity', question: `In welcher Dimension liegt das Biom „${d}“?`, answer: DIM[b.dimension], acceptedAnswers: [DIM[b.dimension]], category: 'Biome', funFact: `Das Biom „${d}“ gehört zur Dimension ${DIM[b.dimension]}.`, source: 'Biome (minecraft-data 1.21.4)', choices: ['Oberwelt', 'Nether', 'Ende'].length === 3 ? undefined : undefined };
  delete q.choices;
  if (add('d2_biome_dimension', n, q, 2)) bump('d2_biome_dimension');
});
const TOOL = { pickaxe: ['Spitzhacke', ['Spitzhacke', 'Pickaxe']], axe: ['Axt', ['Axt', 'Axe']], shovel: ['Schaufel', ['Schaufel', 'Shovel']], hoe: ['Hacke', ['Hacke', 'Hoe']] };
shuf(blk.filter(b => /^mineable\//.test(b.material || '') && TOOL[b.material.split('/')[1]] && b.hardness > 0 && !isUsed('tool', nm(b.name))).map(b => b.name), 't').forEach(n => {
  const b = blocks.find(x => x.name === n); const t = TOOL[b.material.split('/')[1]]; if (!capOk('d2_block_tool', 100)) return;
  const q = { type: 'entity', question: `Mit welchem Werkzeug baut man den Block „${nm(n)}“ am schnellsten ab?`, answer: t[0], acceptedAnswers: t[1], category: 'Gameplay', funFact: `„${nm(n)}“ wird mit der ${t[0]} am schnellsten abgebaut.`, source: 'Werkzeuge (minecraft-data 1.21.4)' };
  if (add('d2_block_tool', n, q, pre(b) ? 3 : 1)) bump('d2_block_tool');
});
shuf(effects.filter(e => de['effect.minecraft.' + e.name.replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase()]).map(e => e.name), 'fx').forEach(n => {
  const e = effects.find(x => x.name === n), d = de['effect.minecraft.' + n.replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase()]; if (!capOk('d2_effect_type', 60)) return;
  const ans = e.type === 'good' ? 'Positiv' : 'Negativ';
  const q = { type: 'entity', question: `Gilt der Statuseffekt „${d}“ im Spiel als positiv oder negativ?`, answer: ans, acceptedAnswers: [ans], category: 'Tränke', funFact: `„${d}“ ist ein ${ans === 'Positiv' ? 'positiver' : 'negativer'} Effekt.`, choices: ['Positiv', 'Negativ'], source: 'Effekte (minecraft-data 1.21.4)' };
  if (add('d2_effect_type', n, q, 2)) bump('d2_effect_type');
});

// ── Zusatzvorlagen: Mindest-Spitzhacke, Biom-Niederschlag, Block-Drops ──
const PICK = [['stone_pickaxe', 'Steinspitzhacke'], ['iron_pickaxe', 'Eisenspitzhacke'], ['diamond_pickaxe', 'Diamantspitzhacke']];
const pickId = (n) => (itemByName.get(n) || {}).id;
const tierOfBlock = (b) => {
  const h = b.harvestTools || {}; if (!Object.keys(h).length) return null;
  const has = (n) => h[pickId(n)] === true;
  if (has('wooden_pickaxe')) return 'Holzspitzhacke'; if (has('stone_pickaxe')) return 'Steinspitzhacke'; if (has('iron_pickaxe')) return 'Eisenspitzhacke'; if (has('diamond_pickaxe')) return 'Diamantspitzhacke';
  return null;
};
shuf(blk.filter(b => b.material && /pickaxe/.test(b.material) && b.hardness > 0 && tierOfBlock(b)).map(b => b.name), 'mp').forEach(n => {
  const b = blocks.find(x => x.name === n), t = tierOfBlock(b); if (!capOk('d2_min_pickaxe', 90)) return;
  const q = { type: 'entity', question: `Welche Spitzhacke ist mindestens nötig, damit „${nm(n)}“ beim Abbau etwas fallen lässt?`, answer: t, acceptedAnswers: [t], category: 'Gameplay', funFact: `„${nm(n)}“ lässt erst ab der ${t} etwas fallen.`, source: 'Werkzeugstufen (minecraft-data 1.21.4)' };
  if (add('d2_min_pickaxe', n, q, t === 'Holzspitzhacke' ? 1 : t === 'Steinspitzhacke' ? 2 : 3)) bump('d2_min_pickaxe');
});
let ja = 0, nein = 0;
shuf(biomes.filter(b => de['biome.minecraft.' + b.name] && b.dimension === 'overworld').map(b => b.name), 'bp').forEach(n => {
  const b = biomes.find(x => x.name === n), d = de['biome.minecraft.' + n];
  if (b.has_precipitation) { if (ja >= 24) return; ja++; } else { if (nein >= 24) return; nein++; }
  const ans = b.has_precipitation ? 'Ja' : 'Nein';
  const q = { type: 'entity', question: `Gibt es im Biom „${d}“ Niederschlag (Regen oder Schnee)?`, answer: ans, acceptedAnswers: [ans], category: 'Biome', funFact: b.has_precipitation ? `Im Biom „${d}“ regnet oder schneit es.` : `Im Biom „${d}“ gibt es weder Regen noch Schnee.`, choices: ['Ja', 'Nein'], source: 'Biome (minecraft-data 1.21.4)' };
  add('d2_biome_precip', n, q, 2);
});
const dropName = (b) => { const d = (b.drops || []); if (d.length !== 1) return null; const n = idName.get(d[0]) || null; return n && n !== 'air' ? n : null; };
shuf(blk.filter(b => dropName(b) && dropName(b) !== b.name && nm(dropName(b)) && !isUsed('drop', nm(b.name))).map(b => b.name), 'dr').forEach(n => {
  const b = blocks.find(x => x.name === n), dn = dropName(b); if (!capOk('d2_block_drop', 90)) return;
  const q = { type: 'entity', question: `Welches Item erhältst du normalerweise beim Abbau von „${nm(n)}“ (mit passendem Werkzeug, ohne Behutsamkeit)?`, answer: nm(dn), acceptedAnswers: [nm(dn)], category: 'Erze & Ressourcen', funFact: `„${nm(n)}“ lässt ${nm(dn)} fallen.`, source: 'Drops (minecraft-data 1.21.4)' };
  if (add('d2_block_drop', n, q, common.has(n) ? 2 : 3)) bump('d2_block_drop');
});

// ── Rezepte: wie viele Stueck entstehen? ──
const craftCount = [];
Object.entries(recipes).forEach(([rid, list]) => {
  const n = idName.get(Number(rid)); if (!n || !nm(n) || TECH.test(n) || !famOk('cc_' + n)) return;
  const cs = new Set(list.map(v => (v.result && v.result.count) || 1)); if (cs.size !== 1) return;
  const c = [...cs][0]; if (c < 2 || c > 16) return;
  craftCount.push({ n, c });
});
shuf(craftCount.map(x => x.n), 'cc').forEach(n => {
  const x = craftCount.find(y => y.n === n); if (!capOk('d2_craft_count', 160)) return;
  const q = { type: 'number', question: `Wie viele „${nm(n)}“ entstehen bei einem einzigen Crafting-Rezept?`, answer: x.c, unit: 'Stück', tolerance: 0, category: 'Crafting', funFact: `Ein Rezept liefert ${x.c} Stück „${nm(n)}“.`, source: 'Rezepte (minecraft-data 1.21.4)' };
  if (add('d2_craft_count', n, q, common.has(n) ? 2 : 3)) bump('d2_craft_count');
});

// IDs vergeben und schreiben
let next = Math.max(10000, ...Object.values(ids)) + 1;
out.forEach(q => { if (!ids[q.__key]) ids[q.__key] = next++; q.id = ids[q.__key]; delete q.__key; });
out.sort((a, b) => a.id - b.id);
const f = {}, t = {}, c = {};
out.forEach(q => { const k = q.choices ? 'choice' : q.type; f[k] = (f[k] || 0) + 1; t[q.tier] = (t[q.tier] || 0) + 1; c[q.category] = (c[q.category] || 0) + 1; });
console.log('Neue Datenfragen:', out.length, 'Format', JSON.stringify(f), 'Tier', JSON.stringify(t));
console.log(JSON.stringify(perGen), JSON.stringify(c));
if (dry) process.exit(0);
fs.writeFileSync(path.join(__dirname, 'data2-ids.json'), JSON.stringify(ids));
fs.writeFileSync(qPath, JSON.stringify(base.concat(out), null, 2));
console.log('questions.json:', base.length + out.length, 'Fragen');
