const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { startServer, post } = require('./helpers.js');
const qs = require('../questions.json');
const M = require('../modes.js');
const R = require('../ranked.js');
const MGAnswer = require('../answer-check.js');
const TF = qs.filter(q => q.fmt === 'tf');
const wait = (ms) => new Promise(r => setTimeout(r, ms));

test('tf-Daten: mindestens 250 Aussagen, ausgewogen, Beleg, Erklaerung, gueltige Tiers, eindeutige IDs', () => {
  assert.ok(TF.length >= 250, 'Anzahl ' + TF.length);
  const t = TF.filter(q => q.answer === 'Wahr').length; assert.ok(Math.abs(t - TF.length / 2) <= TF.length * 0.06, 'Balance ' + t + '/' + TF.length);
  const ids = new Set(qs.map(q => q.id)); assert.strictEqual(ids.size, qs.length, 'doppelte IDs');
  const texts = new Set();
  for (const q of TF) {
    assert.strictEqual(q.type, 'entity'); assert.deepStrictEqual(q.choices, ['Wahr', 'Mythos']); assert.ok(['Wahr', 'Mythos'].includes(q.answer)); assert.deepStrictEqual(q.acceptedAnswers, [q.answer]);
    assert.ok(q.id >= 3001 && q.question.length >= 20 && q.source && q.category && /^tf_/.test(q.gen));
    assert.ok(q.funFact.startsWith(q.answer === 'Wahr' ? 'Stimmt: ' : 'Mythos: ') && q.funFact.length >= 30);
    assert.ok(q.tier >= 1 && q.tier <= 4 && q.rating >= 600 && q.rating <= 3900);
    assert.ok(!texts.has(q.question), 'doppelt: ' + q.question); texts.add(q.question);
  }
  assert.ok(new Set(TF.map(q => q.category)).size >= 10);
  // keine Dubletten zu bestehenden Fragen (exakter Text)
  const other = new Set(qs.filter(q => q.fmt !== 'tf').map(q => q.question)); TF.forEach(q => assert.ok(!other.has(q.question)));
});

test('tf: Format-Erkennung (modes.js, ranked.js), Matrix, Antwortpruefung', () => {
  const q = TF[0];
  assert.strictEqual(M.formatOf(q), 'tf'); assert.strictEqual(M.isTf(q), true); assert.strictEqual(M.isTf(qs[0]), false); assert.strictEqual(R.formatKey(q), 'tf');
  Object.keys(M.MATRIX).filter(k => k !== 'crafting').forEach(k => assert.ok(M.MATRIX[k].formats.includes('tf'), 'Modus ohne tf: ' + k));
  assert.ok(M.MATRIX.tf && M.MATRIX.tf.formats.length === 1);
  assert.strictEqual(MGAnswer.check(q, q.answer).correct, true);
  const other = q.answer === 'Wahr' ? 'Mythos' : 'Wahr'; assert.strictEqual(MGAnswer.check(q, other).correct, false);
  assert.strictEqual(MGAnswer.check(q, q.answer.toLowerCase()).correct, true);
  // normale ODER-Fragen bleiben 'choice'
  assert.strictEqual(M.formatOf(qs.find(x => Array.isArray(x.choices) && x.fmt !== 'tf')), 'choice');
});

test('tf: Hardcore und Ranked-Auswahl ziehen tf (Diversitaet: nie 3 gleiche Formate in Folge)', () => {
  let seed = 7; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const st = M.hardcore.newState(); let tf = 0, run = 0, maxRun = 0, last = null;
  for (let i = 0; i < 200; i++) { const n = M.hardcore.next(qs, st, rnd); if (n.format === 'tf') tf++; run = n.format === last ? run + 1 : 1; last = n.format; maxRun = Math.max(maxRun, run); M.hardcore.record(st, n.question, true, n.variant); }
  assert.ok(tf >= 10, 'tf in Hardcore: ' + tf); assert.ok(maxRun <= 3, 'Formatfolge ' + maxRun);
});

