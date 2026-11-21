/**
 * Modell-Metadaten fuer 3D-Icons (isometrischer Renderer im Frontend): schreibt assets/mc/models.json (neue Datei, aendert nichts Bestehendes).
 *   node tools/gen-models.js [--dry]
 * Quelle: Mojang-Modellmasse laut docs/team/MODELLE-3D.md (1.21.4), Item-Liste und Namen aus ../mineguess-cache (minecraft-data).
 * Fehlende Texturen werden aus dem Cache (../mineguess-cache/icons) nach assets/mc/block kopiert (nur Hinzufuegen) und in
 * assets/mc/ondemand.json eingetragen (nicht vorab im Service Worker).
 *
 * Format (siehe docs/team/API-NOTES.md):
 *   { v:1, view:{ <viewId>:{ rot:[x,y,z], scale, shift:[x,y,z] } },
 *     types:{ <typ>:{ view, boxes:[ {from:[x,y,z], to:[x,y,z], tex:'side'|'top'|'bottom'|'front'} ] } },
 *     items:{ <itemKey>:{ m:<typ>, side:'block/x.png', top?:'block/..', bottom?:'block/..', front?:'block/..' } } }
 * Koordinaten in 1/16 Block (x Breite, y Hoehe, z Tiefe). Items ohne Eintrag: flaches Icon wie bisher.
 */
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const MC = path.join(root, 'assets', 'mc');
const CACHE = process.env.MC_CACHE || path.join(root, '..', 'mineguess-cache');
const dry = process.argv.includes('--dry');
const J = f => JSON.parse(fs.readFileSync(path.join(CACHE, f), 'utf8'));
const items = J('items.json'), blocks = J('blocks.json'), de = J('de_de.json');
const hasName = n => !!(de['item.minecraft.' + n] || de['block.minecraft.' + n]);
const blockSet = new Map(blocks.map(b => [b.name, b]));

const BOXES = {
  cube: [{ from: [0, 0, 0], to: [16, 16, 16] }],
  slab: [{ from: [0, 0, 0], to: [16, 8, 16] }],
  stairs: [{ from: [0, 0, 0], to: [16, 8, 16] }, { from: [8, 8, 0], to: [16, 16, 16] }],
  fence: [{ from: [6, 0, 0], to: [10, 16, 4] }, { from: [6, 0, 12], to: [10, 16, 16] }, { from: [7, 12, 0], to: [9, 15, 16] }, { from: [7, 6, 0], to: [9, 9, 16] }],
  fence_gate: [{ from: [0, 5, 7], to: [2, 16, 9] }, { from: [14, 5, 7], to: [16, 16, 9] }, { from: [6, 6, 7], to: [8, 15, 9] }, { from: [8, 6, 7], to: [10, 15, 9] },
    { from: [2, 6, 7], to: [6, 9, 9] }, { from: [2, 12, 7], to: [6, 15, 9] }, { from: [10, 6, 7], to: [14, 9, 9] }, { from: [10, 12, 7], to: [14, 15, 9] }],
  wall: [{ from: [4, 0, 4], to: [12, 16, 12] }, { from: [5, 0, 0], to: [11, 13, 16] }],
  trapdoor: [{ from: [0, 0, 0], to: [16, 3, 16] }],
  button: [{ from: [5, 6, 6], to: [11, 10, 10] }],
  pressure_plate: [{ from: [1, 0, 1], to: [15, 1, 15] }],
  carpet: [{ from: [0, 0, 0], to: [16, 1, 16] }],
  anvil: [{ from: [2, 0, 2], to: [14, 4, 14] }, { from: [4, 4, 3], to: [12, 5, 13] }, { from: [6, 5, 4], to: [10, 10, 12] }, { from: [3, 10, 0], to: [13, 16, 16] }],
};
const VIEWS = { std: { rot: [30, 225, 0], scale: 0.625, shift: [0, 0, 0] }, stairs: { rot: [30, 135, 0], scale: 0.625, shift: [0, 0, 0] }, gate: { rot: [30, 45, 0], scale: 0.8, shift: [0, -1, 0] } };
const TYPE_VIEW = { cube: 'std', slab: 'std', stairs: 'stairs', fence: 'stairs', fence_gate: 'gate', wall: 'stairs', trapdoor: 'std', button: 'std', pressure_plate: 'std', carpet: 'std', anvil: 'std' };
const types = {};
Object.keys(BOXES).forEach(t => { types[t] = { view: TYPE_VIEW[t], boxes: BOXES[t].map(b => Object.assign({ tex: 'side' }, b)) }; });
types.slab.boxes[0].tex = 'side'; types.stairs.boxes[1].tex = 'side';
// Oberseiten/Unterseiten nimmt der Renderer aus top/bottom (Fallback side)

