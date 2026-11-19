/**
 * Moderations-Werkzeug fuer den Betreiber (nur Skript, keine oeffentliche Oberflaeche): wertet data/reports.json aus.
 *   node tools/report-summary.js [Datei]                       Uebersicht: Kategorien, Modi, haeufig gemeldete Fragen und Spieler, neueste Meldungen
 *   node tools/report-summary.js --top 20                      Anzahl der Rangplaetze (Standard 10)
 *   node tools/report-summary.js --category cheat|bug|name|frage|vorschlag|sonstiges   nur diese Kategorie
 *   node tools/report-summary.js --mode ranked|multiplayer|profile|...                 nur dieser Modus
 *   node tools/report-summary.js --player <name>               nur Meldungen zu diesem (gemeldeten) Namen
 *   node tools/report-summary.js --since <Tage>                nur die letzten N Tage
 *   node tools/report-summary.js --json                        maschinenlesbar
 *   node tools/report-summary.js --purge <frageId>             Meldungen zu dieser Frage nach Pruefung loeschen
 *   node tools/report-summary.js --older <Tage>                Meldungen aelter als N Tage loeschen (der Server loescht nach 12 Monaten selbst)
 * Datenschutz: Es werden keine IP-Adressen gespeichert; Rueckfrage-Adressen werden NICHT angezeigt (nur "vorhanden"). Texte sind auf 120 Zeichen gekuerzt.
 * Hinweis: Zum Loeschen den Server vorher stoppen, sonst ueberschreibt sein Speicherstand die Datei.
 */
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const flag = (n) => { const i = args.indexOf(n); return i >= 0 ? args.splice(i, 2)[1] : null; };
const bool = (n) => { const i = args.indexOf(n); if (i >= 0) { args.splice(i, 1); return true; } return false; };
const json = bool('--json');
const purgeId = flag('--purge'), olderDays = flag('--older'), top = Math.max(1, Number(flag('--top')) || 10);
const fCat = flag('--category'), fMode = flag('--mode'), fPlayer = flag('--player'), since = flag('--since');
const file = args[0] || path.join(process.env.DATA_DIR || path.join(__dirname, '..', 'data'), 'reports.json');

let reports = [];
try { reports = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { console.log('Keine Meldungen (' + file + ')'); process.exit(0); }
if (!Array.isArray(reports)) reports = [];

if (purgeId !== null || olderDays !== null) {
  const keep = reports.filter(r => !(purgeId !== null && String(r.questionId) === String(purgeId)) && !(olderDays !== null && Date.now() - (r.ts || 0) > Number(olderDays) * 86400000));
  fs.writeFileSync(file, JSON.stringify(keep));
  console.log(`${reports.length - keep.length} Meldungen geloescht, ${keep.length} verbleiben`);
  process.exit(0);
}

let qs = new Map();
try { qs = new Map(JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'questions.json'), 'utf8')).map(q => [q.id, q])); } catch (e) {}

const cat = (r) => r.category || 'frage';
let list = reports.filter(r => (!fCat || cat(r) === fCat) && (!fMode || r.mode === fMode) && (!fPlayer || String(r.player || '').toLowerCase() === fPlayer.toLowerCase()) && (!since || Date.now() - (r.ts || 0) <= Number(since) * 86400000));
const weight = (r) => r.count || 1;
const tally = (keyFn) => { const m = new Map(); list.forEach(r => { const k = keyFn(r); if (k == null) return; m.set(k, (m.get(k) || 0) + weight(r)); }); return [...m.entries()].sort((a, b) => b[1] - a[1]); };

const byCategory = tally(cat), byMode = tally(r => r.mode || 'altes Format'), byReason = tally(r => (cat(r) === 'frage' ? r.reason : null));
const byQuestion = tally(r => (r.questionId != null ? r.questionId : null)).slice(0, top);
const byPlayer = tally(r => (r.player ? String(r.player).toLowerCase() : null)).slice(0, top);
const recent = list.slice().sort((a, b) => (b.ts || 0) - (a.ts || 0)).slice(0, top).map(r => ({
  ts: r.ts ? new Date(r.ts).toISOString().slice(0, 16).replace('T', ' ') : '', category: cat(r), mode: r.mode || '', count: weight(r), reason: r.reason || '', questionId: r.questionId == null ? null : r.questionId,
  player: r.player || '', room: r.room || '', text: String(r.text || '').replace(/\s+/g, ' ').slice(0, 120), followUp: r.contact ? 'Rueckfrage-Adresse vorhanden' : '',
}));
const total = list.reduce((n, r) => n + weight(r), 0);

if (json) {
  console.log(JSON.stringify({ total, reports: list.length, byCategory: Object.fromEntries(byCategory), byMode: Object.fromEntries(byMode), byReason: Object.fromEntries(byReason),
    topQuestions: byQuestion.map(([id, n]) => ({ id, n, question: qs.get(id) ? qs.get(id).question : null })), topPlayers: byPlayer.map(([name, n]) => ({ name, n })), recent }, null, 2));
  process.exit(0);
}

const line = (arr) => arr.map(([k, v]) => `${k} ${v}`).join(', ') || '-';
console.log(`${total} Meldungen (${list.length} Eintraege${reports.length !== list.length ? ' von ' + reports.length : ''})`);
console.log('Kategorien: ' + line(byCategory));
console.log('Modi:       ' + line(byMode));
if (byReason.length) console.log('Fragen-Gruende: ' + line(byReason));
if (byQuestion.length) {
  console.log('\nHaeufig gemeldete Fragen:');
  byQuestion.forEach(([id, n]) => { const q = qs.get(id); console.log(`  #${id} (${n}x) ${q ? q.question.slice(0, 80) + ' -> ' + q.answer : '(Frage nicht mehr vorhanden)'}`); });
}
if (byPlayer.length) { console.log('\nHaeufig gemeldete Spieler/Namen (Pseudonyme):'); byPlayer.forEach(([name, n]) => console.log(`  ${name} (${n}x)`)); }
console.log('\nNeueste Meldungen:');
recent.forEach(r => console.log(`  ${r.ts}  ${r.category}${r.reason ? '/' + r.reason : ''}${r.mode ? ' [' + r.mode + ']' : ''}${r.count > 1 ? ' x' + r.count : ''}${r.questionId != null ? ' #' + r.questionId : ''}${r.player ? ' Spieler ' + r.player : ''}${r.room ? ' Raum ' + r.room : ''}${r.text ? ' - "' + r.text + '"' : ''}${r.followUp ? ' (' + r.followUp + ')' : ''}`));