test('Ranked: tf-Fragen kommen ohne Loesung, nur ein Versuch, Antwort wird serverseitig geprueft', async () => {
  const S = await startServer();
  try {
    let found = null;
    for (let i = 0; i < 80 && !found; i++) {
      const st = await post(S.url + '/api/ranked/start', { gid: 'tf_' + Date.now() + '_' + i + 'abcdefgh', name: 'TF' + i });
      const nx = await post(S.url + '/api/ranked/next', { runId: st.body.runId });
      if (nx.body.question && TF.some(q => q.id === nx.body.question.id)) found = { runId: st.body.runId, pq: nx.body.question };
    }
    assert.ok(found, 'keine tf-Frage in 80 Laeufen');
    const q = TF.find(x => x.id === found.pq.id), pq = found.pq;
    assert.deepStrictEqual(pq.choices, ['Wahr', 'Mythos']);
    assert.strictEqual(pq.fmt, 'tf');
    ['answer', 'acceptedAnswers', 'funFact', 'source'].forEach(k => assert.strictEqual(pq[k], undefined, 'verraet: ' + k));
    assert.ok(!JSON.stringify(pq).includes(q.funFact));
    // ungueltige Option: kein Versuch verbraucht
    assert.strictEqual((await post(S.url + '/api/ranked/answer', { runId: found.runId, answer: 'Vielleicht' })).body.valid, false);
    // falsche Antwort beendet die Frage sofort (kein Raten mit zweitem Versuch)
    await wait(500);
    const wrong = q.answer === 'Wahr' ? 'Mythos' : 'Wahr';
    const r = await post(S.url + '/api/ranked/answer', { runId: found.runId, answer: wrong });
    assert.strictEqual(r.body.final, true); assert.strictEqual(r.body.correct, false); assert.strictEqual(r.body.answer, q.answer);
  } finally { S.stop(); }
});

// ── Multiplayer (Raum-Einstellung tf: mix | only | off) ──
const { io } = require('socket.io-client');
function mpClient(url) {
  const s = io(url, { transports: ['websocket'] }); s.ev = [];
  s.onAny((e, d) => s.ev.push([e, d]));
  s.all = (e) => s.ev.filter(x => x[0] === e).map(x => x[1]);
  s.last = (e) => { const a = s.all(e); return a[a.length - 1]; };
  s.until = async (e, ms, from) => { for (let i = 0; i < (ms || 8000) / 50; i++) { const a = s.all(e); if (a.length > (from || 0)) return a[a.length - 1]; await wait(50); } return undefined; };
  return s;
}
test('Multiplayer: Raum-Einstellung tf=only liefert nur Wahr-oder-Mythos (feste Optionen, Glocke/Antwortphase), tf=off keine, ungueltiger Wert abgelehnt', async () => {
  const S = await startServer({ MP_TEST_FAST: '1' });
  const cs = [];
  try {
    for (const mode of ['only', 'off']) {
      const a = mpClient(S.url), b = mpClient(S.url); cs.push(a, b); await wait(400);
      a.emit('create_room', { playerName: 'Host', rounds: 10 }); const j = await a.until('joined');
      a.emit('update_settings', { rounds: 10, tf: 'kaputt' }); await wait(150); assert.strictEqual(a.last('settings_denied').reason, 'tf');
      a.emit('update_settings', { rounds: 10, tf: mode }); await wait(150); assert.strictEqual(a.last('settings_updated').tf, mode);
      b.emit('join_room', { roomId: j.roomId, playerName: 'Gast' }); await b.until('joined');
      [a, b].forEach(c => c.emit('player_ready'));
      let seen = 0;
      for (let k = 0; k < 3; k++) {
        const qd = await a.until('question', 8000, k); assert.ok(qd, 'keine Frage');
        const q = qs.find(x => x.id === qd.id);
        if (mode === 'only') { assert.strictEqual(q.fmt, 'tf'); assert.strictEqual(qd.fmt, 'tf'); assert.deepStrictEqual(qd.options, ['Wahr', 'Mythos']); assert.strictEqual(qd.choiceOnly, true); assert.strictEqual(qd.answer, undefined); seen++; }
        else assert.notStrictEqual(q.fmt, 'tf');
        a.emit('buzz'); await a.until('answer_phase', 5000, k);
        a.emit('submit_answer', { answer: q.type === 'number' ? String(q.answer) : q.answer });
        b.emit('submit_answer', { answer: q.choices ? q.choices.find(c => c !== q.answer) : 'xx' });
        await a.until('result', 8000, k);
        if (mode === 'only') { const r = a.last('result'); assert.ok(r); }
      }
      if (mode === 'only') assert.strictEqual(seen, 3);
    }
  } finally { cs.forEach(c => c.close()); S.stop(); }
});
