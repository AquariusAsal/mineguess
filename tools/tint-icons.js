/**
 * Einfaerben von Icons, die Minecraft zur Laufzeit faerbt (die Vanilla-Texturen sind nur graue Basen):
 *   Lederruestung   Basis * #A06540, Overlay (Details) unveraendert darueber        -> item/leather_<teil>_dyed.png
 *   Traenke         Overlay (Fluessigkeit) * Effektfarbe, Flasche darueber            -> item/potion_<effekt>_dyed.png, splash_potion_<effekt>_dyed.png
 *   Biomfarben      Gras (#91BD59), Grasblock-Seite (Basis + getoentes Overlay), Laub, Ranken, Seerose, Farn
 * Aufruf:  node tools/tint-icons.js [--dry] [--scan]
 *   --scan   prueft ALLE Icons (icons.json, ingredient-icons.json, craft-items.json) auf fehlende Dateien, graue Basen und unpassende
 *            Stellvertreter und schreibt den Abschnitt "Icon-Scan" in docs/team/ICONS-REPORT.md
 * Ablauf: erzeugt die *_dyed.png (16x16) in assets/mc, schreibt sie in ondemand.json (kein Precache) und stellt icons.json,
 * ingredient-icons.json und craft-items.json auf die gefaerbten Dateien um (idempotent). tools/fetch-icons.js ruft remap() beim Schreiben auf.
 * Overlays kommen aus dem Mirror PrismarineJS/minecraft-assets (wie fetch-icons.js, Cache ../mineguess-cache/icons).
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const PNG = require('./png.js');

const ROOT = path.join(__dirname, '..');
const MC = path.join(ROOT, 'assets', 'mc');
const CACHE = path.join(process.env.MC_CACHE || path.join(ROOT, '..', 'mineguess-cache'), 'icons');
const MIRROR = 'https://raw.githubusercontent.com/PrismarineJS/minecraft-assets/master/data/1.21.11/';

const LEATHER = '#A06540';
const PARTS = ['helmet', 'chestplate', 'leggings', 'boots', 'horse_armor'];
// Standardfarben der Vanilla-Effekte (Java)
const EFFECTS = {
  water: '#385DC6', night_vision: '#1F1FA1', invisibility: '#7F8392', leaping: '#FDFF84', fire_resistance: '#FF9900', swiftness: '#33EBFF', slowness: '#8BAFE0',
  water_breathing: '#98DAC0', healing: '#F82423', harming: '#A9656A', poison: '#87A363', regeneration: '#CD5CAB', strength: '#FFC700', weakness: '#484D48',
  luck: '#59C106', slow_falling: '#F7F8E0', wind_charged: '#BDC9FF', weaving: '#78695A', oozing: '#99FFA3', infested: '#8C9B8F',
};
// Deutsche Anzeigenamen -> Effekt
const POTION_NAMES = {
  Unsichtbarkeitstrank: 'invisibility', Heiltrank: 'healing', Schnelligkeitstrank: 'swiftness', Nachtsichttrank: 'night_vision', Regenerationstrank: 'regeneration',
  Stärketrank: 'strength', Feuerresistenztrank: 'fire_resistance', Gifttrank: 'poison', Sprungtrank: 'leaping', Schwächetrank: 'weakness', Verlangsamungstrank: 'slowness',
  Wasseratmungstrank: 'water_breathing', Schadenstrank: 'harming', Glückstrank: 'luck', Federfalltrank: 'slow_falling', 'Trank der Heilung': 'healing', 'Trank der Regeneration': 'regeneration',
  'Trank der Stärke': 'strength', 'Trank der Schnelligkeit': 'swiftness', 'Trank der Unsichtbarkeit': 'invisibility', 'Trank der Nachtsicht': 'night_vision',
};
// Inhaltlich passende Texturen fuer Namen, deren automatischer Stellvertreter falsch war (Anzeigename bzw. Zutaten-Schluessel -> Textur)
const OVERRIDE_NAMES = { 'Weißes Banner': 'block/white_wool.png', Schild: 'item/iron_chestplate.png', Schallplatte: 'item/music_disc_5.png', Hochofen: 'block/blast_furnace_front.png',
  Pigmen: 'item/gold_ingot.png', Strohhut: 'block/hay_block_side.png', Räuberhauptmann: 'item/crossbow_standby.png', Überfall: 'item/crossbow_standby.png' };
const OVERRIDE_KEYS = { creeper_head: 'item/gunpowder.png', wither_skeleton_skull: 'block/wither_rose.png', music_disc_5: 'item/music_disc_5.png', shield: 'item/iron_chestplate.png', white_banner: 'block/white_wool.png' };
const BIOME = '#91BD59';
const BLOCKS = [   // [basis, overlay|null, farbe, ausgabe]
  ['block/grass_block_top', null, BIOME, 'block/grass_block_top_dyed'],
  ['block/grass_block_side', 'block/grass_block_side_overlay', BIOME, 'block/grass_block_side_dyed'],
  ['block/oak_leaves', null, '#77AB2F', 'block/oak_leaves_dyed'],
  ['block/jungle_leaves', null, '#77AB2F', 'block/jungle_leaves_dyed'],
  ['block/acacia_leaves', null, '#77AB2F', 'block/acacia_leaves_dyed'],
  ['block/dark_oak_leaves', null, '#77AB2F', 'block/dark_oak_leaves_dyed'],
  ['block/spruce_leaves', null, '#619961', 'block/spruce_leaves_dyed'],
  ['block/birch_leaves', null, '#80A755', 'block/birch_leaves_dyed'],
  ['block/mangrove_leaves', null, '#8DB127', 'block/mangrove_leaves_dyed'],
  ['block/vine', null, '#48B518', 'block/vine_dyed'],
  ['block/lily_pad', null, '#208030', 'block/lily_pad_dyed'],
  ['block/fern', null, BIOME, 'block/fern_dyed'],
  ['block/short_grass', null, BIOME, 'block/short_grass_dyed'],
  ['block/tall_grass_top', null, BIOME, 'block/tall_grass_top_dyed'],
];

function get(url) {
  return new Promise(resolve => {
    https.get(url, { headers: { 'User-Agent': 'mineguess-icons' } }, res => {
      if (res.statusCode !== 200) { res.resume(); return resolve(null); }
      const c = []; res.on('data', d => c.push(d)); res.on('end', () => resolve(Buffer.concat(c)));
    }).on('error', () => resolve(null));
  });
}
// Textur laden: lokal (assets/mc), Cache, Mirror. Rueckgabe dekodiertes Bild (auf 16x16 begrenzt) oder null.
async function load(rel) {
  const local = path.join(MC, rel + '.png');
  let buf = fs.existsSync(local) ? fs.readFileSync(local) : null;
  if (!buf) {
    const [folder, file] = rel.split('/');
    const cf = path.join(CACHE, folder + '__' + file + '.png'), miss = cf + '.404';
    if (fs.existsSync(miss)) return null;
    buf = fs.existsSync(cf) ? fs.readFileSync(cf) : await get(MIRROR + (folder === 'item' ? 'items/' : 'blocks/') + file + '.png');
    if (!buf) { fs.mkdirSync(CACHE, { recursive: true }); fs.writeFileSync(miss, ''); return null; }
    fs.mkdirSync(CACHE, { recursive: true }); fs.writeFileSync(cf, buf);
  }
  let img;
  try { img = PNG.decode(buf); } catch (e) { return null; }
  if (img.w === 16 && img.h === 16) return img;
  if (img.w >= 16 && img.h >= 16 && img.w % 16 === 0) {   // groessere Textur/Animationsstreifen: erstes 16x16-Feld nach unten skaliert (Nearest)
    const f = img.w / 16, px = new Uint8Array(16 * 16 * 4);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) for (let c = 0; c < 4; c++) px[(y * 16 + x) * 4 + c] = img.px[((y * f) * img.w + x * f) * 4 + c];
    return { w: 16, h: 16, px };
  }
  return null;
}

/** Zuordnung Basis-Pfad (mit .png) -> gefaerbte Datei, soweit diese existiert. */
function dyedMap() {
  const m = {};
  PARTS.forEach(p => { m[`item/leather_${p}.png`] = `item/leather_${p}_dyed.png`; });
  BLOCKS.forEach(b => { m[b[0] + '.png'] = b[3] + '.png'; });
  Object.keys(m).forEach(k => { if (!fs.existsSync(path.join(MC, m[k]))) delete m[k]; });
  return m;
}
/** Passende Datei fuer einen Anzeigenamen (Tranke), sonst null. */
function potionFor(name) {
  const eff = POTION_NAMES[name] || (/trank$/i.test(name) || /^Trank /.test(name) ? 'water' : null);
  const f = eff && `item/potion_${eff}_dyed.png`;
  return f && fs.existsSync(path.join(MC, f)) ? f : null;
}
/** Wendet die Umstellung auf die drei Icon-Strukturen an (in-place). Rueckgabe Anzahl Aenderungen. */
function remap(icons, ingredients, catalog) {
  const m = dyedMap();
  let n = 0;
  const have = f => fs.existsSync(path.join(MC, f));
  if (icons) Object.keys(icons).forEach(k => {
    if (OVERRIDE_NAMES[k] && have(OVERRIDE_NAMES[k]) && icons[k] !== OVERRIDE_NAMES[k]) { icons[k] = OVERRIDE_NAMES[k]; n++; return; }
    const p = potionFor(k);
    if (p && icons[k] !== p && /(emerald|barrier|potion)[.]png$/.test(icons[k])) { icons[k] = p; n++; }
    else if (m[icons[k]]) { icons[k] = m[icons[k]]; n++; }
  });
  if (ingredients) Object.keys(ingredients).forEach(k => { const v = ingredients[k]; if (OVERRIDE_KEYS[k] && have(OVERRIDE_KEYS[k]) && v.icon !== OVERRIDE_KEYS[k]) { v.icon = OVERRIDE_KEYS[k]; n++; } else if (m[v.icon]) { v.icon = m[v.icon]; n++; } });
  if (catalog) catalog.forEach(it => { if (OVERRIDE_KEYS[it.key] && have(OVERRIDE_KEYS[it.key])) { const o = OVERRIDE_KEYS[it.key].replace(/[.]png$/, ''); if (it.icon !== o) { it.icon = o; n++; } return; } const f = m[it.icon + '.png']; if (f) { it.icon = f.replace(/[.]png$/, ''); n++; } });
  return n;
}

