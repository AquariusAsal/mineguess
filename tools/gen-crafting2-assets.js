/**
 * Ergaenzt den Item-Katalog des Bau-Modus (assets/mc/craft-items.json) um alle Schluessel der neuen Crafting-Raetsel (gen 'crafting2'):
 * Ergebnisse, Zutaten und Loesungs-Alternativen. Nur Hinzufuegen, bestehende Eintraege bleiben unveraendert.
 * Danach node tools/fetch-icons.js ausfuehren (laedt fehlende Texturen, schreibt icons.json, ingredient-icons.json, craft-items.json mit Icon).
 *   node tools/gen-crafting2-assets.js
 */
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const CACHE = process.env.MC_CACHE || path.join(root, '..', 'mineguess-cache');
const de = JSON.parse(fs.readFileSync(path.join(CACHE, 'de_de.json'), 'utf8')), en = JSON.parse(fs.readFileSync(path.join(CACHE, 'en_us.json'), 'utf8'));
const nameDe = n => de['item.minecraft.' + n] || de['block.minecraft.' + n];
const nameEn = n => en['item.minecraft.' + n] || en['block.minecraft.' + n];
const q = JSON.parse(fs.readFileSync(path.join(root, 'questions.json'), 'utf8')).filter(x => x.gen === 'crafting2');
const catPath = path.join(root, 'assets', 'mc', 'craft-items.json');
const cat = JSON.parse(fs.readFileSync(catPath, 'utf8'));
const have = new Set(cat.map(c => c.key));
const keys = new Set();
q.forEach(x => {
  keys.add(x.resultKey); x.grid.flat().filter(Boolean).forEach(k => keys.add(k));
  [x.solution].filter(Boolean).forEach(s => (s.shapeless ? s.items : s.grid.flat()).filter(Boolean).forEach(l => l.forEach(k => keys.add(k))));
});
const ALIAS = (k) => {
  const out = [];
  if (/_planks$/.test(k)) out.push('Planken', 'Bretter', 'Holzbretter', 'Planks');
  if (/_slab$/.test(k)) out.push('Stufe', 'Halbblock', 'Slab');
  if (/_stairs$/.test(k)) out.push('Treppe');
  if (/_wool$/.test(k)) out.push('Wolle');
  if (/_ingot$/.test(k)) out.push('Barren');
  if (/_dye$/.test(k)) out.push('Farbstoff');
  return out;
};
let added = 0;
[...keys].sort().forEach(k => {
  if (have.has(k)) return;
  const d = nameDe(k), e = nameEn(k) || k;
  if (!d) return;
  const al = ALIAS(k).filter(a => a !== d && a !== e);
  cat.push({ key: k, de: d, en: e, aliases: al, icon: null }); added++;
});
cat.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
fs.writeFileSync(catPath, JSON.stringify(cat));
console.log('Katalog:', cat.length, 'Eintraege (neu', added + ')');
