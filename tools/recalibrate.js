/**
 * Kalibriert Frage-Ratings anhand der anonymen Statistik (data/qstats.json: {id:{n,correct,attempts}}).
 * Lauf nach tools/rate-questions.js (das ueberschreibt rating/tier).  node tools/recalibrate.js [--dry] [Statistikdatei]
 * Ab MIN_N=30 Antworten: beobachtete Schwierigkeit d = 1 - Trefferquote (Versuche fliessen ein), Mischung mit dem Start-Rating,
 * Gewicht w = min(0.7, n / 300). Aenderung hoechstens +-600 Punkte.
 */
const fs = require('fs');
const path = require('path');
const DRY = process.argv.includes('--dry');
const arg = process.argv.slice(2).find(a => !a.startsWith('--'));
const sFile = arg || path.join(__dirname, '..', 'data', 'qstats.json');
const qFile = path.join(__dirname, '..', 'questions.json');
let stats;
try { stats = JSON.parse(fs.readFileSync(sFile, 'utf8')); } catch (e) { console.log('Keine Statistik (' + sFile + ')'); process.exit(0); }
const qs = JSON.parse(fs.readFileSync(qFile, 'utf8'));
const MIN_N = 30;
let changed = 0, tierChanges = 0;
for (const q of qs) {
  const s = stats[q.id];
  if (!s || s.n < MIN_N || typeof q.rating !== 'number') continue;
  const hit = s.correct / s.n, avgAtt = s.attempts / s.n;
  const d = Math.min(1, Math.max(0, (1 - hit) * 0.8 + Math.min(1, (avgAtt - 1) / 2) * 0.2));
  const observed = 400 + 3500 * d;
  const w = Math.min(0.7, s.n / 300);
  let target = q.rating * (1 - w) + observed * w;
  target = Math.max(q.rating - 600, Math.min(q.rating + 600, target));
  const rating = Math.round(target / 50) * 50;
  if (rating === q.rating) continue;
  const tier = rating < 1200 ? 1 : rating < 2200 ? 2 : rating < 3200 ? 3 : 4;
  if (tier !== q.tier) tierChanges++;
  console.log(`#${q.id} ${q.rating} -> ${rating} (n=${s.n}, Treffer ${(hit * 100).toFixed(0)} %)`);
  q.rating = rating; q.tier = tier; changed++;
}
console.log(`${changed} Fragen angepasst, ${tierChanges} Tier-Wechsel`);
if (!DRY && changed) fs.writeFileSync(qFile, JSON.stringify(qs, null, 2));