// Cache-Texturen: Dateinamen "block__<name>.png"
const have = new Set(fs.readdirSync(path.join(CACHE, 'icons')).filter(f => /^block__.*\.png$/.test(f)).map(f => f.slice(7, -4)));
const local = new Set(fs.readdirSync(path.join(MC, 'block')).filter(f => /\.png$/.test(f)).map(f => f.slice(0, -4)));
const tex = n => (have.has(n) || local.has(n) ? n : null);
const first = (...c) => c.map(tex).find(Boolean) || null;

const WOOD = ['oak', 'spruce', 'birch', 'jungle', 'acacia', 'dark_oak', 'mangrove', 'cherry', 'pale_oak', 'crimson', 'warped', 'bamboo'];
// Texturen des Basisblocks: { side, top, bottom }
function baseTex(b) {
  b = b.replace(/^waxed_/, '');
  if (WOOD.includes(b)) return one(first(b + '_planks'));
  if (b === 'bamboo_mosaic') return one(first('bamboo_mosaic'));
  const SP = {
    sandstone: ['sandstone', 'sandstone_top', 'sandstone_bottom'], red_sandstone: ['red_sandstone', 'red_sandstone_top', 'red_sandstone_bottom'],
    cut_sandstone: ['cut_sandstone', 'sandstone_top', 'sandstone_bottom'], cut_red_sandstone: ['cut_red_sandstone', 'red_sandstone_top', 'red_sandstone_bottom'],
    smooth_sandstone: ['sandstone_top', 'sandstone_top', 'sandstone_top'], smooth_red_sandstone: ['red_sandstone_top', 'red_sandstone_top', 'red_sandstone_top'],
    quartz: ['quartz_block_side', 'quartz_block_top', 'quartz_block_bottom'], smooth_quartz: ['quartz_block_bottom', 'quartz_block_bottom', 'quartz_block_bottom'],
    smooth_stone: ['smooth_stone_slab_side', 'smooth_stone', 'smooth_stone'], purpur: ['purpur_block', 'purpur_block', 'purpur_block'],
    light_weighted: ['gold_block'], heavy_weighted: ['iron_block'], stone_pressure: ['stone'], polished_blackstone_pressure: ['polished_blackstone'],
  };
  if (SP[b]) return three(SP[b]);
  let n = b.replace(/_brick$/, '_bricks').replace(/_tile$/, '_tiles').replace(/^(.*)_bricks$/, '$1_bricks');
  const t = first(n, n + '_block', n + 's', n.replace(/^(.*)_brick$/, '$1_bricks'));
  return t ? one(t) : null;
}
const one = (t) => (t ? { side: t, top: t, bottom: t } : null);
const three = (a) => { const s = first(a[0]), t = first(a[1] || a[0]), u = first(a[2] || a[1] || a[0]); return s ? { side: s, top: t || s, bottom: u || t || s } : null; };

const out = {}, needTex = new Set(), miss = [];
const put = (k, m, t) => { if (!t) { miss.push(k); return; } out[k] = Object.assign({ m }, { side: 'block/' + t.side + '.png', top: 'block/' + t.top + '.png', bottom: 'block/' + t.bottom + '.png' }); [t.side, t.top, t.bottom].forEach(x => needTex.add(x)); };

