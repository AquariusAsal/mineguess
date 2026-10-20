/** Fasst data/reports.json zusammen: Meldungen je Frage, Gruende, Text. Aufruf: node tools/report-summary.js [Datei] */
const fs = require('fs');
const path = require('path');
const file = process.argv[2] || path.join(__dirname, '..', 'data', 'reports.json');
let reports = [];
try { reports = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { console.log('Keine Meldungen (' + file + ')'); process.exit(0); }
const qs = new Map(JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'questions.json'), 'utf8')).map(q => [q.id, q]));
const by = new Map();
for (const r of reports) {
  const e = by.get(r.questionId) || { n: 0, reasons: {}, texts: [] };
  e.n++; e.reasons[r.reason] = (e.reasons[r.reason] || 0) + 1;
  if (r.text) e.texts.push(r.text);
  by.set(r.questionId, e);
}
const rows = [...by.entries()].sort((a, b) => b[1].n - a[1].n);
console.log(`${reports.length} Meldungen zu ${rows.length} Fragen\n`);
for (const [id, e] of rows) {
  const q = qs.get(id);
  console.log(`#${id} (${e.n}x) ${q ? q.question.slice(0, 80) + ' -> ' + q.answer : '(Frage nicht mehr vorhanden)'}`);
  console.log('   Gruende: ' + Object.entries(e.reasons).map(([k, v]) => k + ' ' + v).join(', '));
  e.texts.slice(0, 3).forEach(t => console.log('   "' + t.replace(/\s+/g, ' ') + '"'));
}
