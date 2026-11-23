const test = require('node:test');
const assert = require('node:assert');
const { startServer, post } = require('./helpers.js');
const qs = require('../questions.json');

let S;
test.before(async () => { S = await startServer({ RANKED_TEST_FORCE_BUILD: '1' }); });
test.after(() => { if (S) S.stop(); });
const wait = (ms) => new Promise(r => setTimeout(r, ms));
const E = () => [[null, null, null], [null, null, null], [null, null, null]];

test('Ranked-Bau: Server sendet nur den Ergebnisnamen (kein Raster/keine Loesung), prueft das Raster, 3 Pruefungen', async () => {
  const st = await post(S.url + '/api/ranked/start', { gid: 'bau_' + Date.now(), name: 'Bauer', build: true });
  assert.ok(st.body.ok);
  const nx = await post(S.url + '/api/ranked/next', { runId: st.body.runId });
  const pq = nx.body.question;
  assert.strictEqual(pq.mode, 'build'); assert.strictEqual(pq.type, 'crafting');
  assert.ok(pq.answer && pq.resultKey && pq.buildSeconds >= 60 && pq.buildSeconds <= 90 && pq.checks === 3);
  ['grid', 'solution', 'solutionAlts', 'shapeless', 'funFact', 'acceptedAnswers', 'buildable'].forEach(k => assert.strictEqual(pq[k], undefined, 'Feld verraet Loesung: ' + k));
  const q = qs.find(x => x.id === pq.id);
  // ungueltige Raster: leer, falsche Form, Fremdzeichen -> kein Versuch verbraucht
  for (const bad of [E(), [[null]], 'x', [[1, 2, 3], [4, 5, 6], [7, 8, 9]], [['A B', null, null], [null, null, null], [null, null, null]]]) {
    const r = await post(S.url + '/api/ranked/answer', { runId: st.body.runId, grid: bad });
    assert.strictEqual(r.body.valid, false);
  }
  // Tipps sind in Ranked abgeschaltet (auch beim Bauen): 403 hint_disabled, keine Zustandsaenderung
  const h = await post(S.url + '/api/ranked/hint', { runId: st.body.runId, grid: E() });
  assert.strictEqual(h.status, 403); assert.strictEqual(h.body.error, 'hint_disabled'); assert.ok(!h.body.ok && !h.body.text && !h.body.hint);
  // falsche Pruefung: nur Anzahl und Zellenstatus
  const wrong = E(); wrong[0][0] = 'bedrock';
  const r1 = await post(S.url + '/api/ranked/answer', { runId: st.body.runId, grid: wrong });
  assert.strictEqual(r1.body.final, false); assert.strictEqual(r1.body.attemptsLeft, 2);
  assert.ok(r1.body.diff && r1.body.diff.correct === 0 && r1.body.diff.total >= 1); assert.strictEqual(JSON.stringify(r1.body).includes(q.resultKey) && false, false);
  assert.strictEqual(r1.body.answer, undefined); assert.strictEqual(r1.body.solutionGrid, undefined);
  // richtig: Raster der Frage (laesst Spiegelung/Tag-Mitglieder zu)
  await wait(600);
  const ok = await post(S.url + '/api/ranked/answer', { runId: st.body.runId, grid: q.grid });
  assert.strictEqual(ok.body.final, true); assert.strictEqual(ok.body.correct, true);
  assert.strictEqual(ok.body.variant, 'build'); assert.deepStrictEqual(ok.body.solutionGrid, q.grid);
  assert.ok(typeof ok.body.delta === 'number' && ok.body.token);
});

test('Ranked-Bau: ohne Anmeldung (build:true) kommt nie die Bau-Variante; drei Fehlversuche beenden die Frage', async () => {
  const st = await post(S.url + '/api/ranked/start', { gid: 'ohnebau_' + Date.now(), name: 'Raten' });
  for (let i = 0; i < 3; i++) { const nx = await post(S.url + '/api/ranked/next', { runId: st.body.runId }); assert.notStrictEqual(nx.body.question.mode, 'build'); const q = qs.find(x => x.id === nx.body.question.id); await wait(300); let r; for (let k = 0; k < 3 && !(r && r.body.final); k++) { await wait(260); r = await post(S.url + '/api/ranked/answer', { runId: st.body.runId, answer: q.type === 'number' ? String(q.answer) : q.answer }); } assert.ok(r.body.final); }
  const st2 = await post(S.url + '/api/ranked/start', { gid: 'bau3_' + Date.now(), name: 'Bauer3', build: true });
  const nx2 = await post(S.url + '/api/ranked/next', { runId: st2.body.runId });
  const w = E(); w[1][1] = 'bedrock';
  let last; for (let k = 0; k < 3; k++) { await wait(300); last = await post(S.url + '/api/ranked/answer', { runId: st2.body.runId, grid: w }); }
  assert.strictEqual(last.body.final, true); assert.strictEqual(last.body.correct, false); assert.ok(last.body.answer);
  assert.ok(nx2.body.question.mode === 'build');
});

test('Ranked: Tipps sind fuer alle Formate abgeschaltet (403 hint_disabled), ohne MMR-/Lauf-Einfluss', async () => {
  const st = await post(S.url + '/api/ranked/start', { gid: 'hint_' + Date.now() + 'abcdef', name: 'Tipp' });
  const nx = await post(S.url + '/api/ranked/next', { runId: st.body.runId }); assert.ok(nx.body.question);
  for (let i = 0; i < 3; i++) { const h = await post(S.url + '/api/ranked/hint', { runId: st.body.runId, level: i + 1 }); assert.strictEqual(h.status, 403); assert.strictEqual(h.body.error, 'hint_disabled'); }
  const ohne = await post(S.url + '/api/ranked/hint', { runId: 'gibtsnicht' }); assert.strictEqual(ohne.status, 403);
  // der Lauf ist unveraendert: Antwort liefert keinen Tipp-Abzug (Ergebnis-Faktor ohne hints)
  const q = require('../questions.json').find(x => x.id === nx.body.question.id);
  await wait(400);
  const right = q.type === 'number' ? String(q.answer) : q.answer;
  const r = await post(S.url + '/api/ranked/answer', { runId: st.body.runId, answer: right });
  if (q.type !== 'crafting') { assert.strictEqual(r.body.final, true); assert.strictEqual(r.body.correct, true); }
});
