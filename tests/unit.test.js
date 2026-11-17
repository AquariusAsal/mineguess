const test = require('node:test');
const assert = require('node:assert');
const MGAnswer = require('../answer-check.js');
const MGRanked = require('../ranked.js');

test('answer-check: Zahlen mit Toleranz', () => {
  const q = { type: 'number', answer: 100, tolerance: 5 };
  assert.strictEqual(MGAnswer.check(q, '100').correct, true);
  assert.strictEqual(MGAnswer.check(q, '104').correct, true);
  assert.strictEqual(MGAnswer.check(q, '120').correct, false);
  assert.strictEqual(MGAnswer.check(q, '120').dir, 'high');
  assert.strictEqual(MGAnswer.check(q, '60').dir, 'low');
});
test('answer-check: ungueltige Eingaben', () => {
  assert.strictEqual(MGAnswer.check({ type: 'number', answer: 3 }, 'abc').valid, false);
  assert.strictEqual(MGAnswer.check({ type: 'number', answer: 3 }, '').valid, false);
  assert.strictEqual(MGAnswer.check({ type: 'entity', answer: 'Creeper', acceptedAnswers: ['Creeper'] }, '   ').valid, false);
});
test('answer-check: Texte normalisiert (Umlaute, Gross/Klein, Alias)', () => {
  const q = { type: 'entity', answer: 'Lohenrute', acceptedAnswers: ['Lohenrute', 'Blaze Rod'] };
  assert.strictEqual(MGAnswer.check(q, 'lohenrute').correct, true);
  assert.strictEqual(MGAnswer.check(q, ' Blaze  Rod ').correct, true);
  assert.strictEqual(MGAnswer.check(q, 'Creeper').correct, false);
  assert.strictEqual(MGAnswer.normText('Äpfel'), MGAnswer.normText('aepfel'));
});

test('ranked: Raenge und Grenzfaelle', () => {
  assert.strictEqual(MGRanked.rankInfo(-50).mmr, 0);
  assert.strictEqual(MGRanked.rankInfo(NaN).mmr, 0);
  assert.ok(MGRanked.rankInfo(99999).idx >= MGRanked.rankInfo(4000).idx);
  assert.strictEqual(MGRanked.rankInfo(1000).rankId, 'iron');
});
test('ranked: MMR bleibt in Grenzen, richtige Antwort steigt, falsche faellt', () => {
  const p0 = MGRanked.newProfile();
  const up = MGRanked.applyAnswer(p0, 2000, 1, { speedFrac: 1, streak: 3 });
  const down = MGRanked.applyAnswer(p0, 600, 0, {});
  assert.ok(up.delta > 0 && down.delta < 0);
  let p = Object.assign({}, p0, { mmr: 0, peak: 0 });
  p = MGRanked.applyAnswer(p, 3500, 0, {}).profile;
  assert.strictEqual(p.mmr, 0);
  const hi = MGRanked.applyAnswer({ mmr: 19999, peak: 19999 }, 100, 1, {}).profile;
  assert.ok(hi.mmr <= 20000);
});
test('ranked: Verlauf hoechstens 30 Eintraege, ungueltige werden verworfen', () => {
  let p = MGRanked.newProfile();
  for (let i = 0; i < 40; i++) p = MGRanked.recordRun(p, { delta: i, correct: 5, total: 10 });
  assert.strictEqual(p.history.length, 30);
  assert.strictEqual(MGRanked.normalizeHistory([null, { x: 1 }, 'a']).length, 0);
});
test('ranked: pickIndex zieht ohne Wiederholung', () => {
  const qs = require('../questions.json');
  const used = new Set(), picked = [];
  for (let i = 0; i < 10; i++) { const ix = MGRanked.pickIndex(qs, 1500, used, Math.random, { picked }); assert.ok(!used.has(ix)); used.add(ix); picked.push(qs[ix]); }
});
