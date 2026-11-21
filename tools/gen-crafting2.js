/**
 * Zusaetzliche Crafting-Raetsel (Runde 43): haengt Fragen vom Typ "crafting" aus docs/team/craft-neu.json an questions.json an.
 *   node tools/gen-crafting2.js [--dry]
 * Bestehende Fragen und IDs bleiben unveraendert. Neue IDs ab 4001 (stabil ueber tools/craft2-ids.json, Schluessel = Ergebnis-Item).
 * Bei jedem Lauf werden nur die Eintraege mit gen 'crafting2' neu aufgebaut.
 * Pruefungen: Loesung passt zum Raster (craft-check), Antwort wird erkannt, keine Dublette zu bestehenden Rezepten
 * (gleiche Form/Zutaten = gleiche Anzeige, auch gespiegelt), Raster eindeutig, Ergebnisname eindeutig.
 * Danach: node tools/gen-crafting2-assets.js (Katalog/Icons), node tools/gen-challenge-pool.js bei neuer Pool-Version.
 */
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const dry = process.argv.includes('--dry');
const CraftCheck = require('../craft-check.js');
const MGAnswer = require('../answer-check.js');
const src = JSON.parse(fs.readFileSync(path.join(root, 'docs', 'team', 'craft-neu.json'), 'utf8'));
const qPath = path.join(root, 'questions.json');
const all = JSON.parse(fs.readFileSync(qPath, 'utf8'));
const base = all.filter(q => q.gen !== 'crafting2');
const norm = s => String(s).toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/[^a-z0-9]/g, '');
const hash = (s) => { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; } return h; };
const STONE_TOOL = ['cobblestone', 'blackstone', 'cobbled_deepslate'];

// Anzeige-Signatur eines Rasters: Form ohne leere Raender, Spiegelung gleichgesetzt; formlos = sortierte Zutaten
const sigOf = (cells, shapeless) => {
  if (shapeless) return 'S' + cells.flat().filter(Boolean).sort().join(',');
  const rows = CraftCheck.normalize(cells);
  const a = JSON.stringify(rows), b = JSON.stringify(rows.map(r => r.slice().reverse()));
  return 'G' + (a < b ? a : b);
};
const existing = new Map();           // Signatur -> Ergebnis (bestehende Rezeptraetsel)
base.filter(q => q.type === 'crafting').forEach(q => existing.set(sigOf(q.grid, !!q.shapeless), q.resultKey));
const existingKeys = new Set(base.filter(q => q.type === 'crafting').map(q => q.resultKey));
const existingAnswers = new Set(base.filter(q => q.type === 'crafting').map(q => norm(q.answer)));

const idsPath = path.join(__dirname, 'craft2-ids.json');
const ids = fs.existsSync(idsPath) ? JSON.parse(fs.readFileSync(idsPath, 'utf8')) : {};
let next = Math.max(4000, ...Object.values(ids)) + 1;
const skipped = {};
const skip = (why, r) => { (skipped[why] = skipped[why] || []).push(r.result); };

