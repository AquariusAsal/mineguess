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

const scored = q.map((x, i) => ({ i, r: raw(x) + (i % 7) * 0.01 })).filter(e => q[e.i].type !== 'crafting');   // winziger Tie-Breaker
scored.sort((a, b) => a.r - b.r);
scored.forEach((e, rank) => {
  const pct = scored.length > 1 ? rank / (scored.length - 1) : 0.5;
  const rating = Math.round((600 + 3300 * pct) / 50) * 50;
  q[e.i].rating = rating;
  q[e.i].tier = rating < 1200 ? 1 : rating < 2200 ? 2 : rating < 3200 ? 3 : 4;
});

// Crafting-Raetsel: eigene Heuristik, danach Quantil-Abbildung auf die Ziel-Verteilung (T1 25 %, T2 35 %, T3 25 %, T4 15 %)
// Score = verschiedene Zutaten + belegte Felder + Form (formlos leichter) + Bekanntheit des Ergebnisses (EASY/HARD-Listen, optional
// 'bekannt' aus docs/team/crafting-auswahl.json) + Ablenker-Dichte (viele aehnliche Rezepte mit gleichem Namensanfang = etwas schwerer)
const EASY = /^(Fackel|Werkbank|Truhe|Stock|Ofen|Leiter|Eimer|Schere|Bogen|Pfeil|Brot|Kuchen|Buch|Bücherregal|TNT|Redstone-Fackel|Papier|Schnee|Ton|Leder|Melone|Angel|Kompass|Uhr|Lagerfeuer|Fass|Schiene|Lore|Amboss|Zaubertisch|Eichenholz(boot|tür)|Bambusfloss|Bambusfloß|Weiße[rs]? (Wolle|Bett|Kerze)|Diamant(block|spitzhacke|schwert)|Eisen(block|schaufel)|Gold(block|barren)|Smaragdblock|Lapislazuliblock|Kohleblock|Redstone-Block|Netheritblock|Goldener Apfel|Schüssel|Keks|Ziegelsteine|Sandstein|Leine|Rahmen|Blumentopf|Kessel|Glasflasche|Gemälde|Kerze|Schnee)$/;
const MID = /^(Antriebsschiene|Aktivierungsschiene|Sensorschiene|Trichter|Spender|Werfer|Schild|Schmelzofen|Räucherofen|Braustand|Kartentisch|Bognertisch|Schmiedetisch|Webstuhl|Schleifstein|Steinsäge|Laterne|Armbrust|Bienenstock|Plattenspieler|Kolben|Redstone-Lampe|Leuchtstein|Eisengitter|Netheritbarren|Enderauge|Diamant(harnisch|helm)|Eisen(stiefel|beinschutz))$/;
const HARD = /^(Beobachter|Redstone-Komparator|Redstone-Verstärker|Leuchtfeuer|Klebriger Kolben|Tageslichtsensor|Blitzableiter|Leitstein|Seelenanker|Kalibrierter Sculk-Sensor|Werker|Aquisator|Streitkolben|Fernrohr|Spektralpfeil|Bergungskompass|Kupferleuchte|Zielblock|Kupferrost|Wirrpilzrute|Karottenrute|Endstab|Enderkristall|Feuerkugel|Fermentiertes Spinnenauge|Glitzernde Melonenscheibe|Getöntes Glas|Gerüst|Lesepult|Haken|Wolfspanzer|Lederner Rossharnisch|Purpursäule|Seelenlaterne|Seelenlagerfeuer|Seelenfackel|Endersteinziegel|Endsteinziegel|Tiefenschieferfliesen|Tiefenschieferziegel|Tuffsteinziegel|Leere Karte|Magmacreme|Honigflasche|Blaueis|Packeis|Fester Schlamm)$/;
let known = new Set();
try { const sel = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'docs', 'team', 'crafting-auswahl.json'), 'utf8'));
  (Array.isArray(sel) ? [] : (sel.bekannt || [])).forEach(n => known.add(String(n))); } catch (e) {}
const cr = q.map((x, i) => ({ i, x })).filter(e => e.x.type === 'crafting').map(e => {
  const cells = e.x.grid.flat().filter(Boolean), kinds = new Set(cells).size;
  let sc = kinds * 1.0 + cells.length * 0.3 + (e.x.shapeless ? -0.4 : 0) + (e.x.resultCount > 1 ? -0.2 : 0);
  if (EASY.test(e.x.answer) || known.has(e.x.answer)) sc -= 3;
  else if (MID.test(e.x.answer)) sc -= 0.6;
  else if (HARD.test(e.x.answer)) sc += 2.2;
  return { i: e.i, sc: sc + (e.i % 7) * 0.001 };
}).sort((a, b) => a.sc - b.sc);
const BANDS = [[0.25, 600, 1150], [0.60, 1200, 2150], [0.85, 2200, 3150], [1.0, 3200, 3500]];
cr.forEach((e, rank) => {
  const p = (rank + 0.5) / cr.length;
  let lo = 0, band = BANDS.find(b => p <= b[0]);
  for (const b of BANDS) { if (b === band) break; lo = b[0]; }
  const rating = Math.round((band[1] + (band[2] - band[1]) * ((p - lo) / (band[0] - lo))) / 50) * 50;
  q[e.i].rating = rating;
  q[e.i].tier = rating < 1200 ? 1 : rating < 2200 ? 2 : rating < 3200 ? 3 : 4;
});
fs.writeFileSync(P, JSON.stringify(q, null, 2));
const t = [0, 0, 0, 0, 0];
q.forEach(x => t[x.tier]++);
console.log('rated', q.length, 'tiers', t.slice(1).join('/'));
