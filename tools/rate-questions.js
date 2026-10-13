/**
 * Vergibt Frage-Ratings (Feld `rating` 400..3900, `tier` 1..4) in questions.json.
 * Heuristik (Roh-Punkte), danach Perzentil-Kalibrierung auf die Skala 600..3900:
 *  number: Basis 1100; Größenordnung der Antwort (<=5: -200, <=20: 0, <=100: +300, <=1000: +700, >1000: +1100);
 *          Dezimalzahl +400; große relative Toleranz (>=10 %: -300, >=3 %: -100);
 *          schwer merkbare Zahlen (Haltbarkeit, Sprengwiderstand, XP, Y-Level) +300.
 *  entity: Basis 900; Antwort > 15 Zeichen +200; Zutatenliste/Rezept (Ziffern oder "+") +500;
 *          Biom/Struktur-Phrase +300.
 *  Kategorie: Hardcore-Wissen +400, Redstone +200, Verzauberungen +100, Geschichte & Updates +100,
 *             Essen & Nahrung -100.
 * Danach: Rating = 600 + 3300 * Perzentil (gleichmäßig verteilt), gerundet auf 50.
 * Tier: <1200 = 1 (leicht), <2200 = 2, <3200 = 3, sonst 4 (sehr schwer).
 * Aufruf: node tools/rate-questions.js   (idempotent, überschreibt rating/tier)
 */
const fs = require('fs');
const path = require('path');
const P = path.join(__dirname, '..', 'questions.json');
const q = JSON.parse(fs.readFileSync(P, 'utf8'));

const CAT = { 'Hardcore-Wissen': 400, Redstone: 200, 'Verzauberungen': 100, 'Geschichte & Updates': 100, 'Essen & Nahrung': -100 };

function raw(x) {
  let s = CAT[x.category] || 0;
  if (x.type === 'number') {
    s += 1100;
    const a = Math.abs(x.answer);
    s += a <= 5 ? -200 : a <= 20 ? 0 : a <= 100 ? 300 : a <= 1000 ? 700 : 1100;
    if (!Number.isInteger(x.answer)) s += 400;
    const tolAbs = Math.max(x.tolerance || 0, x.tolerancePct ? a * x.tolerancePct / 100 : 0, x.toleranceMin || 0);
    const rel = a ? tolAbs / a : 0;
    s += rel >= 0.1 ? -300 : rel >= 0.03 ? -100 : 0;
    if (/Haltbarkeit|Sprengwiderstand|Erfahrungspunkte|XP|Y-Level/i.test(x.question + ' ' + (x.unit || ''))) s += 300;
  } else {
    s += 900;
    const ans = String(x.answer);
    if (ans.length > 15) s += 200;
    if (/\d|\+/.test(ans)) s += 500;
    if (x.category === 'Biome' || x.category === 'Strukturen') s += 300;
  }
  return s;
}

const scored = q.map((x, i) => ({ i, r: raw(x) + (i % 7) * 0.01 }));   // winziger Tie-Breaker
scored.sort((a, b) => a.r - b.r);
scored.forEach((e, rank) => {
  const pct = scored.length > 1 ? rank / (scored.length - 1) : 0.5;
  const rating = Math.round((600 + 3300 * pct) / 50) * 50;
  q[e.i].rating = rating;
  q[e.i].tier = rating < 1200 ? 1 : rating < 2200 ? 2 : rating < 3200 ? 3 : 4;
});
fs.writeFileSync(P, JSON.stringify(q, null, 2));
const t = [0, 0, 0, 0, 0];
q.forEach(x => t[x.tier]++);
console.log('rated', q.length, 'tiers', t.slice(1).join('/'));