async function build(dry) {
  const made = [];
  const save = (rel, img) => { if (!img) return; made.push(rel); if (!dry) { fs.mkdirSync(path.dirname(path.join(MC, rel)), { recursive: true }); fs.writeFileSync(path.join(MC, rel), PNG.encode(img)); } };
  for (const p of PARTS) {
    const base = await load(`item/leather_${p}`), ov = await load(`item/leather_${p}_overlay`);
    if (!base) { console.log('Basis fehlt: leather_' + p); continue; }
    let img = PNG.tint(base, LEATHER); if (ov) img = PNG.over(img, ov); else console.log('Overlay fehlt: leather_' + p + ' (nur eingefaerbt)');
    save(`item/leather_${p}_dyed.png`, img);
  }
  for (const kind of ['potion', 'splash_potion', 'lingering_potion']) {
    const bottle = await load(`item/${kind}`), liquid = await load(`item/${kind}_overlay`);
    if (!bottle || !liquid) { console.log('Trank-Texturen fehlen: ' + kind); continue; }
    for (const [eff, col] of Object.entries(EFFECTS)) save(`item/${kind}_${eff}_dyed.png`, PNG.over(PNG.tint(liquid, col), bottle));
  }
  for (const [b, o, col, out] of BLOCKS) {
    const base = await load(b); if (!base) continue;
    let img;
    if (o) { const ov = await load(o); img = ov ? PNG.over(base, PNG.tint(ov, col)) : PNG.tint(base, col); } else img = PNG.tint(base, col);
    save(out + '.png', img);
  }
  // Override-Texturen holen und als Datei ablegen
  for (const rel of new Set([...Object.values(OVERRIDE_NAMES), ...Object.values(OVERRIDE_KEYS)])) {
    const target = path.join(MC, rel);
    if (fs.existsSync(target)) continue;
    const img = await load(rel.replace(/[.]png$/, ''));
    if (img) { made.push(rel); if (!dry) { fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, PNG.encode(img)); } } else console.log('Textur nicht gefunden: ' + rel);
  }
  // nicht vorab cachen: in ondemand.json eintragen
  if (!dry && made.length) {
    const od = path.join(MC, 'ondemand.json'); let list = []; try { list = JSON.parse(fs.readFileSync(od, 'utf8')); } catch (e) {}
    fs.writeFileSync(od, JSON.stringify([...new Set([...list, ...made])].sort()));
  }
  console.log('gefaerbte Icons:', made.length);
  return made;
}

