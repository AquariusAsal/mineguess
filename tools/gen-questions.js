/**
 * Erzeugt zusaetzliche Quizfragen aus verifizierbaren Java-Edition-Daten (PrismarineJS/minecraft-data 1.21.4),
 * der deutschen Sprachdatei (nur fuer deutsche Namen, nicht im Repo) und den vom forscher am Wiki geprueften
 * Fakten (docs/team/WIKI-FACTS*.md, Tabellenzeilen mit ID W..).
 *
 * Aufruf (Projektordner):  node tools/gen-questions.js [--dry]
 *   MC_CACHE   Cache-Ordner AUSSERHALB des Repos (Standard: ../mineguess-cache), Downloads per https
 *   --dry      nur Report, questions.json nicht aendern
 * Alte Fragen (ohne Feld "gen") bleiben unveraendert, neue erhalten fortlaufende IDs. Idempotent: bereits erzeugte
 * Fragen (Feld "gen") werden vor jedem Lauf verworfen und deterministisch (fester Seed) neu aufgebaut.
 * Danach: node tools/rate-questions.js und node tools/gen-sw-assets.js
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const MGAnswer = require('../answer-check.js');

const ROOT = path.join(__dirname, '..');
const CACHE = process.env.MC_CACHE || path.join(ROOT, '..', 'mineguess-cache');
const DRY = process.argv.includes('--dry');
const VERSION = '1.21.4';
const PM = `https://raw.githubusercontent.com/PrismarineJS/minecraft-data/master/data/pc/${VERSION}/`;
const SOURCES = {
  'blocks.json': PM + 'blocks.json', 'items.json': PM + 'items.json', 'foods.json': PM + 'foods.json',
  'entities.json': PM + 'entities.json', 'enchantments.json': PM + 'enchantments.json', 'biomes.json': PM + 'biomes.json',
  'recipes.json': PM + 'recipes.json', 'effects.json': PM + 'effects.json',
  'de_de.json': `https://raw.githubusercontent.com/InventivetalentDev/minecraft-assets/${VERSION}/assets/minecraft/lang/de_de.json`,
};

function get(url, depth = 0) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'mineguess-gen' } }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && depth < 5) return resolve(get(res.headers.location, depth + 1));
      if (res.statusCode !== 200) return reject(new Error(url + ' -> HTTP ' + res.statusCode));
      const chunks = []; res.on('data', c => chunks.push(c)); res.on('end', () => resolve(Buffer.concat(chunks)));
    }).on('error', reject);
  });
}
async function ensureData() {
  fs.mkdirSync(CACHE, { recursive: true });
  for (const [f, url] of Object.entries(SOURCES)) {
    const p = path.join(CACHE, f);
    if (fs.existsSync(p) && fs.statSync(p).size > 100) continue;
    console.log('lade', f);
    fs.writeFileSync(p, await get(url));
  }
}
const J = f => JSON.parse(fs.readFileSync(path.join(CACHE, f), 'utf8'));

function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function shuffled(arr, r) { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

// Kategorie-Zuordnung: Geschichte -> Geschichte & Updates, Bauwerke der Weltgenerierung -> Strukturen
function mapCat(cat, question) {
  if (cat === 'Geschichte') return 'Geschichte & Updates';
  if (cat === 'Weltgenerierung' && /(Festung|Tempel|Monument|Bastion|Antike Stadt|Antiken Stadt|Verlies|Anwesen|Waldanwesen|Außenposten|Schiffswrack|Ruine|Mine|Minenschacht|Dorf|Portal|Iglu|Hexenhütte|Netherfestung|Wüstentempel|Dschungeltempel|Ozeanmonument|Endstadt|Pyramide|Trial|Prüfungskammer|Bauwerk)/i.test(question)) return 'Strukturen';
  return cat;
}

// Wiki-Fakten aus docs/team/WIKI-FACTS*.md (Zeilen: | W01 | Kat. | Frage | Antwort | Typ/Einheit | accepted | Quelle | S | Lust. |)
function loadWikiFacts() {
  const dir = path.join(ROOT, 'docs', 'team');
  const out = [];
  fs.readdirSync(dir).filter(f => /^WIKI-FACTS.*\.md$/.test(f)).sort().forEach(f => {
    fs.readFileSync(path.join(dir, f), 'utf8').split('\n').forEach(line => {
      if (!/^\|\s*W\d+/.test(line)) return;
      const c = line.split('|').slice(1, -1).map(s => s.trim());
      if (c.length < 7) return;
      const [id, cat, question, answerCell, typeCell, acceptedCell, source] = c;
      const isNum = /^number/i.test(typeCell);
      const accepted = acceptedCell.split(',').map(s => s.replace(/\(.*?\)/g, '').trim()).filter(Boolean);
      const tolM = acceptedCell.match(/±\s*([0-9.]+)/);
      const unit = isNum ? (typeCell.split(',')[1] || '').trim() : '';
      let answer = answerCell.replace(/\(.*?\)/g, '').trim();
      if (isNum) answer = parseFloat(answerCell.replace(',', '.'));
      out.push({ id, cat: mapCat(cat, question), question, answer, isNum, unit: (unit === 'Wert' || unit.includes('Jahr') || unit.includes('(')) ? '' : unit, chance: unit.startsWith('(1 zu'), accepted, tol: tolM ? parseFloat(tolM[1]) : 0, source, file: f });
    });
  });
  return out;
}

async function main() {
  await ensureData();
  const blocks = J('blocks.json'), items = J('items.json'), foods = J('foods.json'), entities = J('entities.json');
  const enchants = J('enchantments.json'), biomes = J('biomes.json'), recipes = J('recipes.json'), effects = J('effects.json'), de = J('de_de.json');
  const qPath = path.join(ROOT, 'questions.json');
  const all = JSON.parse(fs.readFileSync(qPath, 'utf8'));
  const base = all.filter(q => !q.gen);
  let nextId = Math.max(...base.map(q => q.id)) + 1;
  const R = rng(20241014);

  const blockDe = n => de['block.minecraft.' + n];
  const itemDe = n => de['item.minecraft.' + n] || de['block.minecraft.' + n];
  const entityDe = n => de['entity.minecraft.' + n];
  const byItemId = new Map(items.map(i => [i.id, i]));
  const blockByName = new Map(blocks.map(b => [b.name, b]));
  const entByName = new Map(entities.map(e => [e.name, e]));
  const qt = n => `„${n}“`;                       // Name in deutschen Anfuehrungszeichen (vermeidet Fall-Probleme)

  // ── Varianten-/Technik-Filter ──
  const TECH = /^(air|cave_air|void_air|barrier|light|structure_void|structure_block|jigsaw|command_block|chain_command_block|repeating_command_block|debug_stick|knowledge_book|test_block|test_instance_block|bundle|spawner|trial_spawner|vault|petrified_oak_slab|farmland|dirt_path|budding_amethyst|reinforced_deepslate|player_head|written_book|filled_map|firework_star|tipped_arrow|potion|splash_potion|lingering_potion|enchanted_book|suspicious_.*|infested_.*|.*_spawn_egg|music_disc_.*|.*_pottery_sherd|.*_smithing_template|.*_banner_pattern|goat_horn|.*_head|.*_skull|decorated_pot|.*_candle|candle|.*_bed|.*_banner|.*_shulker_box|.*_glazed_terracotta|.*_concrete_powder|.*_stained_glass.*|.*_carpet|.*_terracotta|.*_wool|.*_concrete|.*_dye|.*_bundle|.*_harness|.*_sapling|.*_leaves|.*_boat|.*_chest_boat|.*_hanging_sign|.*_sign|.*_door|.*_trapdoor|.*_button|.*_pressure_plate|.*_stairs|.*_slab|.*_wall|.*_fence|.*_fence_gate|.*_pane|.*coral.*|polished_.*|chiseled_.*|cracked_.*|mossy_.*|smooth_.*|cut_.*|exposed_.*|weathered_.*|oxidized_.*|waxed_.*|deepslate_.*_ore|.*_planks|.*_log|.*_wood|stripped_.*|.*_hyphae|.*_stem|.*_roots|.*_fungus|.*_nylium|.*_wart_block)$/;
  const KEEP = new Set(['white_wool', 'oak_planks', 'oak_log', 'oak_leaves', 'smooth_stone', 'mossy_cobblestone', 'cobblestone_wall', 'reinforced_deepslate',
    'budding_amethyst', 'spawner', 'farmland', 'dirt_path', 'wither_skeleton_skull', 'dragon_head', 'iron_door', 'iron_trapdoor', 'white_concrete', 'white_terracotta',
    'chiseled_bookshelf', 'crimson_nylium', 'warped_nylium', 'nether_wart_block', 'shulker_box']);
  const usable = name => KEEP.has(name) || !TECH.test(name);
  // Dekoration/Pflanzen: fuer Haerte-/Widerstandsfragen uninteressant
  const DECOR = /(vine|plant|flower|sapling|roots|moss|carpet|lantern|mushroom|bush|sprout|fern|grass|kelp|lily|petals|torch|rail|button|pressure|pot|candle|banner|sign|head|skull|egg|frog|spore|cobweb|ladder|lever|string|hook|fan|chain|rod|bars|glass|pane|slime|honey|azalea|dripleaf|pickle|berries|tulip|dandelion|poppy|orchid|allium|bluet|daisy|cornflower|lilac|peony|rose|sunflower)/;

  // ── Bestehende Fragen: Dubletten verhindern ──
  const existText = base.map(q => (q.question || '').toLowerCase());
  const existHas = (kw, name) => { const n = name.toLowerCase(); return existText.some(t => t.includes(kw) && t.includes(n)); };
  const norm = s => s.toLowerCase().replace(/[^a-zäöüß0-9]/g, '');
  const existQuestions = new Set(existText.map(norm));

  const out = [];
  const stats = {};
  const seenKeys = new Set();
  function add(tpl, cat, q) {
    const k = norm(q.question);
    if (existQuestions.has(k) || seenKeys.has(k)) return false;
    if (q.type === 'entity' && !q.choice && norm(q.question).includes(norm(String(q.answer)))) return false;   // Antwort nie im Fragetext
    seenKeys.add(k);
    out.push({ id: 0, type: q.type, question: q.question, answer: q.answer, ...(q.type === 'number'
      ? { unit: q.unit || '', tolerance: q.tolerance || 0, ...(q.tolerancePct ? { tolerancePct: q.tolerancePct, toleranceMin: q.toleranceMin || 0 } : {}) }
      : { acceptedAnswers: q.acceptedAnswers }),
      category: cat, funFact: q.funFact, ...(q.choices ? { choices: q.choices } : {}), ...(q.source ? { source: q.source } : {}), gen: tpl });
    stats[tpl] = (stats[tpl] || 0) + 1;
    return true;
  }
  const fmt = n => String(n).replace('.', ',');
  const r2 = n => Math.round(n * 100) / 100;
  const capped = (list, cap, valueOf, perValue) => {
    const seen = new Map(), res = [];
    for (const x of shuffled(list, R)) {
      const v = valueOf(x), c = seen.get(v) || 0;
      if (c >= perValue) continue;
      seen.set(v, c + 1); res.push(x);
      if (res.length >= cap) break;
    }
    return res;
  };

  // ═════════ Bloecke ═════════
  const blockPool = [];
  for (const it of items) {
    const b = blockByName.get(it.name);
    if (!b || !usable(it.name) || !blockDe(it.name)) continue;
    blockPool.push(b);
  }
  const hardPool = blockPool.filter(b => b.hardness >= 1 && b.diggable && !DECOR.test(b.name));
  capped(hardPool, 80, b => b.hardness, 6).forEach(b => {
    const n = blockDe(b.name);
    if (existHas('härte', n)) return;
    add('block_haerte', 'Blöcke', {
      type: 'number', question: `Wie hoch ist die Härte des Blocks ${qt(n)}?`, answer: b.hardness, unit: '',
      tolerancePct: 15, toleranceMin: 0.3,
      funFact: `${qt(n)} hat die Härte ${fmt(b.hardness)}. Zum Vergleich: Stein hat 1,5, Obsidian 50.`,
    });
  });
  const resPool = blockPool.filter(b => b.resistance >= 3 && b.hardness >= 0 && !DECOR.test(b.name));
  capped(resPool, 55, b => b.resistance, 5).forEach(b => {
    const n = blockDe(b.name);
    if (existHas('sprengwiderstand', n) || existHas('explosionswiderstand', n)) return;
    add('block_resistance', 'Blöcke', {
      type: 'number', question: `Wie hoch ist der Explosionswiderstand des Blocks ${qt(n)}?`, answer: b.resistance, unit: '',
      tolerancePct: 20, toleranceMin: 0.5,
      funFact: `${qt(n)} hat den Explosionswiderstand ${fmt(b.resistance)}. Zum Vergleich: Stein hat 6, Obsidian 1200.`,
    });
  });
  const AMBIG_LIGHT = /^(sea_pickle|candle|.*_candle|respawn_anchor|furnace|blast_furnace|smoker|redstone_ore|deepslate_redstone_ore|redstone_lamp|campfire|soul_campfire|lit_.*|cave_vines|glow_lichen|.*_froglight)$/;
  blockPool.filter(b => b.emitLight > 0 && !AMBIG_LIGHT.test(b.name)).forEach(b => {
    const n = blockDe(b.name);
    if (existHas('licht', n)) return;
    add('block_light', 'Blöcke', {
      type: 'number', question: `Welches Lichtlevel strahlt der Block ${qt(n)} aus?`, answer: b.emitLight, unit: '',
      funFact: `${qt(n)} leuchtet mit Lichtlevel ${b.emitLight} von maximal 15.`,
    });
  });

  // ═════════ Items ═════════
  const stackPool = items.filter(i => usable(i.name) && itemDe(i.name));
  const odd = stackPool.filter(i => i.stackSize !== 64 && !(i.maxDurability));
  const stackPick = [...shuffled(odd.filter(i => i.stackSize === 16), R).slice(0, 14), ...shuffled(odd.filter(i => i.stackSize === 1), R).slice(0, 8)];
  stackPick.forEach(i => {
    const n = itemDe(i.name);
    if (existHas('stapel', n) || existHas('stack', n)) return;
    add('item_stack', 'Items', {
      type: 'number', question: `Wie groß ist die maximale Stapelgröße von ${qt(n)}?`, answer: i.stackSize, unit: 'Stück',
      funFact: i.stackSize === 1 ? `${qt(n)} lässt sich nicht stapeln.` : `${qt(n)} stapelt sich nur bis ${i.stackSize}, nicht bis 64.`,
    });
  });
  shuffled(stackPool.filter(i => i.stackSize === 64 && !i.maxDurability), R).slice(0, 3).forEach(i => {
    const n = itemDe(i.name);
    if (existHas('stapel', n)) return;
    add('item_stack', 'Items', {
      type: 'number', question: `Wie groß ist die maximale Stapelgröße von ${qt(n)}?`, answer: 64, unit: 'Stück',
      funFact: `${qt(n)} stapelt sich bis 64, das ist der Standardwert.`,
    });
  });
  const GEAR = /(pickaxe|_axe|shovel|hoe|sword|helmet|chestplate|leggings|boots|^bow$|crossbow|trident|shield|elytra|fishing_rod|shears|flint_and_steel|^mace$|carrot_on_a_stick)/;
  const durPool = items.filter(i => i.maxDurability && GEAR.test(i.name) && itemDe(i.name));
  capped(durPool, 32, i => i.maxDurability, 2).forEach(i => {
    const n = itemDe(i.name);
    if (existHas('haltbarkeit', n)) return;
    add('item_durability', 'Items', {
      type: 'number', question: `Wie hoch ist die Haltbarkeit von ${qt(n)}?`, answer: i.maxDurability, unit: 'Haltbarkeit',
      tolerancePct: 10, toleranceMin: 5,
      funFact: `${qt(n)} hält ${i.maxDurability} Nutzungen aus.`,
    });
  });
  foods.filter(f => itemDe(f.name)).forEach(f => {
    const n = itemDe(f.name);
    if (existHas('nahrungspunkte', n) || existHas('hungerpunkte', n)) return;
    const keulen = f.foodPoints === 1 ? 'eine halbe Keule' : f.foodPoints === 2 ? 'eine Keule' : f.foodPoints % 2 ? `${fmt(f.foodPoints / 2)} Keulen` : `${f.foodPoints / 2} Keulen`;
    add('food_points', 'Essen & Nahrung', {
      type: 'number', question: `Wie viele Nahrungspunkte stellt ${qt(n)} wieder her?`, answer: f.foodPoints, unit: 'Nahrungspunkte',
      funFact: `${qt(n)} füllt ${f.foodPoints} Nahrungspunkte auf, das ist ${keulen} in der Hungerleiste.`,
    });
  });
  const repairAlias = { diamond: ['Diamanten'], iron_ingot: ['Eisen', 'Eisenbarren'], gold_ingot: ['Gold', 'Goldbarren'], netherite_ingot: ['Netherit', 'Netheritbarren'],
    copper_ingot: ['Kupfer'], leather: ['Leder'], string: ['Fäden'], stick: ['Stöcke', 'Stock'], cobblestone: ['Bruchstein', 'Kopfsteinpflaster'],
    phantom_membrane: ['Phantommembran', 'Phantomhaut'] };
  items.filter(i => i.repairWith && i.repairWith.length === 1 && !/(planks|_tag)/.test(i.repairWith[0]) && usable(i.name) && itemDe(i.name)).forEach(i => {
    const mat = i.repairWith[0], matDe = itemDe(mat);
    if (!matDe) return;
    const n = itemDe(i.name);
    if (existHas('repar', n)) return;
    add('item_repair', 'Crafting', {
      type: 'entity', question: `Mit welchem Material repariert man ${qt(n)} im Amboss?`, answer: matDe,
      acceptedAnswers: [...new Set([matDe, ...(repairAlias[mat] || [])])],
      funFact: `${qt(n)} lässt sich im Amboss mit ${matDe} reparieren.`,
    });
  });

  // ═════════ Werkzeug-Ueberraschungen ═════════
  const toolOf = m => /mineable\/pickaxe/.test(m) ? ['Spitzhacke', 'Pickaxe'] : /mineable\/axe/.test(m) ? ['Axt', 'Axe'] : /mineable\/shovel/.test(m) ? ['Schaufel', 'Shovel'] :
    /mineable\/hoe/.test(m) ? ['Hacke', 'Hoe'] : null;
  const toolPool = blockPool.filter(b => toolOf(b.material) && b.hardness > 0 && !/_ore$/.test(b.name) && !/^oak_/.test(b.name));
  const picks = [];
  ['Axt', 'Schaufel', 'Hacke'].forEach(k => picks.push(...shuffled(toolPool.filter(b => toolOf(b.material)[0] === k), R).slice(0, k === 'Axt' ? 4 : 3)));
  picks.push(...shuffled(toolPool.filter(b => toolOf(b.material)[0] === 'Spitzhacke'), R).slice(0, 2));
  picks.forEach(b => {
    const n = blockDe(b.name), t = toolOf(b.material);
    if (existHas('werkzeug', n)) return;
    add('block_tool', 'Gameplay', {
      type: 'entity', question: `Mit welchem Werkzeug baut man den Block ${qt(n)} am schnellsten ab?`, answer: t[0],
      acceptedAnswers: [t[0], t[1]],
      funFact: `${qt(n)} wird mit der ${t[0]} am schnellsten abgebaut.`,
    });
  });
  const dropOK = /_ore$|^(stone|grass_block|gravel|glowstone|sea_lantern|bookshelf|clay|snow_block|melon|ice|mycelium|podzol)$/;
  blockPool.filter(b => b.drops && b.drops.length === 1).forEach(b => {
    const d = byItemId.get(b.drops[0]);
    if (!d || d.name === b.name || !itemDe(d.name) || !dropOK.test(b.name) || /^deepslate_/.test(b.name)) return;
    const n = blockDe(b.name), dn = itemDe(d.name);
    if (norm(n).includes(norm(dn)) || norm(dn).includes(norm(n))) return;
    if (existHas('fallen', n) || existHas('droppt', n)) return;
    add('block_drop', 'Erze & Ressourcen', {
      type: 'entity', question: `Welches Item erhält man normalerweise, wenn man ${qt(n)} ohne Verzauberung abbaut?`, answer: dn,
      acceptedAnswers: [dn], funFact: `${qt(n)} lässt beim Abbau ${dn} fallen, mit der richtigen Werkzeugstufe.`,
    });
  });

  // ═════════ Mobs (bekannte Mobs, Rekordmasse) ═════════
  const FAMOUS = ['ender_dragon', 'wither', 'ghast', 'iron_golem', 'enderman', 'silverfish', 'endermite', 'bee', 'chicken', 'spider', 'cow', 'horse', 'zombie', 'creeper',
    'villager', 'slime', 'blaze', 'wither_skeleton', 'warden', 'ravager', 'polar_bear', 'squid', 'bat', 'camel', 'sniffer', 'strider', 'guardian', 'elder_guardian',
    'cat', 'wolf', 'pig', 'sheep', 'rabbit', 'parrot', 'phantom', 'shulker', 'hoglin', 'piglin', 'cave_spider', 'vex', 'witch', 'magma_cube', 'skeleton', 'llama', 'panda', 'axolotl', 'frog', 'turtle', 'ocelot', 'fox', 'donkey', 'mooshroom'];
  const famous = FAMOUS.map(n => entByName.get(n)).filter(e => e && entityDe(e.name) && e.width && e.height);
  const heightPick = [...famous].sort((a, b) => b.height - a.height);
  capped(famous, 20, m => r2(m.height), 2).forEach(m => {
    const n = entityDe(m.name);
    if (existHas('hoch', n) || existHas('höhe', n)) return;
    add('mob_height', 'Mobs', {
      type: 'number', question: `Wie viele Blöcke hoch ist der Mob ${qt(n)}?`, answer: r2(m.height), unit: 'Blöcke',
      tolerancePct: 10, toleranceMin: 0.1,
      funFact: `${qt(n)} ist ${fmt(r2(m.height))} Blöcke hoch. Der Spieler misst 1,8 Blöcke.`,
    });
  });
  capped(famous, 14, m => r2(m.width), 2).forEach(m => {
    const n = entityDe(m.name);
    if (existHas('breit', n)) return;
    add('mob_width', 'Mobs', {
      type: 'number', question: `Wie viele Blöcke breit ist der Mob ${qt(n)}?`, answer: r2(m.width), unit: 'Blöcke',
      tolerancePct: 10, toleranceMin: 0.1,
      funFact: `${qt(n)} ist ${fmt(r2(m.width))} Blöcke breit. Der Spieler misst 0,6 Blöcke.`,
    });
  });
  // Mob nach Massen (nur Extreme, nur eindeutig)
  const dims = new Map();
  entities.forEach(m => { const k = m.width + 'x' + m.height; dims.set(k, (dims.get(k) || 0) + 1); });
  famous.filter(m => dims.get(m.width + 'x' + m.height) === 1 && (m.width >= 1.4 || m.height >= 2.5 || m.height <= 0.5)).slice(0, 10).forEach(m => {
    const n = entityDe(m.name);
    add('mob_by_size', 'Mobs', {
      type: 'entity', question: `Welcher Mob ist ${fmt(r2(m.width))} Blöcke breit und ${fmt(r2(m.height))} Blöcke hoch?`, answer: n,
      acceptedAnswers: [n], funFact: `${qt(n)} misst ${fmt(r2(m.width))} x ${fmt(r2(m.height))} Blöcke.`,
    });
  });

  // ═════════ Vergleiche (Antwort steht bewusst unter den zwei genannten Optionen) ═════════
  const KNOWN_BLOCKS = ['stone', 'cobblestone', 'dirt', 'sand', 'gravel', 'obsidian', 'glass', 'oak_planks', 'oak_log', 'iron_block', 'gold_block', 'diamond_block',
    'netherite_block', 'emerald_block', 'coal_block', 'tnt', 'netherrack', 'soul_sand', 'glowstone', 'sponge', 'ice', 'snow_block', 'clay', 'end_stone', 'deepslate',
    'bookshelf', 'crafting_table', 'furnace', 'chest', 'ender_chest', 'anvil', 'enchanting_table', 'cobweb', 'white_wool', 'bedrock', 'cactus',
    'pumpkin', 'melon', 'iron_ore', 'diamond_ore', 'coal_ore', 'gold_ore', 'redstone_block', 'lapis_block', 'ancient_debris', 'respawn_anchor', 'beacon', 'brick', 'bricks'];
  const kb = KNOWN_BLOCKS.map(n => blockByName.get(n)).filter(b => b && blockDe(b.name));
  const pairs = (list, key, minRatio, cap, tpl, cat, qText, factText) => {
    const cand = [];
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const a = list[i], b = list[j];
      if (!(a[key] > 0 && b[key] > 0)) continue;
      const hi = Math.max(a[key], b[key]), lo = Math.min(a[key], b[key]);
      if (hi / lo >= minRatio) cand.push(a[key] > b[key] ? [a, b] : [b, a]);
    }
    shuffled(cand, R).slice(0, cap).forEach(([w, l]) => {
      const nw = w.nameDe, nl = l.nameDe;
      const order = R() < 0.5 ? [nw, nl] : [nl, nw];
      add(tpl, cat, {
        type: 'entity', choice: true, choices: order, question: qText(order[0], order[1]), answer: nw, acceptedAnswers: [nw],
        funFact: factText(w, l),
      });
    });
  };
  kb.forEach(b => { b.nameDe = blockDe(b.name); });
  pairs(kb.filter(b => b.hardness > 0), 'hardness', 2, 60, 'cmp_hardness', 'Blöcke',
    (a, b) => `Welcher Block ist härter: ${qt(a)} oder ${qt(b)}?`, (w, l) => `${qt(w.nameDe)} (Härte ${fmt(w.hardness)}) ist härter als ${qt(l.nameDe)} (Härte ${fmt(l.hardness)}).`);
  pairs(kb.filter(b => b.resistance > 0 && b.resistance < 100000), 'resistance', 3, 55, 'cmp_resistance', 'Blöcke',
    (a, b) => `Welcher Block hält Explosionen besser stand: ${qt(a)} oder ${qt(b)}?`, (w, l) => `${qt(w.nameDe)} hat den Explosionswiderstand ${fmt(w.resistance)}, ${qt(l.nameDe)} nur ${fmt(l.resistance)}.`);
  famous.forEach(m => { m.nameDe = entityDe(m.name); });
  pairs(famous, 'height', 1.4, 55, 'cmp_height', 'Mobs',
    (a, b) => `Welcher Mob ist höher: ${qt(a)} oder ${qt(b)}?`, (w, l) => `${qt(w.nameDe)} ist ${fmt(r2(w.height))} Blöcke hoch, ${qt(l.nameDe)} nur ${fmt(r2(l.height))}.`);

  pairs(famous, 'width', 1.4, 30, 'cmp_width', 'Mobs',
    (a, b) => `Welcher Mob ist breiter: ${qt(a)} oder ${qt(b)}?`, (w, l) => `${qt(w.nameDe)} ist ${fmt(r2(w.width))} Blöcke breit, ${qt(l.nameDe)} nur ${fmt(r2(l.width))}.`);
  const gearNamed = durPool.map(i => Object.assign({}, i, { nameDe: itemDe(i.name) }));
  pairs(gearNamed, 'maxDurability', 1.3, 40, 'cmp_durability', 'Items',
    (a, b) => `Was hält länger: ${qt(a)} oder ${qt(b)}?`, (w, l) => `${qt(w.nameDe)} hält ${w.maxDurability} Nutzungen aus, ${qt(l.nameDe)} nur ${l.maxDurability}.`);
  const foodNamed = foods.filter(f => itemDe(f.name)).map(f => Object.assign({}, f, { nameDe: itemDe(f.name) }));
  pairs(foodNamed, 'foodPoints', 1.5, 35, 'cmp_food', 'Essen & Nahrung',
    (a, b) => `Was stellt mehr Nahrungspunkte wieder her: ${qt(a)} oder ${qt(b)}?`, (w, l) => `${qt(w.nameDe)} füllt ${w.foodPoints} Nahrungspunkte auf, ${qt(l.nameDe)} nur ${l.foodPoints}.`);
  const lightNamed = blockPool.filter(b => b.emitLight > 0 && !AMBIG_LIGHT.test(b.name)).map(b => Object.assign({}, b, { nameDe: blockDe(b.name) }));
  pairs(lightNamed, 'emitLight', 2, 15, 'cmp_light', 'Blöcke',
    (a, b) => `Welcher Block leuchtet heller: ${qt(a)} oder ${qt(b)}?`, (w, l) => `${qt(w.nameDe)} leuchtet mit Lichtlevel ${w.emitLight}, ${qt(l.nameDe)} nur mit ${l.emitLight}.`);
  const enchNamed = enchants.filter(e => de['enchantment.minecraft.' + e.name]).map(e => Object.assign({}, e, { nameDe: de['enchantment.minecraft.' + e.name] }));
  pairs(enchNamed, 'maxLevel', 2, 20, 'cmp_enchant', 'Verzauberungen',
    (a, b) => `Welche Verzauberung hat die höhere Maximalstufe: ${qt(a)} oder ${qt(b)}?`, (w, l) => `${qt(w.nameDe)} geht bis Stufe ${w.maxLevel}, ${qt(l.nameDe)} nur bis Stufe ${l.maxLevel}.`);

  const BIOME_FAMOUS = ['plains', 'desert', 'taiga', 'jungle', 'savanna', 'swamp', 'forest', 'ocean', 'badlands', 'ice_spikes', 'snowy_plains', 'mushroom_fields', 'birch_forest', 'dark_forest', 'meadow', 'cherry_grove', 'beach', 'river', 'windswept_hills', 'frozen_ocean', 'warm_ocean', 'lukewarm_ocean', 'cold_ocean', 'sunflower_plains', 'bamboo_jungle', 'grove', 'stony_peaks', 'jagged_peaks', 'frozen_peaks'];
  const biomeNamed = BIOME_FAMOUS.map(n => biomes.find(b => b.name === n)).filter(b => b && de['biome.minecraft.' + b.name] && b.temperature > 0)
    .map(b => Object.assign({}, b, { nameDe: de['biome.minecraft.' + b.name] }));
  pairs(biomeNamed, 'temperature', 1.6, 20, 'cmp_biome_temp', 'Biome',
    (a, b) => `Welches Biom hat die höhere Basistemperatur: ${qt(a)} oder ${qt(b)}?`, (w, l) => `${qt(w.nameDe)} hat die Basistemperatur ${fmt(w.temperature)}, ${qt(l.nameDe)} nur ${fmt(l.temperature)}.`);

  // Eindeutige Haerte-/Widerstandswerte: Rueckwaerts-Frage
  const hardCount = new Map(), resCount = new Map();
  blocks.forEach(b => { if (b.hardness > 0) hardCount.set(b.hardness, (hardCount.get(b.hardness) || 0) + 1); if (b.resistance > 0) resCount.set(b.resistance, (resCount.get(b.resistance) || 0) + 1); });
  shuffled(blockPool.filter(b => b.diggable && b.hardness >= 2 && hardCount.get(b.hardness) === 1), R).slice(0, 25).forEach(b => {
    const n = blockDe(b.name);
    add('block_by_hardness', 'Hardcore-Wissen', {
      type: 'entity', question: `Welcher Block hat die Härte ${fmt(b.hardness)}?`, answer: n, acceptedAnswers: [n],
      funFact: `${qt(n)} ist der einzige Block mit Härte ${fmt(b.hardness)}.`,
    });
  });
  shuffled(blockPool.filter(b => b.resistance >= 5 && resCount.get(b.resistance) === 1), R).slice(0, 25).forEach(b => {
    const n = blockDe(b.name);
    add('block_by_resistance', 'Hardcore-Wissen', {
      type: 'entity', question: `Welcher Block hat den Explosionswiderstand ${fmt(b.resistance)}?`, answer: n, acceptedAnswers: [n],
      funFact: `${qt(n)} ist der einzige Block mit Explosionswiderstand ${fmt(b.resistance)}.`,
    });
  });

  // ═════════ Verzauberungen / Biome / Effekte ═════════
  enchants.forEach(e => {
    const n = de['enchantment.minecraft.' + e.name];
    if (!n || existHas('level', n) || existHas('stufe', n)) return;
    add('enchant_max', 'Verzauberungen', {
      type: 'number', question: `Bis zu welcher Stufe lässt sich ${qt(n)} verzaubern?`, answer: e.maxLevel, unit: '',
      funFact: `${qt(n)} geht im Normalfall bis Stufe ${e.maxLevel}${e.curse ? ' und ist ein Fluch' : ''}.`,
    });
  });
  const DIM = { nether: ['Nether', ['Nether']], end: ['Ende', ['Ende', 'The End', 'End']], overworld: ['Oberwelt', ['Oberwelt', 'Overworld']] };
  const SURPRISE = ['deep_dark', 'lush_caves', 'dripstone_caves', 'mushroom_fields'];
  [...biomes.filter(b => b.dimension !== 'overworld'), ...biomes.filter(b => SURPRISE.includes(b.name))].forEach(b => {
    const n = de['biome.minecraft.' + b.name];
    if (!n || existHas('biom', n)) return;
    const d = DIM[b.dimension];
    add('biome_dimension', 'Biome', {
      type: 'entity', question: `Zu welcher Dimension gehört das Biom ${qt(n)}?`, answer: d[0], acceptedAnswers: d[1],
      funFact: `Das Biom ${qt(n)} gehört zur Dimension ${d[0]}.`,
    });
  });
  const snake = s => s.replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase();
  const EFFECT_OK = new Set(['speed', 'slowness', 'haste', 'mining_fatigue', 'strength', 'jump_boost', 'nausea', 'regeneration', 'resistance', 'fire_resistance',
    'water_breathing', 'invisibility', 'blindness', 'hunger', 'weakness', 'poison', 'wither', 'levitation', 'night_vision', 'saturation']);
  shuffled(effects.filter(e => EFFECT_OK.has(snake(e.name)) && de['effect.minecraft.' + snake(e.name)]), R).slice(0, 10).forEach(e => {
    const n = de['effect.minecraft.' + snake(e.name)];
    if (existHas('effekt', n)) return;
    const good = e.type === 'good';
    add('effect_type', 'Tränke', {
      type: 'entity', question: `Ist der Effekt ${qt(n)} für den Spieler nützlich oder schädlich?`, answer: good ? 'nützlich' : 'schädlich',
      acceptedAnswers: good ? ['nützlich', 'positiv', 'gut', 'hilfreich'] : ['schädlich', 'negativ', 'schlecht', 'schaden'],
      funFact: `${qt(n)} zählt im Spiel zu den ${good ? 'positiven' : 'negativen'} Effekten.`,
    });
  });

  // ═════════ Crafting ═════════
  const TAG_ING = /(_planks|_log|_logs|_wool|_slab|coals?|charcoal|_stem|_hyphae|_wood|stone_crafting|cobbled|blackstone|deepslate$|^stone$|sand$|_bricks?$)/;
  const recipeRows = [], singleKind = [];
  for (const [rid, list] of Object.entries(recipes)) {
    const it = byItemId.get(Number(rid));
    if (!it || !usable(it.name) || !itemDe(it.name)) continue;
    const r = list[0];
    const slots = r.inShape ? r.inShape.flat().filter(x => x != null && x !== -1) : (r.ingredients || []).filter(x => x != null);
    if (!slots.length) continue;
    const kinds = [...new Set(slots)];
    recipeRows.push({ it, count: r.result.count, slots: slots.length, kinds: kinds.length, single: list.length === 1 });
    if (kinds.length === 1 && slots.length >= 2 && list.length === 1) {
      const ing = byItemId.get(kinds[0]);
      if (ing && itemDe(ing.name) && ing.name !== it.name && !TAG_ING.test(ing.name)) singleKind.push({ it, ing, slots: slots.length });
    }
  }
  capped(recipeRows.filter(r => r.count > 1 && r.single), 14, r => r.count, 3).forEach(r => {
    const n = itemDe(r.it.name);
    if (existHas('erhält', n)) return;
    add('craft_result', 'Crafting', {
      type: 'number', question: `Wie viele ${qt(n)} liefert ein einzelnes Standardrezept?`, answer: r.count, unit: 'Stück',
      funFact: `Ein Rezept für ${qt(n)} liefert ${r.count} Stück.`,
    });
  });
  capped(recipeRows.filter(r => r.single && r.slots >= 5), 8, r => r.slots, 3).forEach(r => {
    const n = itemDe(r.it.name);
    if (existHas('zutaten', n)) return;
    add('craft_slots', 'Crafting', {
      type: 'number', question: `Wie viele Felder des Handwerksrasters belegt das Standardrezept für ${qt(n)}?`, answer: r.slots, unit: 'Felder',
      funFact: `Das Rezept für ${qt(n)} belegt ${r.slots} Felder.`,
    });
  });
  const compress = singleKind.filter(s => s.slots === 4 || s.slots === 9);
  const keyCount = new Map();
  compress.forEach(s => { const k = s.ing.name + ':' + s.slots; keyCount.set(k, (keyCount.get(k) || 0) + 1); });
  shuffled(compress.filter(s => keyCount.get(s.ing.name + ':' + s.slots) === 1), R).slice(0, 40).forEach(s => {
    const n = itemDe(s.it.name), ing = itemDe(s.ing.name);
    if (norm(n) === norm(ing)) return;
    add('craft_compress', 'Crafting', {
      type: 'entity', question: `Was stellt man im Handwerksraster aus ${s.slots} Stück ${qt(ing)} her?`, answer: n, acceptedAnswers: [n],
      funFact: `Aus ${s.slots} mal ${ing} entsteht ${qt(n)}.`,
    });
  });
  capped(singleKind, 40, s => s.ing.name, 3).forEach(s => {
    const n = itemDe(s.it.name), ing = itemDe(s.ing.name);
    if (norm(n).includes(norm(ing)) || norm(ing).includes(norm(n))) return;
    if (existHas('zutat', n) || existHas('herstell', n)) return;
    add('craft_ingredient', 'Crafting', {
      type: 'entity', question: `Aus welcher einzigen Zutat stellt man ${qt(n)} im Handwerksraster her?`, answer: ing,
      acceptedAnswers: [ing], funFact: `Für ${qt(n)} braucht man ${s.slots} mal ${ing}.`,
    });
  });

  // ═════════ Zaehlfragen und Superlative ═════════
  const counts = [
    [`Wie viele Verzauberungen gibt es in Java Edition 1.21.4?`, enchants.length, 'Verzauberungen', 'Verzauberungen', 1],
    [`Wie viele Verzauberungen sind Flüche (Java Edition 1.21.4)?`, enchants.filter(e => e.curse).length, 'Verzauberungen', 'Verzauberungen', 0],
    [`Wie viele Verzauberungen lassen sich nur bis Stufe 1 verzaubern (Java Edition 1.21.4)?`, enchants.filter(e => e.maxLevel === 1).length, 'Verzauberungen', 'Verzauberungen', 1],
    [`Wie viele Statuseffekte gibt es in Java Edition 1.21.4?`, effects.length, 'Effekte', 'Tränke', 1],
    [`Wie viele Statuseffekte sind in Java Edition 1.21.4 schädlich?`, effects.filter(e => e.type === 'bad').length, 'Effekte', 'Tränke', 1],
    [`Wie viele Biome gibt es in Java Edition 1.21.4?`, biomes.length, 'Biome', 'Biome', 1],
    [`Wie viele Biome gehören in Java Edition 1.21.4 zum Nether?`, biomes.filter(b => b.dimension === 'nether').length, 'Biome', 'Biome', 0],
    [`Wie viele Biome gehören in Java Edition 1.21.4 zum Ende?`, biomes.filter(b => b.dimension === 'end').length, 'Biome', 'Biome', 0],
    [`Wie viele verschiedene Nahrungsmittel gibt es in Java Edition 1.21.4?`, foods.length, 'Items', 'Essen & Nahrung', 1],
  ];
  counts.forEach(([q0, a, unit, cat, tol]) => add('count', cat, {
    type: 'number', question: q0.replace(' (Java Edition 1.21.4)', '').replace(' in Java Edition 1.21.4', ''), answer: a, unit, tolerance: tol,
    funFact: `Nach den Spieldaten von Java Edition 1.21.4 sind es ${a}. Neue Versionen können die Zahl ändern.`,
  }));
  const uniqueMax = (list, key, dir) => {
    const s = [...list].sort((a, b) => dir * (b[key] - a[key]));
    return s.length > 1 && s[0][key] !== s[1][key] ? s[0] : null;
  };
  const supers = [
    [uniqueMax(blocks.filter(b => b.hardness > 0 && b.diggable && blockDe(b.name)), 'hardness', 1), 'Welcher abbaubare Block hat die höchste Härte (Java Edition 1.21.4)?', b => blockDe(b.name), b => `Härte ${fmt(b.hardness)}`, 'Blöcke'],
    [uniqueMax(famous, 'height', 1), 'Welcher der bekannten Mobs ist am höchsten?', m => entityDe(m.name), m => `${fmt(r2(m.height))} Blöcke hoch`, 'Mobs'],
    [uniqueMax(famous, 'width', 1), 'Welcher der bekannten Mobs ist am breitesten?', m => entityDe(m.name), m => `${fmt(r2(m.width))} Blöcke breit`, 'Mobs'],
    [uniqueMax(foods.filter(f => itemDe(f.name)), 'foodPoints', 1), 'Welches Nahrungsmittel stellt die meisten Nahrungspunkte wieder her?', f => itemDe(f.name), f => `${f.foodPoints} Nahrungspunkte`, 'Essen & Nahrung'],
    [uniqueMax(enchants.filter(e => de['enchantment.minecraft.' + e.name]), 'maxLevel', 1), 'Welche Verzauberung hat die höchste maximale Stufe?', e => de['enchantment.minecraft.' + e.name], e => `Stufe ${e.maxLevel}`, 'Verzauberungen'],
  ];
  supers.forEach(([obj, q, nameOf, fact, cat]) => {
    if (!obj) return;
    const a = nameOf(obj);
    add('superlative', cat, { type: 'entity', question: q, answer: a, acceptedAnswers: [a], funFact: `${a}: ${fact(obj)} (Spieldaten Java Edition 1.21.4).` });
  });

  // ═════════ Wiki-Fakten (vom forscher am Seitentext geprueft) ═════════
  const SKIP_WIKI = new Set(['W07', 'W21', 'W26', 'W210', 'W303']);   // W07/W210/W303 doppelt zu vorhandenen Fragen, W21 mehrdeutig, W26 Ja/Nein
  const SKIP_TEXT = ['Wert', 'Bereich 2 bis', 'Radius hat die Markierung', '10 von 28', 'alle 4 Sekunden', '(Radius)', 'Gunst des Delfins', 'Vollversion'];   // unklar formuliert oder versionsabhaengig
  const wikiFun = (w, src) => w.chance ? 'Die Chance beträgt 1 zu ' + w.answer + '.' : '';   // kein Platzhalter-funFact: leer lassen (Frontend blendet den Kasten aus), Quelle steht im Feld source
  loadWikiFacts().filter(w => !SKIP_WIKI.has(w.id) && !SKIP_TEXT.some(s => w.question.includes(s))).forEach(w => {
    const src = w.source.split('/').pop();   // nur Feld source, keine Anzeige im funFact
    if (w.isNum) {
      add('wiki', w.cat, { type: 'number', question: w.question, answer: w.answer, unit: w.unit, tolerance: w.tol, funFact: wikiFun(w, src), source: src });
    } else {
      add('wiki', w.cat, { type: 'entity', question: w.question, answer: w.answer, acceptedAnswers: [...new Set([w.answer, ...w.accepted])], funFact: wikiFun(w, src), source: src });
    }
  });

  out.forEach(q => { q.id = nextId++; });
  const result = [...base, ...out];
  // Zwei-Optionen-Fragen ("„A“ oder „B“" bzw. "...: A oder B?"): choices per Muster ergaenzen, Antwort muss eine der beiden sein
  let choiceAdded = 0, choiceSkipped = [];
  result.forEach(q => {
    if (q.type !== 'entity' || q.choices || !/ oder /.test(q.question)) return;
    let m = q.question.match(/„([^“]+)“\s+oder\s+„([^“]+)“/);
    if (!m) { const tail = q.question.includes(':') ? q.question.slice(q.question.lastIndexOf(':') + 1) : q.question; m = tail.replace(/\?$/, '').match(/^\s*([^?]+?)\s+oder\s+([^?]+?)\s*$/); }
    if (!m) { choiceSkipped.push(q.id); return; }
    const pair = [m[1].trim(), m[2].trim()];
    const hit = pair.find(p => norm(p) === norm(String(q.answer)) || (q.acceptedAnswers || []).some(a => norm(a) === norm(p)));
    if (!hit) { choiceSkipped.push(q.id); return; }
    q.choices = pair.map(p => norm(p) === norm(String(q.answer)) ? String(q.answer) : p);
    choiceAdded++;
  });
  if (choiceAdded || choiceSkipped.length) console.log('choices nachtraeglich:', choiceAdded, 'nicht erkannt:', choiceSkipped.join(','));
  let unsolvable = 0;
  out.forEach(q => { if (!MGAnswer.check(q, String(q.answer)).correct) { unsolvable++; console.warn('nicht loesbar:', q.id, q.question); } });
  const byCat = {};
  out.forEach(q => byCat[q.category] = (byCat[q.category] || 0) + 1);
  console.log('Bestehend:', base.length, '| neu:', out.length, '| gesamt:', result.length, '| unloesbar:', unsolvable);
  console.log('je Vorlage:', JSON.stringify(stats));
  console.log('je Kategorie (neu):', JSON.stringify(byCat));
  if (!DRY) fs.writeFileSync(qPath, JSON.stringify(result, null, 2));
  fs.writeFileSync(path.join(CACHE, 'last-generated.json'), JSON.stringify(out, null, 2));
}
main().catch(e => { console.error(e); process.exit(1); });