for (const it of items) {
  const k = it.name;
  if (!hasName(k)) continue;
  let m, b;
  if ((b = (k.match(/^(.*)_slab$/) || [])[1])) { m = 'slab'; }
  else if ((b = (k.match(/^(.*)_stairs$/) || [])[1])) { m = 'stairs'; }
  else if ((b = (k.match(/^(.*)_fence_gate$/) || [])[1])) { m = 'fence_gate'; }
  else if ((b = (k.match(/^(.*)_fence$/) || [])[1])) { m = 'fence'; if (b === 'nether_brick') b = 'nether_brick'; }
  else if ((b = (k.match(/^(.*)_wall$/) || [])[1])) { m = 'wall'; }
  else if ((b = (k.match(/^(.*)_pressure_plate$/) || [])[1])) { m = 'pressure_plate'; }
  else if ((b = (k.match(/^(.*)_button$/) || [])[1])) { m = 'button'; }
  else if ((b = (k.match(/^(.*)_trapdoor$/) || [])[1])) { m = 'trapdoor'; }
  else if (/_carpet$/.test(k)) { m = 'carpet'; }
  else if (/^(chipped_|damaged_)?anvil$/.test(k)) { m = 'anvil'; }
  if (!m) continue;
  let t;
  if (m === 'trapdoor') t = one(first(k.replace(/^waxed_/, '')));
  else if (m === 'carpet') t = one(first(k.replace(/_carpet$/, '_wool'), k.replace(/_carpet$/, '_block')));
  else if (m === 'anvil') { const top = k === 'anvil' ? 'anvil_top' : k + '_top'; t = { side: first('anvil'), top: first(top, 'anvil_top'), bottom: first('anvil') }; if (!t.side) t = null; }
  else if (m === 'pressure_plate' && /^(light_weighted|heavy_weighted)$/.test(b)) t = baseTex(b);
  else if (m === 'pressure_plate' && b === 'stone') t = baseTex('stone_pressure');
  else if (m === 'pressure_plate' && b === 'polished_blackstone') t = baseTex('polished_blackstone_pressure');
  else if (m === 'button' && b === 'stone') t = one(first('stone'));
  else t = baseTex(b);
  put(k, m, t);
}
// Vollbloecke: nur echte Wuerfel (boundingBox block, kein Sondername) mit gefundener Seitentextur
const NOT_CUBE = /(_slab|_stairs|_wall|_fence|_fence_gate|_door|_trapdoor|_button|_pressure_plate|_carpet|_sign|_hanging_sign|_bed|_banner|_head|_skull|_pane|_candle|_torch|_lantern|_chain|_rail|_leaves|_sapling|_flower|_coral|_fan|_vine|_glass|glass$|_cake|_pot|_shulker_box|_chest|_air|portal|piston|command|structure|jigsaw|spawner|barrier|light$)/;
for (const b of blocks) {
  const k = b.name;
  if (out[k] || b.boundingBox !== 'block' || NOT_CUBE.test(k) || !hasName(k) || !items.some(i => i.name === k)) continue;
  const side = first(k + '_side', k, k + '_front', k + '_top');
  if (!side) continue;
  const top = first(k + '_top', k), bottom = first(k + '_bottom', k + '_top', k);
  const front = first(k + '_front');
  const t = { side, top: top || side, bottom: bottom || side };
  put(k, 'cube', t);
  if (front && k !== front) { out[k].front = 'block/' + front + '.png'; needTex.add(front); }
}

const doc = { v: 1, view: VIEWS, types, items: Object.fromEntries(Object.entries(out).sort(([a], [b]) => (a < b ? -1 : 1))) };
const byType = {}; Object.values(out).forEach(x => { byType[x.m] = (byType[x.m] || 0) + 1; });
// Texturen nachziehen
let copied = 0; const added = [];
needTex.forEach(n => {
  const dst = path.join(MC, 'block', n + '.png');
  if (fs.existsSync(dst)) return;
  const srcF = path.join(CACHE, 'icons', 'block__' + n + '.png');
  if (!fs.existsSync(srcF)) return;
  if (!dry) fs.copyFileSync(srcF, dst);
  copied++; added.push('block/' + n + '.png');
});
console.log('Modelle:', Object.keys(out).length, JSON.stringify(byType), '| ohne Textur:', miss.length, miss.slice(0, 8).join(','), '| neue Texturen:', copied);
if (dry) process.exit(0);
fs.writeFileSync(path.join(MC, 'models.json'), JSON.stringify(doc));
const odPath = path.join(MC, 'ondemand.json');
let od = []; try { od = JSON.parse(fs.readFileSync(odPath, 'utf8')); } catch (e) { /* neu */ }
fs.writeFileSync(odPath, JSON.stringify([...new Set([...od, ...added])].sort()));
