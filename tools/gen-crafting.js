/**
 * Crafting-Raetsel: erzeugt Fragen vom Typ "crafting" aus den Rezepten von minecraft-data (Java 1.21.4)
 * und integriert sie in questions.json (Feld gen: 'crafting'; wird bei jedem Lauf neu aufgebaut).
 *
 * Aufruf (Projektordner, nach tools/gen-questions.js):  node tools/gen-crafting.js [--dry]
 *   MC_CACHE   Cache ausserhalb des Repos (Standard ../mineguess-cache: recipes.json, items.json, de_de.json, en_us.json)
 * Optional docs/team/crafting-auswahl.json (vom forscher kuratiert): Liste der Ergebnis-Items (Registry-Namen oder
 * Objekte mit name/id/result/item); dann werden nur diese verwendet, sonst automatische Auswahl.
 * Danach: node tools/rate-questions.js und node tools/fetch-icons.js
 *
 * Frageformat:
 *  { id, type:'crafting', category:'Crafting', question, grid:[[k,k,k],[k,k,k],[k,k,k]] (Registry-Namen oder null),
 *    shapeless: bool, resultCount, answer (deutscher Name), acceptedAnswers, funFact, gen:'crafting' }
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const CACHE = process.env.MC_CACHE || path.join(ROOT, '..', 'mineguess-cache');
const DRY = process.argv.includes('--dry');
const J = f => JSON.parse(fs.readFileSync(path.join(CACHE, f), 'utf8'));
const norm = s => String(s).toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/[^a-z0-9]/g, '');

function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function shuffled(arr, r) { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

// Technik-/Varianten-Filter (wie bei den Datenfragen): nur bekannte, spielbare Ergebnisse, hoechstens ein Vertreter je Familie
const TECH = /^(air|barrier|light|structure_void|structure_block|jigsaw|command_block|chain_command_block|repeating_command_block|debug_stick|knowledge_book|bundle|spawner|trial_spawner|vault|petrified_oak_slab|farmland|dirt_path|player_head|written_book|filled_map|firework_star|firework_rocket|tipped_arrow|potion|splash_potion|lingering_potion|enchanted_book|suspicious_.*|infested_.*|.*_spawn_egg|music_disc_.*|.*_pottery_sherd|.*_smithing_template|.*_banner_pattern|banner_pattern|goat_horn|.*_head|.*_skull|decorated_pot|.*_candle|.*_bed|.*_banner|.*_shulker_box|.*_glazed_terracotta|.*_concrete_powder|.*_stained_glass.*|.*_carpet|.*_terracotta|.*_wool|.*_concrete|.*_dye|.*_bundle|.*_harness|.*_sapling|.*_leaves|.*_boat|.*_chest_boat|.*_hanging_sign|.*_sign|.*_door|.*_trapdoor|.*_button|.*_pressure_plate|.*_stairs|.*_slab|.*_wall|.*_fence|.*_fence_gate|.*_pane|.*coral.*|polished_.*|chiseled_.*|cracked_.*|mossy_.*|smooth_.*|cut_.*|exposed_.*|weathered_.*|oxidized_.*|waxed_.*|.*_planks|.*_log|.*_wood|stripped_.*|.*_hyphae|.*_stem|.*_roots|.*_fungus|.*_nylium|.*_wart_block|.*_nugget|.*_block|.*_ingot|.*_boots|.*_leggings|.*_chestplate|.*_helmet|.*_sword|.*_pickaxe|.*_axe|.*_shovel|.*_hoe|map|crafter|tinted_glass|copper_block|.*_copper.*|lead|armor_stand|.*_rail|jukebox|.*_lantern)$/;
// ausdruecklich behalten (je Familie ein Vertreter / bekannte Klassiker)
const KEEP = new Set(['oak_boat', 'oak_door', 'oak_fence_gate', 'oak_sign', 'oak_planks',
  'white_wool', 'white_bed', 'white_carpet', 'white_banner', 'white_candle', 'white_concrete_powder', 'white_stained_glass', 'white_stained_glass_pane', 'white_terracotta', 'white_dye',
  'iron_block', 'gold_block', 'diamond_block', 'emerald_block', 'redstone_block', 'lapis_block', 'coal_block', 'copper_block', 'netherite_block', 'iron_ingot', 'gold_ingot', 'netherite_ingot',
  'iron_nugget', 'gold_nugget', 'iron_pickaxe', 'diamond_pickaxe', 'iron_axe', 'iron_shovel', 'iron_hoe', 'iron_sword', 'diamond_sword', 'iron_helmet', 'iron_chestplate', 'iron_leggings', 'iron_boots',
  'diamond_helmet', 'diamond_chestplate', 'diamond_leggings', 'diamond_boots', 'rail', 'powered_rail', 'detector_rail', 'activator_rail', 'jukebox', 'lead', 'map', 'iron_door', 'lantern', 'soul_lantern',
  'stone_stairs', 'stone_slab', 'cobblestone_wall', 'smooth_stone', 'polished_andesite', 'armor_stand', 'tinted_glass', 'crafter', 'lightning_rod', 'copper_ingot']);
const OK = n => KEEP.has(n) || !TECH.test(n);

(function main() {
  const recipes = J('recipes.json'), items = J('items.json'), de = J('de_de.json'), en = J('en_us.json');
  const byId = new Map(items.map(i => [i.id, i.name]));
  const deName = n => de['item.minecraft.' + n] || de['block.minecraft.' + n];
  const enName = n => en['item.minecraft.' + n] || en['block.minecraft.' + n];
  const R = rng(20241020);

  // optionale Kuratierung durch den forscher
  let allow = null, curated = new Map();
  const selPath = path.join(ROOT, 'docs', 'team', 'crafting-auswahl.json');
  if (fs.existsSync(selPath)) {
    const sel = JSON.parse(fs.readFileSync(selPath, 'utf8'));
    const arr = Array.isArray(sel) ? sel : (sel.rezepte || sel.recipes || sel.items || []);
    allow = new Set(arr.map(x => typeof x === 'string' ? x : (x.name || x.id || x.result || x.item)).filter(Boolean));
    curated = new Map(arr.filter(x => x && typeof x === 'object' && x.result).map(x => [x.result, x]));
    console.log('Auswahl des forschers:', allow.size, 'Eintraege');
  }

  // Kandidaten
  const rows = [];
  for (const [rid, list] of Object.entries(recipes)) {
    const name = byId.get(Number(rid));
    if (!name || !deName(name)) continue;
    if (allow ? !allow.has(name) : !OK(name)) continue;
    // Variante waehlen: bevorzugt Eiche/Kohle (bekannteste Zutat), sonst die erste
    let pick;
    pick = list.find(r => (r.inShape ? r.inShape.flat() : r.ingredients).some(id => byId.get(id) === 'oak_planks' || byId.get(id) === 'coal')) || list[0];
    let shapeless = !pick.inShape;
    let cells;
    const cur = curated.get(name);
    if (cur && (cur.grid3x3_topleft || cur.ingredients)) {
      // kuratiertes Raster des forschers (Tag-Zutaten bereits durch Stellvertreter ersetzt)
      shapeless = cur.recipeType === 'shapeless' || !cur.grid3x3_topleft;
      cells = [[null, null, null], [null, null, null], [null, null, null]];
      if (!shapeless) cur.grid3x3_topleft.forEach((row, y) => row.forEach((k, x) => { cells[y][x] = k || null; }));
      else (cur.ingredients || []).forEach((k, i) => { cells[Math.floor(i / 3)][i % 3] = k || null; });
      pick = { result: { count: cur.count || pick.result.count } };
    } else if (shapeless) {
      const ing = pick.ingredients.filter(x => x != null);
      cells = [[null, null, null], [null, null, null], [null, null, null]];
      ing.forEach((id, i) => { cells[Math.floor(i / 3)][i % 3] = byId.get(id) || null; });
    } else {
      cells = [[null, null, null], [null, null, null], [null, null, null]];
      pick.inShape.forEach((row, y) => row.forEach((id, x) => { if (id != null && id !== -1) cells[y][x] = byId.get(id) || null; }));
    }
    const filled = cells.flat().filter(Boolean);
    if (filled.length < 2) continue;
    if (filled.some(k => !deName(k))) continue;
    rows.push({ name, shapeless, cells, count: pick.result.count, filled: filled.length, kinds: new Set(filled).size });
  }

  // Eindeutigkeit: gleiches Raster darf nie zu zwei verschiedenen Ergebnissen fuehren
  const sig = r => (r.shapeless ? 'S' + [...r.cells.flat().filter(Boolean)].sort().join(',') : 'G' + JSON.stringify(r.cells));
  const bySig = new Map();
  rows.forEach(r => { const k = sig(r); (bySig.get(k) || bySig.set(k, []).get(k)).push(r); });
  let ambiguous = 0;
  const unique = rows.filter(r => { const g = bySig.get(sig(r)); if (new Set(g.map(x => x.name)).size > 1) { ambiguous++; return false; } return true; });
  // auch zwischen geformt und formlos: gleiche Zutatenmenge darf nicht zwei Ergebnisse haben
  const byMulti = new Map();
  unique.forEach(r => { const k = [...r.cells.flat().filter(Boolean)].sort().join(','); (byMulti.get(k) || byMulti.set(k, []).get(k)).push(r); });
  const final = unique.filter(r => {
    const g = byMulti.get([...r.cells.flat().filter(Boolean)].sort().join(','));
    // gleiche Zutatenmenge, anderes Ergebnis, aber verschiedene Form -> erlaubt (Raster ist eindeutig); nur formlose Konflikte raus
    return !(r.shapeless && new Set(g.map(x => x.name)).size > 1);
  });

  // Auswahl begrenzen (ohne Kuratierung): gleichmaessig ueber Schwierigkeit
  // Familien begrenzen (Material-Praefix), damit nicht ein Material die Auswahl dominiert
  const fam = {}, FAM_CAP = 5, famOf = n => (n.match(/^(iron|diamond|oak|soul|copper|netherite|stone|redstone|polished|quartz|deepslate|end)_/) || [])[1] || null;
  const limited = shuffled(final, R).filter(r => { const f = allow ? null : famOf(r.name); if (!f) return true; fam[f] = (fam[f] || 0) + 1; return fam[f] <= FAM_CAP; });
  const CAP = allow ? 400 : 260;
  const chosen = limited.slice(0, CAP).sort((a, b) => a.name.localeCompare(b.name));

  const qPath = path.join(ROOT, 'questions.json');
  const all = JSON.parse(fs.readFileSync(qPath, 'utf8'));
  const base = all.filter(q => q.gen !== 'crafting');
  let nextId = Math.max(...base.map(q => q.id)) + 1;
  const existing = new Set(base.filter(q => q.type === 'crafting').map(q => q.answer));
  const out = chosen.map(r => {
    const d = deName(r.name), e = enName(r.name);
    return {
      id: nextId++, type: 'crafting', question: r.shapeless ? 'Was entsteht hier? (formloses Rezept)' : 'Was entsteht hier?',
      answer: d, acceptedAnswers: [...new Set([d, ...(e && norm(e) !== norm(d) ? [e] : [])])],
      category: 'Crafting', grid: r.cells, shapeless: r.shapeless, resultCount: r.count,
      funFact: `Das Rezept liefert ${r.count} ${r.count === 1 ? 'Stück' : 'Stück'} ${d}.`, gen: 'crafting',
    };
  });

  // Pruefungen
  const MGAnswer = require('../answer-check.js');
  let unsolvable = 0;
  out.forEach(q => { if (!MGAnswer.check(q, q.answer).correct) unsolvable++; });
  const answers = new Set(out.map(q => norm(q.answer)));
  console.log(`Kandidaten ${rows.length}, mehrdeutig ${ambiguous}, eindeutig ${final.length}, gewaehlt ${out.length}, unloesbar ${unsolvable}, verschiedene Antworten ${answers.size}`);
  const kinds = new Set(); out.forEach(q => q.grid.flat().filter(Boolean).forEach(k => kinds.add(k)));
  console.log('verwendete Zutaten:', kinds.size);
  if (DRY) console.log(out.map(q => q.answer + (q.shapeless ? "*" : "")).join(" | "));
  if (!DRY) fs.writeFileSync(qPath, JSON.stringify([...base, ...out], null, 2));
})();
