/**
 * Baut die Antwortliste (assets/mc/answers.json) und die Icon-Zuordnung (assets/mc/icons.json) fuer das
 * Antwort-Dropdown und laedt fehlende 16x16-Texturen aus dem GitHub-Mirror PrismarineJS/minecraft-assets (1.21.11)
 * nach assets/mc/item bzw. assets/mc/block.
 *
 * Aufruf (Projektordner):
 *   FFMPEG="C:\pfad\ffmpeg.exe" node tools/fetch-icons.js [--dry]
 *   MC_CACHE  Cache ausserhalb des Repos (Standard ../mineguess-cache; de_de.json/en_us.json werden dort erwartet,
 *             Texturen landen in <cache>/icons)
 * FFMPEG schneidet jede Textur auf 16x16 (erstes Frame bei Animationsstreifen). Ohne FFMPEG werden Texturen
 * unveraendert uebernommen, wenn sie bereits 16x16 sind (PNG-Header-Pruefung).
 *
 * Ergebnis:
 *   assets/mc/answers.json  { names: [kanonische deutsche Namen], aliases: { "kleinschreibung": "Kanonischer Name" } }
 *   assets/mc/icons.json    { "Kanonischer Name": "item/ender_pearl.png" | "block/..." }
 *   docs/team/ICONS-REPORT.md
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const CACHE = process.env.MC_CACHE || path.join(ROOT, '..', 'mineguess-cache');
const FFMPEG = process.env.FFMPEG || '';
const DRY = process.argv.includes('--dry');
const MIRROR = 'https://raw.githubusercontent.com/PrismarineJS/minecraft-assets/master/data/1.21.11/';
const MC = path.join(ROOT, 'assets', 'mc');
const ICON_CACHE = path.join(CACHE, 'icons');

const DOWNLOADED = new Set();
const norm = s => String(s).toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/[^a-z0-9]/g, '');
const J = f => JSON.parse(fs.readFileSync(path.join(CACHE, f), 'utf8'));

function get(url) {
  return new Promise(resolve => {
    https.get(url, { headers: { 'User-Agent': 'mineguess-icons' } }, res => {
      if (res.statusCode !== 200) { res.resume(); return resolve(null); }
      const c = []; res.on('data', d => c.push(d)); res.on('end', () => resolve(Buffer.concat(c)));
    }).on('error', () => resolve(null));
  });
}
function pngSize(buf) { return buf && buf.length > 24 && buf.readUInt32BE(0) === 0x89504e47 ? [buf.readUInt32BE(16), buf.readUInt32BE(20)] : null; }

// Textur holen (lokal vorhanden, Cache, sonst Mirror); Rueckgabe Pfad relativ zu assets/mc oder null
async function ensureTexture(rel) {
  const local = path.join(MC, rel);
  if (fs.existsSync(local)) return rel;
  const [folder, file] = rel.split('/');
  const cacheFile = path.join(ICON_CACHE, folder + '__' + file);
  const miss = cacheFile + '.404';
  if (fs.existsSync(miss)) return null;
  let buf = fs.existsSync(cacheFile) ? fs.readFileSync(cacheFile) : null;
  if (!buf) {
    buf = await get(MIRROR + (folder === 'item' ? 'items/' : 'blocks/') + file);
    fs.mkdirSync(ICON_CACHE, { recursive: true });
    if (!buf) { fs.writeFileSync(miss, ''); return null; }
    fs.writeFileSync(cacheFile, buf);
  }
  const size = pngSize(buf);
  if (!size) return null;
  fs.mkdirSync(path.dirname(local), { recursive: true });
  DOWNLOADED.add(rel);
  if (size[0] === 16 && size[1] === 16) {
    if (!DRY) fs.writeFileSync(local, buf);
  } else if (FFMPEG) {
    if (!DRY) {
      const r = spawnSync(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', '-i', cacheFile, '-vf', 'crop=16:16:0:0', '-frames:v', '1', local], { encoding: 'utf8' });
      if (r.status !== 0 || !fs.existsSync(local)) return null;
    }
  } else return null;
  return rel;
}

async function main() {
  const q = JSON.parse(fs.readFileSync(path.join(ROOT, 'questions.json'), 'utf8'));
  const de = J('de_de.json'), en = J('en_us.json');

  // Index: normalisierter Name -> {kind,id}; Prioritaet Item > Block > Entity
  const idx = new Map();
  const put = (name, kind, id, prio) => { const k = norm(name); const old = idx.get(k); if (!old || prio < old.prio) idx.set(k, { kind, id, prio }); };
  const kinds = [['item.minecraft.', 'item', 1], ['block.minecraft.', 'block', 2], ['entity.minecraft.', 'entity', 3]];
  for (const lang of [de, en]) for (const [key, val] of Object.entries(lang)) {
    for (const [pre, kind, prio] of kinds) if (key.startsWith(pre) && !key.slice(pre.length).includes('.')) put(val, kind, key.slice(pre.length), prio);
  }
  const deById = {};
  for (const [pre, kind] of kinds) for (const [k, v] of Object.entries(de)) if (k.startsWith(pre) && !k.slice(pre.length).includes('.')) deById[kind + ':' + k.slice(pre.length)] = v;

  // Namen und Aliase aus den Fragen sammeln. canonOf: Antwort -> kanonischer deutscher Anzeigename
  const names = new Map();      // canonical -> { cat }
  const aliases = {};           // lower -> canonical
  const canonOf = new Map();    // Antwortname -> canonical
  // Offizielle deutsche Namen statt alter/falscher Bezeichnungen
  const OFFICIAL = { antikesgestein: 'Antiker Schrott', lectern: 'Lesepult' };
  const bad = a => / oder |\/|^\s*$/.test(a) || a.length > 40;
  q.filter(x => x.type === 'entity' || x.type === 'crafting').forEach(x => {
    const canon = String(x.answer);
    if (!names.has(canon)) names.set(canon, { cat: x.category });
  });
  // 1) gleiche Normalform nur einmal ("Ghastträne"/"Ghasttraene")
  const seen = new Map();
  for (const n of [...names.keys()]) {
    const k = norm(n);
    if (seen.has(k)) { canonOf.set(n, seen.get(k)); names.delete(n); } else { seen.set(k, n); canonOf.set(n, n); }
  }
  // 2) offizielle deutsche Namen (Override) und englische Namen auf den deutschen Registry-Namen abbilden (auch wenn er schon existiert: zusammenfuehren)
  const deValues = new Set(Object.values(de).map(norm));
  const rename = (from, to) => {
    if (norm(from) === norm(to)) return;
    const meta = names.get(from);
    names.delete(from);
    if (!names.has(to)) names.set(to, meta);
    for (const [k, v] of canonOf) if (v === from) canonOf.set(k, to);
    aliases[from.toLowerCase()] = to;
  };
  for (const n of [...names.keys()]) {
    const ov = OFFICIAL[norm(n)];
    if (ov) { rename(n, ov); continue; }
    if (deValues.has(norm(n))) continue;
    const hit0 = idx.get(norm(n));
    if (!hit0) continue;
    const deName = deById[hit0.kind + ':' + hit0.id];
    if (deName && norm(deName) !== norm(n)) rename(n, deName);
  }
  // 3) Aliase aus den acceptedAnswers: jeder Alias zeigt auf den kanonischen Namen SEINER Frage
  const canonical = a => canonOf.get(String(a)) || canonOf.get([...canonOf.keys()].find(k => norm(k) === norm(a)) || '') || String(a);
  q.filter(x => x.type === 'entity' || x.type === 'crafting').forEach(x => {
    const c = canonical(x.answer);
    (x.acceptedAnswers || []).forEach(a => {
      if (!a || bad(a) || norm(a) === norm(c)) return;
      const k = String(a).toLowerCase();
      if (!aliases[k] && !names.has(a)) aliases[k] = c;
    });
  });
  // Aliase, die selbst kanonische Namen sind oder auf nicht existierende zeigen, bereinigen
  Object.keys(aliases).forEach(a => { if (!names.has(aliases[a]) || norm(a) === norm(aliases[a]) || bad(a)) delete aliases[a]; });
  // 4) Einheitliche Annahme: jede Frage akzeptiert ihren kanonischen Namen und alle Aliase desselben Objekts (Solo = Multiplayer)
  let accepted = 0;
  if (!DRY) {
    q.filter(x => x.type === 'entity' || x.type === 'crafting').forEach(x => {
      const c = canonical(x.answer);
      // Crafting: Antwort auf den kanonischen Namen (Dropdown-Eintrag) vereinheitlichen, die alte Schreibweise bleibt akzeptiert
      if (x.type === 'crafting' && c !== x.answer && norm(c) === norm(x.answer)) { x.acceptedAnswers = [...new Set([...(x.acceptedAnswers || []), x.answer])]; x.answer = c; }
      const have = new Set((x.acceptedAnswers || []).map(norm));
      const add = [c, ...Object.keys(aliases).filter(a => aliases[a] === c)].filter(a => !have.has(norm(a)));
      if (add.length) { x.acceptedAnswers = [...(x.acceptedAnswers || [x.answer]), ...add]; accepted += add.length; }
    });
    fs.writeFileSync(path.join(ROOT, 'questions.json'), JSON.stringify(q, null, 2));
  }

  // Stellvertreter fuer Namen ohne Registry-Eintrag
  const PROXY = {
    spitzhacke: 'item/iron_pickaxe.png', axt: 'item/iron_axe.png', schaufel: 'item/iron_shovel.png', hacke: 'item/iron_hoe.png', schere: 'item/shears.png',
    nether: 'block/netherrack.png', ende: 'block/end_stone.png', oberwelt: 'block/grass_block_side.png',
    festung: 'block/stone_bricks.png', endfestung: 'block/stone_bricks.png', ozeanmonument: 'block/prismarine_bricks.png', 'ozean-monument': 'block/prismarine_bricks.png',
    dorf: 'item/bell.png', wither: 'item/nether_star.png', enderdrache: 'block/dragon_egg.png', truhe: 'block/barrel_side.png', endertruhe: 'block/obsidian.png',
    bett: 'block/white_wool.png', eisengolem: 'block/iron_block.png', schneegolem: 'block/snow_block.png', wollblock: 'block/white_wool.png',
    verbrennung: 'item/blaze_powder.png', haltbarkeit: 'item/anvil.png', blitz: 'item/lightning_rod.png', laub: 'block/oak_leaves.png', feuersteinundstahl: 'item/flint_and_steel.png', amethystgeode: 'block/amethyst_block.png', antikesgestein: 'block/ancient_debris_side.png',
    armbrust: 'item/crossbow_standby.png', fermentiertesspinneauge: 'item/fermented_spider_eye.png', froschlicht: 'block/ochre_froglight_side.png',
    gewachsterkupferblock: 'block/copper_block.png', glatterquarzblock: 'block/quartz_block_bottom.png', glatterrotersandstein: 'block/red_sandstone_top.png', glattersandstein: 'block/sandstone_top.png',
    entrindetesakazienholz: 'block/stripped_acacia_log.png', entrindetesbirkenholz: 'block/stripped_birch_log.png', entrindetesblasseichenholz: 'block/stripped_pale_oak_log.png', entrindetesfichtenholz: 'block/stripped_spruce_log.png', entrindetesschwarzeichenholz: 'block/stripped_dark_oak_log.png',
    geschaeltekarmesinhyphen: 'block/stripped_crimson_stem.png', geschaeltewirrhyphen: 'block/stripped_warped_stem.png', wirrhyphen: 'block/warped_stem.png',
    geselle: 'item/emerald.png', magmablock: 'block/magma.png', markierungderhimmelsrichtungen: 'item/compass_00.png', minecon2012: 'item/firework_rocket.png',
    schild: 'item/iron_helmet.png', redstone: 'item/redstone.png', roheskupfer: 'item/raw_copper.png', schiesspulver: 'item/gunpowder.png', verzauberterGoldenerapfel: 'item/golden_apple.png',
    verzaubertergoldenerapfel: 'item/golden_apple.png', wahr: 'item/lime_dye.png', mythos: 'item/red_dye.png', nuetzlich: 'item/emerald.png', schaedlich: 'item/spider_eye.png', positiv: 'item/emerald.png', negativ: 'item/spider_eye.png',
  };
  const CAT_PROXY = { Biome: 'block/grass_block_side.png', Strukturen: 'block/stone_bricks.png', Weltgenerierung: 'block/grass_block_top.png',
    'Geschichte & Updates': 'item/book.png', Dimensionen: 'block/obsidian.png', Dorfbewohner: 'item/emerald.png', Redstone: 'item/redstone.png',
    Crafting: 'block/crafting_table_front.png', Mobs: 'item/name_tag.png', Spielmechanik: 'item/name_tag.png', 'Hardcore-Wissen': 'item/name_tag.png', Verzauberungen: 'item/enchanted_book.png' };

  const icons = {}, how = {};
  const sortedNames = [...names.keys()].sort((a, b) => a.localeCompare(b, 'de'));
  for (const name of sortedNames) {
    const key = norm(name);
    let rel = null, mode = 'fallback';
    const hit = idx.get(key) || idx.get(norm((name.match(/\(([^)]+)\)/) || [])[1] || '')) ;
    if (hit) {
      const id = hit.id;
      const cands = hit.kind === 'item' ? [`item/${id}.png`, `block/${id}.png`, `block/${id}_side.png`, `block/${id}_front.png`, `block/${id}_top.png`]
        : hit.kind === 'block' ? [`block/${id}.png`, `block/${id}_side.png`, `block/${id}_front.png`, `block/${id}_top.png`, `block/${id}_still.png`, `item/${id}.png`]
        : [`item/${id}_spawn_egg.png`, `item/${id}.png`];
      for (const c of cands) { rel = await ensureTexture(c); if (rel) { mode = 'echt'; break; } }
    }
    if (!rel && PROXY[key]) { rel = await ensureTexture(PROXY[key]); if (rel) mode = 'stellvertreter'; }
    if (!rel && /\+|^\d/.test(name)) { rel = 'block/crafting_table_front.png'; mode = 'stellvertreter'; }
    if (!rel) { const cp = CAT_PROXY[names.get(name).cat]; if (cp && cp !== 'item/barrier.png') { rel = await ensureTexture(cp); if (rel) mode = 'stellvertreter'; } }
    if (!rel) { rel = 'item/barrier.png'; mode = 'fallback'; }
    icons[name] = rel; how[name] = mode;
  }

  // Crafting-Raetsel: Icons fuer alle Zutaten (Registry-Name -> Textur + deutscher Name)
  const ingKeys = new Set();
  q.filter(x => x.type === 'crafting').forEach(x => { x.grid.flat().filter(Boolean).forEach(k => ingKeys.add(k)); if (x.resultKey) ingKeys.add(x.resultKey); });   // auch die Ergebnis-Items (Bau-Slot, Ergebnis-Icon)
  let catalog = null;
  try { catalog = JSON.parse(fs.readFileSync(path.join(MC, 'craft-items.json'), 'utf8')); catalog.forEach(it => ingKeys.add(it.key)); } catch (e) {}   // Item-Katalog des Bau-Modus (tools/gen-crafting.js)
  const ingredients = {};
  for (const k of [...ingKeys].sort()) {
    const ING_ALIAS = { decorated_pot: ['block/bricks.png', 'block/terracotta.png'], clock: ['item/clock_00.png'], recovery_compass: ['item/recovery_compass_00.png', 'item/compass_00.png'], sticky_piston: ['block/piston_top_sticky.png'], cobblestone_stairs: ['block/cobblestone.png'], cobblestone_wall: ['block/cobblestone.png'],
      heavy_weighted_pressure_plate: ['block/iron_block.png'], light_weighted_pressure_plate: ['block/gold_block.png'], oak_fence: ['block/oak_planks.png'], oak_fence_gate: ['block/oak_planks.png'], oak_pressure_plate: ['block/oak_planks.png'],
      white_bed: ['block/white_wool.png'], white_carpet: ['block/white_wool.png'], white_banner: ['block/white_wool.png'], crossbow: ['item/crossbow_standby.png'], magma_block: ['block/magma.png'], ender_chest: ['block/obsidian.png'], shield: ['item/iron_chestplate.png'],
      chest: ['block/barrel_side.png'], compass: ['item/compass_00.png'], snow_block: ['block/snow.png'], oak_slab: ['block/oak_planks.png'], pale_oak_slab: ['block/pale_oak_planks.png'],
      bamboo_slab: ['block/bamboo_planks.png'], purpur_slab: ['block/purpur_block.png'], stone_pressure_plate: ['block/stone.png'], stone_slab: ['block/stone.png'], stripped_warped_hyphae: ['block/stripped_warped_stem.png'], chain: ['item/iron_nugget.png'], cut_copper_slab: ['block/cut_copper.png'], oak_wood: ['block/oak_log.png'], quartz_slab: ['block/quartz_block_side.png'], sandstone_slab: ['block/sandstone.png'], stone_brick_slab: ['block/stone_bricks.png'] };
    // abgeleitete Stellvertreter: Stufen/Holz/Betten/Teppiche/Kupfer-Varianten zeigen die Textur ihres Grundblocks
    const D = [];
    let m;
    if ((m = k.match(/^(.*)_slab$/))) { const b = m[1]; D.push(`block/${b}_planks.png`, `block/${b}.png`, `block/${b}s.png`, `block/${b}_top.png`, `block/${b}_side.png`); }
    // Treppen/Mauern/Zaeune/Tore/Knoepfe/Druckplatten: Textur des Grundblocks (Holz -> Planken, Stein -> Block bzw. Ziegel-Mehrzahl)
    if ((m = k.match(/^(.*)_(stairs|wall|fence|fence_gate|button|pressure_plate)$/))) {
      const b = m[1];
      D.push(`block/${b}_planks.png`, `block/${b}.png`, `block/${b}s.png`, `block/${b}_block.png`, `block/${b}_top.png`, `block/${b}_side.png`, `block/${b}_block_side.png`, `block/${b}_mosaic.png`);
    }
    if ((m = k.match(/^(.*)_banner$/))) D.push(`block/${m[1]}_wool.png`);
    if (k === 'moss_carpet') D.push('block/moss_block.png');
    if (k === 'trapped_chest') D.push('block/barrel_side.png');
    if ((m = k.match(/^(.*)_(stairs|wall|slab)$/))) { const sb = { smooth_quartz: 'block/quartz_block_bottom.png', smooth_sandstone: 'block/sandstone_top.png', smooth_red_sandstone: 'block/red_sandstone_top.png', prismarine: 'block/prismarine_bricks.png' }[m[1]]; if (sb) D.push(sb); }
    if ((m = k.match(/^(stripped_)?(.*)_wood$/))) D.push(`block/${m[1] || ''}${m[2]}_log.png`);
    if ((m = k.match(/^(stripped_)?(.*)_hyphae$/))) D.push(`block/stripped_${m[2]}_stem.png`, `block/${m[1] || ''}${m[2]}_stem.png`);
    if ((m = k.match(/^(.*)_(bed|carpet)$/))) D.push(`block/${m[1]}_wool.png`);
    if ((m = k.match(/^waxed_(.*)$/))) D.push(`block/${m[1]}.png`);
    if ((m = k.match(/^(.*cut_copper)_(slab|stairs)$/))) D.push(`block/${m[1]}.png`);
    const SP = { smooth_quartz: ['block/quartz_block_bottom.png'], smooth_sandstone: ['block/sandstone_top.png'], smooth_red_sandstone: ['block/red_sandstone_top.png'], prismarine: ['block/prismarine_bricks.png', 'block/prismarine_bricks_0.png'],
      dried_kelp_block: ['block/dried_kelp_side.png'], enchanted_golden_apple: ['item/golden_apple.png'], creeper_head: ['item/creeper_banner_pattern.png', 'item/gunpowder.png'], wither_skeleton_skull: ['item/bone.png'] };
    const cands = [...(ING_ALIAS[k] || []), ...D, ...(SP[k] || []), `item/${k}.png`, `block/${k}.png`, `block/${k}_side.png`, `block/${k}_front.png`, `block/${k}_top.png`, `block/${k}_still.png`];
    let rel = null;
    for (const c of cands) { rel = await ensureTexture(c); if (rel) break; }
    ingredients[k] = { icon: rel || 'item/barrier.png', de: de['item.minecraft.' + k] || de['block.minecraft.' + k] || k, real: !!rel };
  }
  // Ergebnis-Icons der Crafting-Raetsel: Platzhalter (Werkbank/Barriere) und fehlende Eintraege durch das Icon des Ergebnis-Items ersetzen
  const PLACEHOLDER = /crafting_table_front|barrier/;
  let fixedResults = 0;
  q.filter(x => x.type === 'crafting' && x.resultKey && ingredients[x.resultKey] && ingredients[x.resultKey].real).forEach(x => {
    const cur = icons[x.answer];
    const e = ingredients[x.resultKey].icon, b = cur ? path.basename(cur, '.png') : '';
    const passt = cur && (cur === e || b === x.resultKey || x.resultKey.includes(b) || b.includes(x.resultKey));
    if (!cur || PLACEHOLDER.test(cur) || !passt) { icons[x.answer] = e; fixedResults++; }
  });
  if (fixedResults) console.log('Ergebnis-Icons korrigiert:', fixedResults);
  const ingMissing = Object.keys(ingredients).filter(k => !ingredients[k].real);
  if (ingKeys.size) console.log('Zutaten-Icons:', ingKeys.size, 'ohne echte Textur:', ingMissing.join(',') || '-');
  const TINT = (() => { try { return require('./tint-icons.js'); } catch (e) { return null; } })();   // gefaerbte Icons (Leder, Traenke, Biomfarben) uebernehmen
  if (TINT) TINT.remap(null, ingredients, null);
  if (!DRY && ingKeys.size) fs.writeFileSync(path.join(MC, 'ingredient-icons.json'), JSON.stringify(ingredients));
  if (!DRY && catalog) {
    // Katalog: Icon eintragen (Pfad relativ zu assets/mc ohne .png); Items ohne Textur entfallen
    const used = new Set();
    q.filter(x => x.type === 'crafting').forEach(x => [x.solution, ...(x.solutionAlts || [])].filter(Boolean).forEach(sol => (sol.shapeless ? sol.items : sol.grid.flat()).filter(Boolean).forEach(l => l.forEach(k => used.add(k)))));
    const keep = catalog.filter(it => ingredients[it.key] && (ingredients[it.key].real || used.has(it.key))).map(it => Object.assign({}, it, { icon: ingredients[it.key].icon.replace(/[.]png$/, '') }));
    if (TINT) TINT.remap(null, null, keep);
    fs.writeFileSync(path.join(MC, 'craft-items.json'), JSON.stringify(keep));
    console.log('Item-Katalog:', keep.length, 'von', catalog.length, '(ohne Textur entfernt:', catalog.length - keep.length + ')');
  }

  // Schreibvarianten (z. B. "Magmacreme" statt "Magma-Creme") zeigen auf dasselbe Icon, weil der Client exakt nach Anzeigename sucht
  for (const [v, c] of canonOf) if (v !== c && icons[c] && !icons[v]) icons[v] = icons[c];
  const out = { names: sortedNames, aliases };
  if (!DRY) {
    // Liste der per Skript geladenen Texturen: tools/gen-sw-assets.js cached sie nicht vor (nur on demand)
    const odPath = path.join(MC, 'ondemand.json');
    let od = []; try { od = JSON.parse(fs.readFileSync(odPath, 'utf8')); } catch (e) {}
    fs.writeFileSync(odPath, JSON.stringify([...new Set([...od, ...DOWNLOADED])].sort()));
    if (TINT) TINT.remap(icons, null, null);
    fs.writeFileSync(path.join(MC, 'icons.json'), JSON.stringify(icons, null, 1));
    fs.writeFileSync(path.join(MC, 'answers.json'), JSON.stringify(out));
  }
  const cnt = { echt: 0, stellvertreter: 0, fallback: 0 };
  Object.values(how).forEach(m => cnt[m]++);
  const fall = Object.keys(how).filter(n => how[n] === 'fallback');
  const proxy = Object.keys(how).filter(n => how[n] === 'stellvertreter');
  // Gesamtgroesse der verwendeten neuen Dateien
  const used = [...new Set(Object.values(icons))];
  let bytes = 0; used.forEach(r => { const p = path.join(MC, r); if (fs.existsSync(p)) bytes += fs.statSync(p).size; });
  const md = `# ICONS-REPORT

Erzeugt von \`tools/fetch-icons.js\`.

- Antwortoptionen (kanonische deutsche Namen): **${sortedNames.length}**, Aliase (englisch/Varianten, nur zum Suchen): ${Object.keys(aliases).length}
- Icon echt (Registry-Textur): **${cnt.echt}**, Stellvertreter: **${cnt.stellvertreter}**, neutrales Fallback (\`item/barrier.png\`): **${cnt.fallback}**
- Verwendete Textur-Dateien: ${used.length}, Gesamtgröße ca. ${Math.round(bytes / 1024)} KB (inkl. bereits vorhandener)
- Quelle fehlender Texturen: PrismarineJS/minecraft-assets 1.21.11 (16x16, erstes Frame)

## Stellvertreter
${proxy.map(n => `- ${n} -> ${icons[n]}`).join('\n') || '-'}

## Ohne Icon (Fallback barrier)
${fall.map(n => `- ${n}`).join('\n') || '-'}
`;
  if (!DRY) fs.writeFileSync(path.join(ROOT, 'docs', 'team', 'ICONS-REPORT.md'), md);
  console.log(JSON.stringify({ options: sortedNames.length, aliases: Object.keys(aliases).length, ...cnt, files: used.length, kb: Math.round(bytes / 1024) }));
}
main().catch(e => { console.error(e); process.exit(1); });
