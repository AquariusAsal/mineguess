// Erzeugt facts.json (366 kurze Funfacts fuer "Fakt des Tages" auf der Startseite) aus questions.json. Aufruf: node tools/gen-facts.js
const fs = require('fs'), path = require('path');
const q = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'questions.json'), 'utf8'));
const seen = new Set(), pool = [];
q.forEach(x => {
  const f = String(x.funFact || '').replace(/\s+/g, ' ').trim();
  if (f.length < 45 || f.length > 170 || /https?:|\[|\]|→/.test(f) || /\?$/.test(f) || seen.has(f)) return;
  seen.add(f); pool.push(f);
});
// feste Mischung (deterministisch), damit sich die Datei bei gleichem Datenstand nicht aendert
let s = 12345; const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
const out = pool.slice(0, 366);
fs.writeFileSync(path.join(__dirname, '..', 'facts.json'), JSON.stringify(out) + '\n');
console.log('facts.json:', out.length, 'Fakten aus', pool.length, 'moeglichen');