function applyFiles(dry) {
  const rd = f => { try { return JSON.parse(fs.readFileSync(path.join(MC, f), 'utf8')); } catch (e) { return null; } };
  const icons = rd('icons.json'), ing = rd('ingredient-icons.json'), cat = rd('craft-items.json');
  const n = remap(icons, ing, cat);
  if (ing) {   // ungenutzte Zutaten ohne Textur (Barrier-Platzhalter) entfernen
    let used = new Set(); try { JSON.parse(fs.readFileSync(path.join(ROOT, 'questions.json'), 'utf8')).filter(q => q.type === 'crafting').forEach(q => q.grid.flat().filter(Boolean).forEach(k => used.add(k))); } catch (e) {}
    Object.keys(ing).forEach(k => { if (/barrier/.test(ing[k].icon) && !used.has(k)) delete ing[k]; });
  }
  if (!dry) {
    if (icons) fs.writeFileSync(path.join(MC, 'icons.json'), JSON.stringify(icons, null, 1));
    if (ing) fs.writeFileSync(path.join(MC, 'ingredient-icons.json'), JSON.stringify(ing));
    if (cat) fs.writeFileSync(path.join(MC, 'craft-items.json'), JSON.stringify(cat));
  }
  console.log('Icon-Zuordnungen umgestellt:', n);
}

