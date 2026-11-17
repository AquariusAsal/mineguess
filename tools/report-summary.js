/**
 * Fasst data/reports.json zusammen: Meldungen je Frage, Gruende, Text.
 *   node tools/report-summary.js [Datei]            Uebersicht
 *   node tools/report-summary.js --purge <id> [Datei]   alle Meldungen zu dieser Frage nach Pruefung loeschen
 *   node tools/report-summary.js --older <Tage> [Datei]  Meldungen aelter als N Tage loeschen (Server loescht >12 Monate automatisch)
 * Hinweis: Den Server vorher stoppen (oder danach neu starten), sonst ueberschreibt sein Speicherstand die Datei.
 */
const fs = require('fs');
const path = require('path');
const args = process.argv.slice(2);
const flag = (n) => { const i = args.indexOf(n); return i >= 0 ? args.splice(i, 2)[1] : null; };
const purgeId = flag('--purge'), olderDays = flag('--older');
const file = args[0] || path.join(process.env.DATA_DIR || path.join(__dirname, '..', 'data'), 'reports.json');
let reports = [];
try { reports = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { console.log('Keine Meldungen (' + file + ')'); process.exit(0); }
if (purgeId !== null || olderDays !== null) {
  const keep = reports.filter(r => !(purgeId !== null && String(r.questionId) === String(purgeId)) && !(olderDays !== null && Date.now() - (r.ts || 0) > Number(olderDays) * 86400000));
  fs.writeFileSync(file, JSON.stringify(keep));
  console.log(`${reports.length - keep.length} Meldungen geloescht, ${keep.length} verbleiben`);
  process.exit(0);
}
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
