const test = require('node:test');
const assert = require('node:assert');
const M = require('../modes.js');
const R = require('../ranked.js');
const qs = require('../questions.json');
const H = M.hardcore;
const lcg = (seed) => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };

test('Hardcore: Ziel-Rating steigt mit der Serie, gedeckelt', () => {
  assert.strictEqual(H.targetRating(0), 900);
  assert.ok(H.targetRating(10) > H.targetRating(5));
  assert.strictEqual(H.targetRating(100), 3800);
});

test('Hardcore: Schwierigkeit (Rating/Tier) steigt mit der Serie', () => {
  const rnd = lcg(5);
  const avg = (streak) => { let t = 0; for (let i = 0; i < 300; i++) { const s = H.newState(); s.streak = streak; t += H.next(qs, s, rnd).question.rating; } return t / 300; };
  assert.ok(avg(15) > avg(8) && avg(8) > avg(0) + 400, `${avg(0)} ${avg(8)} ${avg(15)}`);
  const s = H.newState(); s.streak = 18; const tiers = {}; for (let i = 0; i < 60; i++) { const n = H.next(qs, s, rnd); tiers[n.question.tier] = (tiers[n.question.tier] || 0) + 1; }
  assert.ok((tiers[4] || 0) + (tiers[3] || 0) > 40, JSON.stringify(tiers));
});

test('Hardcore: kein Wiederholen, alle fuenf Formate (inkl. ODER, Crafting erraten/bauen), Diversitaet', () => {
  const rnd = lcg(21), st = H.newState(), ids = new Set(), formats = new Set();
  let lastTpl = '', tplRun = 0, maxRun = 0, fmtRun = 0, lastFmt = '', maxFmt = 0;
  for (let i = 0; i < 100; i++) {
    const n = H.next(qs, st, rnd);
    assert.ok(!ids.has(n.question.id), 'Wiederholung ' + n.question.id); ids.add(n.question.id);
    formats.add(n.format);
    if (n.variant === 'build') { assert.ok(n.question.buildable && n.question.solution); assert.strictEqual(n.buildSeconds, M.BUILD.seconds); }
    const t = R.templateKey(n.question); tplRun = t === lastTpl ? tplRun + 1 : 1; lastTpl = t; maxRun = Math.max(maxRun, tplRun);
    const f = R.formatKey(n.question); fmtRun = f === lastFmt ? fmtRun + 1 : 1; lastFmt = f; maxFmt = Math.max(maxFmt, fmtRun);
    H.record(st, n.question, true, n.variant);
  }
  ['number', 'entity', 'choice', 'craft-guess', 'craft-build'].forEach(f => assert.ok(formats.has(f), 'Format fehlt: ' + f));
  assert.ok(maxRun <= 2, 'gleiche Vorlage in Folge: ' + maxRun);
  assert.ok(maxFmt <= 4, 'gleiches Format in Folge: ' + maxFmt);
});

test('Hardcore: craftPref guess = nie Bauen; ein Leben, Ende beim ersten Fehler, Zusammenfassung spoilerfrei', () => {
  const rnd = lcg(8), st = H.newState();
  for (let i = 0; i < 60; i++) assert.notStrictEqual(H.next(qs, st, rnd, [], { craftPref: 'guess' }).variant, 'build');
  const s2 = H.newState();
  for (let i = 0; i < 4; i++) { const n = H.next(qs, s2, rnd); H.record(s2, n.question, true, n.variant); }
  assert.strictEqual(s2.streak, 4); assert.ok(s2.alive);
  const n = H.next(qs, s2, rnd); H.record(s2, n.question, false, n.variant);
  assert.strictEqual(s2.alive, false); assert.strictEqual(s2.streak, 4);
  const sum = H.summary(s2);
  assert.deepStrictEqual(Object.keys(sum).sort(), ['alive', 'answered', 'byTier', 'correct', 'formats', 'streak']);
  assert.ok(!JSON.stringify(sum).includes(String(n.question.answer)) || String(n.question.answer).length < 3);
});

test('Format-Matrix: jeder Solo-Modus nennt Formate, der Pool liefert jedes davon', () => {
  const modes = ['endless', 'blitz', 'daily', 'joker', 'categories', 'crafting', 'ranked', 'hardcore', 'challenge'];
  modes.forEach(m => { assert.ok(M.MATRIX[m] && M.MATRIX[m].formats.length >= 2, m); });
  const have = new Set(qs.map(q => M.formatOf(q, 'guess')));
  const build = qs.filter(q => q.buildable && q.solution).length;
  ['number', 'entity', 'choice', 'craft-guess'].forEach(f => assert.ok(have.has(f), 'Pool ohne ' + f));
  assert.ok(build > 100);
  ['endless', 'daily', 'joker', 'categories', 'ranked', 'hardcore'].forEach(m => assert.ok(M.MATRIX[m].formats.includes('craft-build'), m));
  ['blitz', 'challenge'].forEach(m => assert.ok(!M.MATRIX[m].formats.includes('craft-build') && M.BUILD.share[m] === 0, m));
});

test('craftVariant: nur buildable, pref guess nie, Anteil je Modus, deterministisch bei fester Zufallsfolge', () => {
  const rnd = lcg(1);
  const bq = qs.find(q => q.type === 'crafting' && q.buildable), nq = qs.find(q => q.type === 'number'), uq = qs.find(q => q.type === 'crafting' && !q.buildable);
  assert.strictEqual(M.craftVariant(nq, 'endless', 'mix', rnd), 'guess');
  assert.strictEqual(M.craftVariant(uq, 'endless', 'build', rnd), 'guess');
  assert.strictEqual(M.craftVariant(bq, 'endless', 'guess', rnd), 'guess');
  assert.strictEqual(M.craftVariant(bq, 'crafting', 'build', rnd), 'build');
  assert.strictEqual(M.craftVariant(bq, 'blitz', 'build', rnd), 'guess');
  assert.strictEqual(M.craftVariant(bq, 'challenge', 'mix', rnd), 'guess');
  let b = 0; for (let i = 0; i < 2000; i++) if (M.craftVariant(bq, 'endless', 'mix', rnd) === 'build') b++;
  assert.ok(b > 600 && b < 800, 'Anteil ' + b / 2000);
  assert.strictEqual(M.formatOf(bq, 'build'), 'craft-build'); assert.strictEqual(M.formatOf(bq, 'guess'), 'craft-guess');
});

test('Hardcore: selfTest des Moduls', () => { assert.ok(M.selfTest(qs).includes('Formate')); });