const FAM_FACT = {
  Boot: 'Boote tragen Spieler über Wasser; es gibt sie für jede Holzart, Bambus wird zum Floß.', 'Tür': 'Holztüren öffnet man per Rechtsklick, Eisentüren nur mit Redstone.',
  Zaun: 'Zäune sind 1,5 Blöcke hoch, deshalb springen Spieler und die meisten Mobs nicht darüber.', Zauntor: 'Zauntore schließen Lücken im Zaun und öffnen sich per Rechtsklick.',
  'Hängeschild': 'Hängeschilder bestehen aus Ketten und entrindeten Stämmen und lassen sich beschriften.', Druckplatte: 'Druckplatten senden ein Redstone-Signal, solange etwas darauf steht.',
  Schild: 'Schilder lassen sich beschriften, mit Farbstoff färben und mit Honigwaben wachsen.', 'Stufe/Platte': 'Platten sind halbe Blöcke, zwei übereinander ergeben einen vollen Block.',
  Treppe: 'Treppen bestehen aus sechs Blöcken und ergeben vier Stufen auf einmal.', 'Falltür': 'Falltüren lassen sich als Boden, Decke oder Leiter-Ersatz nutzen.',
  Holz: 'Aus vier Stämmen entsteht Holz mit Rinde auf allen Seiten.', Mauer: 'Mauern sind 1,5 Blöcke hoch und verbinden sich mit ihren Nachbarn.',
  Banner: 'Banner werden aus Wolle und einem Stock gebaut und lassen sich mit Farbstoffen mustern.', Bett: 'Betten setzen den Spawnpunkt; im Nether und im Ende explodieren sie.',
  Teppich: 'Teppiche sind sehr flach und dämpfen Vibrationen.', Glas: 'Glas ist durchsichtig; gefärbtes Glas entsteht mit Farbstoffen.',
  Terrakotta: 'Terrakotta wird aus Ton gebrannt und lässt sich mit Farbstoff einfärben.', Ziegel: 'Ziegel entstehen aus gebranntem Ton und ergeben Ziegelblöcke.',
  Kupfer: 'Kupfer oxidiert mit der Zeit, Wachs hält den Zustand fest.', 'Werkzeug/Waffe': 'Werkzeuge und Waffen unterscheiden sich in Haltbarkeit und Schaden je nach Material.',
  Bretter: 'Aus einem Stamm entstehen vier Bretter.', Zementpulver: 'Zementpulver wird zu Beton, sobald es mit Wasser in Berührung kommt.',
  Knopf: 'Knöpfe senden ein kurzes Redstone-Signal, Holzknöpfe länger als Steinknöpfe.', Kerze: 'Kerzen leuchten, wenn sie angezündet sind; bis zu vier passen in einen Block.',
  Farbstoff: 'Farbstoffe färben Wolle, Glas, Banner und viele andere Blöcke.', sonstige: 'Ein Handwerksrezept aus dem Spiel.',
};
const FAM_CAP = (f) => (f === 'Stufe/Platte' || f === 'Treppe' ? 8 : f === 'sonstige' ? 40 : 6);      // Varianten-Flut vermeiden (Holz-/Farbfamilien)
const famCount = {};
const out = [], seenSig = new Map(), seenAns = new Set();
const srcRecipes = src.recipes.slice().sort((a, b) => hash(a.result) - hash(b.result));
for (const r of srcRecipes) {
  if (existingKeys.has(r.result)) { skip('schon vorhanden', r); continue; }
  const shapeless = r.recipeType !== 'shaped';
  const cells = [[null, null, null], [null, null, null], [null, null, null]];
  if (shapeless) {
    const ing = (r.ingredients || []).filter(Boolean);
    if (ing.length > 9) { skip('zu viele Zutaten', r); continue; }
    ing.forEach((k, i) => { cells[Math.floor(i / 3)][i % 3] = k; });
  } else {
    if (!r.shape || r.shape.length > 3 || r.shape.some(row => row.length > 3)) { skip('Form > 3x3', r); continue; }
    r.shape.forEach((row, y) => row.forEach((k, x) => { cells[y][x] = k || null; }));
  }
  const filled = cells.flat().filter(Boolean);
  if (filled.length < 1) { skip('keine Zutat', r); continue; }
  if (r.ambiguous && r.ambiguous.some(a => /Färbe/.test(a)) && r.family === 'Farbstoff') { skip('Faerbe-Rezept', r); continue; }
  const sig = sigOf(cells, shapeless);
  if (existing.has(sig)) { skip('gleiche Anzeige wie bestehendes Rezept (' + existing.get(sig) + ')', r); continue; }
  if (seenSig.has(sig)) { skip('gleiche Anzeige wie ' + seenSig.get(sig), r); continue; }
  const d = r.name_de, e = r.name_en;
  if (!d || seenAns.has(norm(d)) || existingAnswers.has(norm(d))) { skip('Antwortname doppelt', r); continue; }
  // Loesung fuer den Bau-Modus
  let solution;
  const buildable = r.buildable === true && !(r.ambiguous || []).some(a => /Färbe/.test(a));
  if (buildable) {
    const expand = /^stone_(hoe|shovel|axe|pickaxe|sword)$/.test(r.result);
    const list = k => (expand && STONE_TOOL.includes(k) ? STONE_TOOL.slice() : [k]);
    solution = shapeless ? { shapeless: true, items: filled.map(k => list(k)) } : { shapeless: false, grid: cells.map(row => row.map(k => (k ? list(k) : null))) };
    if (!CraftCheck.matches({ solution }, cells)) { skip('Loesung passt nicht zum Raster', r); continue; }
  }
  const fam = r.family || 'sonstige';
  if ((famCount[fam] || 0) >= FAM_CAP(fam)) { skip('Familien-Obergrenze ' + fam, r); continue; }
  famCount[fam] = (famCount[fam] || 0) + 1;
  let t = r.tier >= 3 ? 3 : r.tier === 2 ? 2 : 1;
  if (/(deepslate|tuff|hyphae|stem|crimson|warped|pale_oak|mud_brick|resin|cut_copper|blackstone|prismarine|purpur|mangrove|cherry|bamboo|copper)/.test(r.result) && t < 2) t = 2;      // Obskures nie Tier 1
  const sl = filled.length; if (sl >= 7 && t < 3) t++; if (sl <= 1) t = 1;                  // Rating auch nach Zutaten-Anzahl (nicht nur nach Familie)
  const h = hash(r.result) % 8;
  const rating = t === 1 ? 700 + h * 50 : t === 2 ? 1300 + h * 100 : 2300 + h * 100;
  const q = {
    id: 0, type: 'crafting', question: shapeless ? 'Was entsteht hier? (formloses Rezept)' : 'Was entsteht hier?',
    answer: d, acceptedAnswers: [...new Set([d, ...(e && norm(e) !== norm(d) ? [e] : [])])],
    category: 'Crafting', grid: cells, shapeless, resultCount: r.count || 1, resultKey: r.result,
    ...(solution ? { solution, buildable: true } : {}),
    funFact: `${fam === 'sonstige' ? `${d} entsteht im Handwerksraster aus ${filled.length} Zutat${filled.length === 1 ? '' : 'en'}.` : FAM_FACT[fam]} Ein Rezept liefert ${r.count || 1} ${d}.`, source: r.family || 'Crafting-Rezept', gen: 'crafting2', rating, tier: t === 3 ? 3 : t,
  };
  if (!MGAnswer.check(q, q.answer).correct) { skip('Antwort nicht erkannt', r); continue; }
  seenSig.set(sig, r.result); seenAns.add(norm(d));
  out.push(q);
}
out.forEach(q => { if (!ids[q.resultKey]) ids[q.resultKey] = next++; q.id = ids[q.resultKey]; });
out.sort((a, b) => a.id - b.id);
const nb = out.filter(q => q.buildable).length, tiers = {};
out.forEach(q => { tiers[q.tier] = (tiers[q.tier] || 0) + 1; });
console.log('Neue Crafting-Raetsel:', out.length, '(baubar ' + nb + '), Tiers', JSON.stringify(tiers));
Object.entries(skipped).forEach(([k, v]) => console.log('  uebersprungen -', k + ':', v.length, v.slice(0, 6).join(',')));
if (out.length < 450) console.log('HINWEIS: unter 450 (Quelle enthaelt ' + src.recipes.length + ' Rezepte)');
if (dry) process.exit(0);
fs.writeFileSync(idsPath, JSON.stringify(ids, null, 1));
fs.writeFileSync(qPath, JSON.stringify(base.concat(out), null, 2));
console.log('questions.json:', base.length + out.length, 'Fragen');
