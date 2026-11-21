const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const C = require('../challenge.js');
const R = require('../ranked.js');
const qs = require('../questions.json');

test('Challenge: gleicher Seed = dieselben 10 Fragen (reproduzierbar, unabhaengig von Reihenfolge, Gross/Klein)', () => {
  const a = C.select(qs, '1-abcd1234'), b = C.select(qs.slice().reverse(), '1-abcd1234'), c = C.select(JSON.parse(JSON.stringify(qs)), 'ABCD1234');
  assert.ok(a.ok); assert.strictEqual(a.ids.length, 10); assert.strictEqual(new Set(a.ids).size, 10);
  assert.deepStrictEqual(b.ids, a.ids);
  assert.deepStrictEqual(c.ids, C.select(qs, '3-abcd1234').ids, 'ohne Versionsvorsatz = neueste Version (3)');
  assert.notStrictEqual(C.select(qs, '1-abcd1235').ids.join(), a.ids.join());
});

test('Challenge: feste Referenz (stabil ueber Neustarts und Node-Versionen)', () => {
  assert.deepStrictEqual(C.select(qs, '1-abcd1234').ids, [1721, 731, 911, 1102, 1194, 1358, 1311, 1462, 11, 1323]);
});

test('Challenge: neue Fragen und Neubewertung aendern bestehende Links nicht (Pool-Version + Schnappschuss)', () => {
  const extra = qs.concat([{ id: 5000, type: 'number', question: 'x', answer: 1, category: 'Neu', tier: 1, rating: 700 }, { id: 5001, type: 'number', question: 'y', answer: 2, category: 'Neu', tier: 2, rating: 1500 }]);
  assert.deepStrictEqual(C.select(extra, '1-abcd1234').ids, C.select(qs, '1-abcd1234').ids);
  const regraded = qs.map(q => Object.assign({}, q, { tier: (q.tier % 4) + 1, rating: 1000 }));
  assert.deepStrictEqual(C.select(regraded, '1-abcd1234').ids, C.select(qs, '1-abcd1234').ids);
  const snap = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'challenge-pool.json'), 'utf8'));
  assert.ok(Object.keys(snap.versions['1']).length >= 1700);
});

test('Challenge: Aufbau (Tier-Verlauf, keine Wiederholung, Vorlage nie direkt doppelt, max. 2 Crafting)', () => {
  const rndSeeds = (i) => C.newSeed(() => ((i * 7919) % 1000) / 1000 + (i % 7) / 7000);
  for (let i = 0; i < 300; i++) {
    const seed = rndSeeds(i), s = C.select(qs, seed); assert.ok(s.ok, seed);
    assert.strictEqual(new Set(s.ids).size, 10);
    const tiers = s.questions.map(q => q.tier);
    assert.ok(tiers[0] <= 2 && tiers[9] >= 3, 'Tier-Verlauf ' + tiers);
    for (let k = 1; k < 10; k++) assert.notStrictEqual(R.templateKey(s.questions[k]), R.templateKey(s.questions[k - 1]), 'Vorlage doppelt ' + seed);
    assert.ok(s.questions.filter(q => q.type === 'crafting').length <= 2);
  }
});

test('Challenge: Seed-Validierung (streng)', () => {
  assert.strictEqual(C.parse('1-k3x9a2bq').ok, true);
  assert.strictEqual(C.parse('k3x9a2bq').seed, '3-k3x9a2bq'); assert.strictEqual(C.parse('3-k3x9a2bq').ok, true);
  ['', 'abc', 'a b c d e f', '../../etc', '9-abcdefgh', '1-abc', '1-abcdefghijklmnop', 'abcd$1234', '1-ABCD_1234', '<script>', 'a'.repeat(30), null, undefined, 12345678, {}].forEach(s => assert.strictEqual(C.parse(s).ok, false, String(s)));
  assert.strictEqual(C.select(qs, '9-abcdefgh').ok, false);
  assert.match(C.newSeed(), /^3-[a-z0-9]{8}$/);
});

test('Challenge: spoilerfreie Zusammenfassung und Teilen-Text', () => {
  const s = C.select(qs, '1-abcd1234');
  const sum = C.summary({ seed: s.seed, results: s.ids.map((id, i) => ({ correct: i !== 2 && i !== 7, attempts: i % 3 + 1, ms: 4000 })), points: 1450, rank: { label: 'Gold II', mmr: 2050 } });
  assert.strictEqual(sum.n, 10); assert.strictEqual(sum.correct, 8); assert.strictEqual(sum.squares, '■■□■■■■□■■');
  assert.strictEqual(sum.bestStreak, 4); assert.strictEqual(sum.seconds, 40);
  const json = JSON.stringify(sum);
  s.questions.forEach(q => { assert.ok(!json.includes(String(q.question)), 'Fragetext im Ergebnis'); assert.ok(!json.includes(String(q.answer)) || String(q.answer).length < 3, 'Antwort im Ergebnis'); });
  assert.deepStrictEqual(Object.keys(sum).sort(), ['attempts', 'bestStreak', 'correct', 'n', 'pattern', 'points', 'rank', 'seconds', 'seed', 'squares', 'v']);
  const text = C.toText(sum, C.shareUrl('https://example.org/game.html?x=1', s.seed));
  assert.match(text, /8\/10/); assert.match(text, /\?c=1-abcd1234/); assert.ok(text.split('\n').length <= 4);
  assert.strictEqual(C.summary({ seed: 'kaputt!', results: 'x', points: 'abc' }).n, 0);
});

test('Challenge: selfTest des Moduls', () => { assert.ok(C.selfTest(qs).includes('Seed')); });

test('Challenge: Version 2 enthaelt Wahr-oder-Mythos-Fragen, Version 1 keine (alte Links bleiben stabil)', () => {
  let tf2 = 0;
  for (let i = 0; i < 60; i++) { const s = C.select(qs, '2-tfcheck' + i); assert.ok(s.ok); tf2 += s.questions.filter(q => q.fmt === 'tf').length; s.questions.forEach(q => assert.ok(q.tier >= 1)); }
  assert.ok(tf2 > 20, 'tf in Version 2: ' + tf2);
  for (let i = 0; i < 60; i++) assert.ok(C.select(qs, '1-tfcheck' + i).questions.every(q => q.fmt !== 'tf'));
});