// ── Scan aller Icons ──────────────────────────────────────────────────────────────
function scan() {
  const rd = f => { try { return JSON.parse(fs.readFileSync(path.join(MC, f), 'utf8')); } catch (e) { return null; } };
  const icons = rd('icons.json') || {}, ing = rd('ingredient-icons.json') || {}, cat = rd('craft-items.json') || [];
  const refs = new Map();   // Datei -> Verwender
  const add = (f, who) => { f = String(f).replace(/^\//, ''); if (!/[.]png$/.test(f)) f += '.png'; (refs.get(f) || refs.set(f, []).get(f)).push(who); };
  Object.entries(icons).forEach(([k, v]) => add(v, 'Antwort: ' + k));
  Object.entries(ing).forEach(([k, v]) => add(v.icon, 'Zutat: ' + k));
  cat.forEach(it => add(it.icon, 'Katalog: ' + it.key));
  const missing = [], gray = [], mismatch = [];
  const NEEDS_TINT = /leather_(helmet|chestplate|leggings|boots|horse_armor)[.]png$|(^|\/)(potion|splash_potion|lingering_potion)[.]png$|_leaves[.]png$|(^|\/)(grass_block_top|grass_block_side|vine|lily_pad|fern|short_grass|tall_grass_top)[.]png$/;
  const GRAY_OK = /stone|iron|andesite|diorite|cobble|deepslate|tuff|gravel|ash|snow|smoke|chain|anvil|bedrock|blackstone|basalt|nugget|shears|bucket|cauldron|hopper|furnace|dispenser|dropper|observer|piston|rail|lever|button|plate|bell|barrel|glass|bone|quartz|calcite|clay|prismarine|skeleton|wolf|armor|chainmail|sword|axe|pickaxe|shovel|hoe|flint|coal|charcoal|string|paper|book|map|feather|compass|clock|spyglass|lantern|dust|powder|arrow|trident|crossbow|bow|elytra|totem|egg|disc|lodestone|netherite|obsidian|ender|end_|sculk|mud|ice|concrete|wool|terracotta|candle|banner|bed|carpet|dye|slime|pearl|crystal|amethyst|lead|brush|pot|sherd|smithing|template/;
  for (const [f, who] of refs) {
    const p = path.join(MC, f);
    if (!fs.existsSync(p)) { missing.push(f + '  (' + who.slice(0, 2).join(', ') + ')'); continue; }
    if (/barrier[.]png$/.test(f)) { mismatch.push(f + ' als Platzhalter: ' + who.slice(0, 4).join(', ')); continue; }
    let st; try { st = PNG.stats(PNG.decode(fs.readFileSync(p))); } catch (e) { missing.push(f + ' (nicht lesbar)'); continue; }
    if (NEEDS_TINT.test(f)) gray.push(f + '  sat ' + st.sat.toFixed(2) + '  NICHT gefaerbt  (' + who.slice(0, 3).join(', ') + ')');
    else if (st.sat < 0.05 && st.visible > 0.2 && !GRAY_OK.test(f)) gray.push(f + '  sat ' + st.sat.toFixed(2) + '  (' + who.slice(0, 3).join(', ') + ')');
  }
  // inhaltlich unpassende Stellvertreter: Traenke, Ruestung, Waffen usw. auf Edelsteine/Barrier
  Object.entries(icons).forEach(([k, v]) => {
    if (/trank|Trank/.test(k) && !/potion/.test(v) && !/flasche|Flasche/.test(k)) mismatch.push(`${k} -> ${v} (Trank ohne Trank-Icon)`);
    if (/(emerald|nether_star|barrier)[.]png$/.test(v) && !/Smaragd|Netherstern|Barriere/i.test(k)) mismatch.push(`${k} -> ${v} (verdaechtiger Stellvertreter)`);
  });
  return { missing, gray, mismatch, total: refs.size };
}
function writeReport(r) {
  const f = path.join(ROOT, 'docs', 'team', 'ICONS-REPORT.md');
  let md = ''; try { md = fs.readFileSync(f, 'utf8'); } catch (e) {}
  const i = md.indexOf('\n## Icon-Scan'); if (i >= 0) md = md.slice(0, i);
  const list = a => (a.length ? a.map(x => '- ' + x).join('\n') : '- keine');
  md += `\n## Icon-Scan (tools/tint-icons.js --scan, ${new Date().toISOString().slice(0, 10)})\nGeprueft: ${r.total} verschiedene Icon-Dateien aus icons.json, ingredient-icons.json und craft-items.json.\n\n### Fehlende/unlesbare Dateien\n${list(r.missing)}\n\n### Graue Basen / ungefaerbte Texturen\n${list(r.gray)}\n\n### Unpassende Stellvertreter\n${list(r.mismatch)}\n\nKorrekturen: Lederruestung, Traenke und Biomfarben werden von tools/tint-icons.js eingefaerbt (*_dyed.png, Farben: Leder #A06540, Gras #91BD59, Laub #77AB2F, Traenke je Effekt) und automatisch in icons.json/ingredient-icons.json/craft-items.json eingetragen.\n`;
  fs.writeFileSync(f, md);
}

module.exports = { remap, dyedMap, potionFor, EFFECTS, PARTS };

if (require.main === module) {
  (async () => {
    const dry = process.argv.includes('--dry');
    await build(dry);
    applyFiles(dry);
    if (process.argv.includes('--scan')) { const r = scan(); console.log('Scan: fehlend', r.missing.length, 'grau', r.gray.length, 'Stellvertreter', r.mismatch.length); if (!dry) writeReport(r); }
  })();
}
