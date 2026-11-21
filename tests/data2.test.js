const test = require('node:test');
const assert = require('node:assert');
const qs = require('../questions.json');
const MGAnswer = require('../answer-check.js');
const M = require('../modes.js');

const NEW = qs.filter(q => /^(d2_|w2_|crafting2)/.test(q.gen || ''));
const norm = s => String(s).toLowerCase().replace(/[^a-z0-9äöüß]/g, '');

test('Runde 43: mindestens 5000 Fragen, IDs eindeutig, keine doppelten Fragetexte, neue ID-Bereiche', () => {
  assert.ok(qs.length >= 5000, 'Anzahl ' + qs.length);
  assert.strictEqual(new Set(qs.map(q => q.id)).size, qs.length);
  const texts = new Map(); qs.forEach(q => { const k = norm(q.question) + '|' + (q.type === 'crafting' ? q.resultKey : ''); assert.ok(!texts.has(k), 'doppelt: ' + q.question); texts.set(k, 1); });
  NEW.forEach(q => assert.ok((q.gen === 'crafting2' ? q.id >= 4001 && q.id < 5000 : q.gen.startsWith('d2_') ? q.id > 10000 && q.id < 20000 : q.id > 20000 && q.id < 30000), q.gen + ' ' + q.id));
});

test('Runde 43: neue Fragen sind gueltig (Antwort erkennbar, Auswahl enthaelt die Loesung, Rating/Tier passen, Beleg vorhanden)', () => {
  const bands = { 1: [600, 1150], 2: [1200, 2150], 3: [2200, 3150], 4: [3200, 3900] };
  for (const q of NEW) {
    assert.ok(q.category && q.funFact && q.source !== '' && q.question.length > 10, q.id);
    assert.ok(q.rating >= bands[q.tier][0] && q.rating <= bands[q.tier][1], 'Tier/Rating ' + q.id + ' ' + q.tier + '/' + q.rating);
    if (q.type === 'number') { assert.ok(typeof q.answer === 'number' && isFinite(q.answer)); assert.ok(MGAnswer.check(q, String(q.answer)).correct, 'Zahl ' + q.id); }
    else if (q.type === 'entity') {
      assert.ok(Array.isArray(q.acceptedAnswers) && q.acceptedAnswers.length); assert.ok(MGAnswer.check(q, q.answer).correct, 'Antwort ' + q.id);
      if (q.choices) { assert.strictEqual(q.choices.length, 2); assert.ok(q.choices.includes(q.answer), 'Auswahl ' + q.id); assert.notStrictEqual(norm(q.choices[0]), norm(q.choices[1])); }
    } else if (q.type === 'crafting') assert.ok(MGAnswer.check(q, q.answer).correct);
  }
});

test('Runde 43: alle Formate bleiben in jedem Modus auffindbar (Matrix) und Verteilung ist ausgewogen', () => {
  const f = {}; qs.forEach(q => { const k = M.formatOf(q); f[k] = (f[k] || 0) + 1; });
  ['number', 'entity', 'choice', 'tf', 'craft-guess'].forEach(k => assert.ok(f[k] >= 200, k + ' ' + f[k]));
  assert.ok(qs.filter(q => q.buildable).length >= 350);
  const tiers = {}; qs.forEach(q => tiers[q.tier] = (tiers[q.tier] || 0) + 1);
  [1, 2, 3, 4].forEach(t => assert.ok(tiers[t] / qs.length > 0.08, 'Tier ' + t + ' zu klein: ' + tiers[t]));
  Object.keys(M.MATRIX).filter(k => !['crafting', 'tf'].includes(k)).forEach(k => ['number', 'entity', 'choice', 'tf'].forEach(fm => assert.ok(M.MATRIX[k].formats.includes(fm), k + ' ohne ' + fm)));
});

test('Runde 43: Crafting2: Loesung passt zum Raster, Anzeige eindeutig (keine zwei Rezepte mit gleicher Form), mind. 150 neue Raetsel (Familien-Obergrenze)', () => {
  const CC = require('../craft-check.js');
  const c2 = qs.filter(q => q.gen === 'crafting2'); assert.ok(c2.length >= 150, 'Anzahl ' + c2.length);
  const sig = new Map();
  qs.filter(q => q.type === 'crafting').forEach(q => {
    const rows = CC.normalize(q.grid), a = JSON.stringify(rows), b = JSON.stringify(rows.map(r => r.slice().reverse()));
    const k = q.shapeless ? 'S' + q.grid.flat().filter(Boolean).sort().join(',') : 'G' + (a < b ? a : b);
    if (sig.has(k)) assert.strictEqual(sig.get(k), q.resultKey, 'gleiche Anzeige: ' + q.resultKey + ' / ' + sig.get(k));
    sig.set(k, q.resultKey);
    if (q.buildable) assert.ok(CC.matches(q, q.grid), 'Loesung passt nicht: ' + q.resultKey);
  });
});
