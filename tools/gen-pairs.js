/**
 * Erzeugt pairs.json (Hoeher/Tiefer-Messgroessen) aus questions.json:  node tools/gen-pairs.js
 * Format: { measures:[ { id:'block_haerte', label, unit, ask, items:[ {id, name, value, icon} ] } ] }   (id = gen-Vorlage)
 * Nur Objekte MIT Icon: Name -> assets/mc/icons.json, sonst ueber den deutschen/englischen Registry-Namen (../mineguess-cache/de_de.json) auf eine
 * lokale Textur (item/<id>, block/<id>, _side/_front/_top, <mob>_spawn_egg). icon = Pfad relativ zu assets/mc ohne .png.
 * Paare bildet der Client mit pairs.js (MGPairs.fromMeasures) - dieselbe Logik wie die Tests.
 */
const fs = require('fs');
const path = require('path');
const MGPairs = require('../pairs.js');
const root = path.join(__dirname, '..');
const MC = path.join(root, 'assets', 'mc');
const CACHE = process.env.MC_CACHE || path.join(root, '..', 'mineguess-cache');
const qs = JSON.parse(fs.readFileSync(path.join(root, 'questions.json'), 'utf8'));
const icons = JSON.parse(fs.readFileSync(path.join(MC, 'icons.json'), 'utf8'));
const norm = s => String(s).toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/[^a-z0-9]/g, '');

// Name -> Registry-Ids (de/en, Item vor Block vor Entity)
const byName = new Map();
try {
  const de = JSON.parse(fs.readFileSync(path.join(CACHE, 'de_de.json'), 'utf8')), en = JSON.parse(fs.readFileSync(path.join(CACHE, 'en_us.json'), 'utf8'));
  for (const lang of [de, en]) for (const [k, v] of Object.entries(lang)) {
    const m = /^(item|block|entity)\.minecraft\.([a-z0-9_]+)$/.exec(k);
    if (!m) continue;
    const key = norm(v), arr = byName.get(key) || [];
    arr.push({ kind: m[1], id: m[2] });
    byName.set(key, arr);
  }
} catch (e) { console.warn('Hinweis: Cache fuer Namensaufloesung fehlt, nur icons.json wird genutzt'); }
const has = rel => fs.existsSync(path.join(MC, rel + '.png'));
function resolve(name) {
  if (icons[name] && has(String(icons[name]).replace(/[.]png$/, ''))) return String(icons[name]).replace(/[.]png$/, '');
  for (const c of byName.get(norm(name)) || []) {
    const cands = c.kind === 'item' ? [`item/${c.id}`, `block/${c.id}`] : c.kind === 'block' ? [`block/${c.id}`, `block/${c.id}_side`, `block/${c.id}_front`, `block/${c.id}_top`, `item/${c.id}`]
      : [`item/${c.id}_spawn_egg`, `item/${c.id}`];
    for (const r of cands) if (has(r)) return r;
  }
  return null;
}
const iconMap = {};
for (const q of qs) {
  if (q.type !== 'number' || !MGPairs.TEMPLATES[q.gen]) continue;
  const m = /„([^“]+)“/.exec(q.question || '');
  if (m && !(m[1] in iconMap)) { const r = resolve(m[1].trim()); if (r) iconMap[m[1].trim()] = r; }
}
const pool = MGPairs.buildPool(qs, iconMap);
const measures = pool.keys.map(k => { const t = pool.templates[k]; return { id: t.gen, label: t.label, unit: t.unit, ask: t.ask, items: t.items }; });
fs.writeFileSync(path.join(root, 'pairs.json'), JSON.stringify({ measures }));
console.log('pairs.json:', measures.map(m => m.id + ' ' + m.items.length).join(', '));
