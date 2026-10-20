/** Prueft Crafting-Raetsel: loesbar, eindeutig, Icons vorhanden. Aufruf: node tools/check-crafting.js */
const fs = require('fs');
const path = require('path');
const R = f => JSON.parse(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'));
const MGAnswer = require('../answer-check.js');
const qs = R('questions.json').filter(q => q.type === 'crafting');
const icons = R('assets/mc/icons.json');
const ing = R('assets/mc/ingredient-icons.json');
const answers = R('assets/mc/answers.json');
let err = 0;
const bad = m => { err++; console.log('FEHLER', m); };
const sigs = new Map();
for (const q of qs) {
  if (!MGAnswer.check(q, q.answer).correct) bad('unloesbar ' + q.id + ' ' + q.answer);
  (q.acceptedAnswers || []).forEach(a => { if (!MGAnswer.check(q, a).correct) bad('Alias nicht akzeptiert ' + q.id + ' ' + a); });
  if (!Array.isArray(q.grid) || q.grid.length !== 3 || q.grid.some(r => r.length !== 3)) bad('Raster ' + q.id);
  const cells = q.grid.flat().filter(Boolean);
  if (cells.length < 2) bad('zu wenig Zutaten ' + q.id);
  const sig = (q.shapeless ? 'S' + [...cells].sort().join(',') : 'G' + JSON.stringify(q.grid));
  if (sigs.has(sig) && sigs.get(sig) !== q.answer) bad('gleiches Raster, anderes Ergebnis: ' + q.answer + ' / ' + sigs.get(sig));
  sigs.set(sig, q.answer);
  if (!(q.answer in icons)) bad('Ergebnis-Icon fehlt ' + q.answer);
  for (const k of new Set(cells)) if (!ing[k] || !ing[k].icon) bad('Zutaten-Icon fehlt ' + k + ' (' + q.answer + ')');
}
console.log(`Crafting-Fragen: ${qs.length}, Fehler: ${err}`);
process.exit(err ? 1 : 0);
