/**
 * Erzeugt die "Wahr oder Mythos?"-Fragen (Format tf) und schreibt sie in questions.json:   node tools/gen-tf.js [--dry]
 *
 * Daten: tools/tf-data1..4.js, Zeilen [Kategorie, wahr(1)/Mythos(0), Aussage, Erklaerung, Wiki-Seite, Stufe 1-4].
 * Eine tf-Frage ist technisch eine ODER-Frage mit zwei Optionen (type 'entity', choices ['Wahr','Mythos'], fmt 'tf'),
 * damit Ranked (serverseitig geprueft), Challenge, Multiplayer/Teams, Daily und Hardcore ohne Sonderweg funktionieren.
 *
 * Pruefungen: gueltige Kategorie/Stufe, Textlaengen, keine doppelten Aussagen, keine Beinahe-Dubletten zu bestehenden Fragen,
 * Balance wahr/Mythos (Wahr-Aussagen werden je Kategorie auf die Zahl der Mythen begrenzt, Auswahl deterministisch),
 * mindestens 250 Aussagen. IDs sind stabil (tools/tf-ids.json: Aussage -> id, ab 3001).
 */
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const dry = process.argv.includes('--dry');
const CATS = new Set(['Mobs', 'Blöcke', 'Items', 'Redstone', 'Verzauberungen', 'Tränke', 'Dorfbewohner', 'Biome', 'Gameplay', 'Spielmechanik', 'Erze & Ressourcen', 'Geschichte & Updates', 'Strukturen', 'Essen & Nahrung', 'Dimensionen', 'Hardcore-Wissen']);
const rows = [].concat(...[1, 2, 3, 4].map(n => require('./tf-data' + n + '.js')));
const hash = (s) => { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; } return h; };
const words = (s) => new Set(String(s).toLowerCase().replace(/[^a-zäöüß0-9 ]/g, ' ').split(/\s+/).filter(w => w.length > 3));
const jac = (a, b) => { let i = 0; a.forEach(w => { if (b.has(w)) i++; }); return i / (a.size + b.size - i || 1); };

const all = JSON.parse(fs.readFileSync(path.join(root, 'questions.json'), 'utf8'));
const base = all.filter(q => q.fmt !== 'tf');
const errs = [], seen = new Set();
rows.forEach((r, i) => {
  const [cat, truth, text, expl, src, lvl] = r, w = '#' + i + ' ' + String(text).slice(0, 40);
  if (!CATS.has(cat)) errs.push(w + ': Kategorie ' + cat);
  if (![0, 1].includes(truth)) errs.push(w + ': wahr/Mythos fehlt');
  if (!(lvl >= 1 && lvl <= 4)) errs.push(w + ': Stufe');
  if (typeof text !== 'string' || text.length < 20 || text.length > 170) errs.push(w + ': Aussage-Laenge');
  if (typeof expl !== 'string' || expl.length < 22 || expl.length > 260) errs.push(w + ': Erklaerungs-Laenge');
  if (!src || typeof src !== 'string') errs.push(w + ': Beleg (Wiki-Seite) fehlt');
  if (seen.has(text)) errs.push(w + ': doppelte Aussage'); seen.add(text);
});
// Beinahe-Dubletten untereinander und zu bestehenden Fragen
const ws = rows.map(r => words(r[2]));
for (let i = 0; i < rows.length; i++) {
  for (let j = i + 1; j < rows.length; j++) if (jac(ws[i], ws[j]) > 0.8) errs.push('Beinahe-Dublette: "' + rows[i][2].slice(0, 50) + '" ~ "' + rows[j][2].slice(0, 50) + '"');
  for (const q of base) if (q.question && jac(ws[i], words(q.question)) > 0.8) errs.push('Dublette zu Frage ' + q.id + ': ' + rows[i][2].slice(0, 50));
}
if (errs.length) { console.error('FEHLER:\n' + errs.join('\n')); process.exit(1); }

// Balance: Wahr-Aussagen je Kategorie auf (Mythen + 1) begrenzen, danach insgesamt auf Mythen + 4
const mythCount = {}; rows.forEach(r => { if (!r[1]) mythCount[r[0]] = (mythCount[r[0]] || 0) + 1; });
const sel = [];
CATS.forEach(c => {
  const m = rows.filter(r => r[0] === c && !r[1]), t = rows.filter(r => r[0] === c && r[1] && r[6] !== 'pin').sort((a, b) => hash(a[2]) - hash(b[2]));
  sel.push(...m, ...rows.filter(r => r[0] === c && r[1] && r[6] === 'pin'), ...t.slice(0, Math.min(t.length, (mythCount[c] || 0) + 1)));      // 'pin' (7. Feld): immer aufnehmen
});
const myths = sel.filter(r => !r[1]).length;
let trues = sel.filter(r => r[1]);
if (trues.length > myths + 4) {
  const drop = new Set(trues.filter(r => r[6] !== 'pin').sort((a, b) => hash(b[2]) - hash(a[2])).slice(0, trues.length - (myths + 4)));
  for (let i = sel.length - 1; i >= 0; i--) if (drop.has(sel[i])) sel.splice(i, 1);
}
sel.sort((a, b) => hash(a[2]) - hash(b[2]));

const idsPath = path.join(__dirname, 'tf-ids.json');
const ids = fs.existsSync(idsPath) ? JSON.parse(fs.readFileSync(idsPath, 'utf8')) : {};
let next = Math.max(3000, ...Object.values(ids)) + 1;
const slug = (c) => c.toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
const tiers = (r) => r < 1200 ? 1 : r < 2200 ? 2 : r < 3200 ? 3 : 4;
const out = sel.map(r => {
  const [cat, truth, text, expl, src, lvl] = r;
  if (!ids[text]) ids[text] = next++;
  const h = hash(text) % 8, rating = lvl === 1 ? 700 + h * 50 : lvl === 2 ? 1300 + h * 100 : lvl === 3 ? 2300 + h * 100 : 3300 + (h % 6) * 100;
  return { id: ids[text], type: 'entity', fmt: 'tf', question: text, answer: truth ? 'Wahr' : 'Mythos', acceptedAnswers: [truth ? 'Wahr' : 'Mythos'], choices: ['Wahr', 'Mythos'],
    category: cat, funFact: (truth ? 'Stimmt: ' : 'Mythos: ') + expl, source: src, gen: 'tf_' + slug(cat), rating, tier: tiers(rating) };
}).sort((a, b) => a.id - b.id);

const nT = out.filter(q => q.answer === 'Wahr').length;
if (out.length < 250) { console.error('Zu wenige Aussagen: ' + out.length + ' (mindestens 250)'); process.exit(1); }
if (Math.abs(nT - out.length / 2) > out.length * 0.06) { console.error('Unausgewogen: wahr ' + nT + ' / Mythos ' + (out.length - nT)); process.exit(1); }
const byTier = {}; out.forEach(q => byTier[q.tier] = (byTier[q.tier] || 0) + 1);
console.log('tf-Fragen:', out.length, '(wahr ' + nT + ', Mythos ' + (out.length - nT) + '), Tiers', JSON.stringify(byTier), ', Kategorien', new Set(out.map(q => q.category)).size);
if (dry) process.exit(0);
fs.writeFileSync(idsPath, JSON.stringify(ids, null, 1));
fs.writeFileSync(path.join(root, 'questions.json'), JSON.stringify(base.concat(out), null, 2));
console.log('questions.json:', base.length + out.length, 'Fragen geschrieben');
