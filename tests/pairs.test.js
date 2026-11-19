const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const P = require('../pairs.js');
const root = path.join(__dirname, '..');
const qs = require('../questions.json');
const file = JSON.parse(fs.readFileSync(path.join(root, 'pairs.json'), 'utf8'));
const pool = P.fromMeasures(file);
const lcg = (seed) => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };

test('Paare: Pool aus pairs.json, gleiche Einheit je Vorlage, nur Objekte mit existierendem Icon', () => {
  assert.ok(pool.keys.length >= 6);
  pool.keys.forEach(k => {
    const t = pool.templates[k];
    assert.ok(t.items.length >= 8, k);
    assert.strictEqual(new Set(t.items.map(i => i.name)).size, t.items.length, 'Namen eindeutig ' + k);
    t.items.forEach(i => {
      assert.ok(typeof i.value === 'number' && i.value >= 0 && i.name, k + ' ' + i.name);
      assert.ok(i.icon && fs.existsSync(path.join(root, 'assets/mc', i.icon + '.png')), 'Icon fehlt: ' + i.name + ' -> ' + i.icon);
    });
  });
});

test('Paare: pairs.json passt zu questions.json (Werte, Namen)', () => {
  const byId = new Map(qs.map(q => [q.id, q]));
  file.measures.forEach(m => m.items.forEach(it => { const q = byId.get(it.id); assert.ok(q && q.answer === it.value && q.gen === m.id, 'veraltet: ' + it.name); }));
});

test('Paare: Verhaeltnis >= 1,25, nie gleicher Wert/Name, higher stimmt, hoechstens 3 gleiche Vorlagen in Folge, Icons an beiden Karten', () => {
  const rnd = lcg(7), st = P.newState();
  let run = 0, last = '';
  for (let i = 0; i < 2000; i++) {
    if (st.lives === 0) { st.lives = 3; st.streak = i % 30; }
    const p = P.next(pool, st, rnd);
    assert.notStrictEqual(p.a.value, p.b.value);
    assert.notStrictEqual(p.a.name, p.b.name);
    const hi = Math.max(p.a.value, p.b.value), lo = Math.min(p.a.value, p.b.value);
    assert.ok(lo === 0 || hi / lo >= 1.25 - 1e-9, `${p.a.name} ${p.a.value} / ${p.b.name} ${p.b.value}`);
    assert.strictEqual(p.higher, p.b.value > p.a.value);
    assert.ok(p.a.icon && p.b.icon);
    run = p.tpl.key === last ? run + 1 : 1; last = p.tpl.key; assert.ok(run <= 3);
    P.advance(st, p, rnd() < 0.8);
  }
});

test('Paare: buildPool(questions, icons) filtert auf Objekte mit Icon, ohne icons alle', () => {
  const all = P.buildPool(qs), none = P.buildPool(qs, { }), some = P.buildPool(qs, { 'Steinsäge': 'block/stonecutter_side' });
  assert.ok(all.keys.length >= 6 && none.keys.length === 0);
  const sum = (p) => p.keys.reduce((n, k) => n + p.templates[k].items.length, 0);
  assert.ok(sum(all) > sum(pool));
  assert.ok(some.keys.length <= 1);
});

test('Paare: Kette (B wird naechstes A innerhalb einer Vorlage), Serie/Leben, Antwort', () => {
  const rnd = lcg(3), st = P.newState();
  let p = P.next(pool, st, rnd);
  assert.strictEqual(P.answer(p, p.higher ? 'higher' : 'lower').correct, true);
  assert.strictEqual(P.answer(p, p.higher ? 'lower' : 'higher').correct, false);
  assert.strictEqual(P.answer(p, 'egal').correct, false);
  P.advance(st, p, true);
  assert.strictEqual(st.streak, 1);
  let chained = 0;
  for (let i = 0; i < 40; i++) {
    const prev = p; p = P.next(pool, st, rnd);
    if (p.tpl.key === prev.tpl.key) { assert.strictEqual(p.a.id, prev.b.id); chained++; }
    P.advance(st, p, true);
  }
  assert.ok(chained > 10 && st.best >= 41);
  const s2 = P.newState(); const q = P.next(pool, s2, rnd); P.advance(s2, q, false);
  assert.strictEqual(s2.lives, 2); assert.strictEqual(s2.streak, 0);
  P.advance(s2, q, false); P.advance(s2, q, false); assert.strictEqual(s2.lives, 0);
});

test('Paare: Schwierigkeit waechst mit der Serie (kleineres Verhaeltnis)', () => {
  const avg = (streak) => { const rnd = lcg(11 + streak); let t = 0; for (let i = 0; i < 600; i++) { const s = P.newState(); s.streak = streak; t += Math.min(50, P.next(pool, s, rnd).ratio); } return t / 600; };
  assert.ok(avg(0) > avg(8) && avg(8) > avg(20), `${avg(0)} ${avg(8)} ${avg(20)}`);
  assert.ok(P.level(0).maxRatio > P.level(10).maxRatio && P.level(10).maxRatio > P.level(30).maxRatio);
  assert.strictEqual(P.level(5).minRatio, 1.25);
});

test('Paare: Formatierung (deutsches Komma, Tausender)', () => {
  assert.strictEqual(P.format(3.5), '3,5');
  assert.strictEqual(P.format(1408, 'Blöcke'), '1 408 Blöcke');
});
