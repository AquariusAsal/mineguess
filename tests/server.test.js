const test = require('node:test');
const assert = require('node:assert');
const { io } = require('socket.io-client');
const { startServer, post, rawGet } = require('./helpers.js');
const qs = require('../questions.json');

let S;
test.before(async () => { S = await startServer(); });
test.after(() => { if (S) S.stop(); });

const wait = (ms) => new Promise(r => setTimeout(r, ms));
// eine sicher falsche, aber gueltige Eingabe (bei Zwei-Optionen-Fragen die andere Option)
const wrongFor = (q) => q.choices ? q.choices.find(c => c !== q.answer) : (q.type === 'number' ? String(Math.abs(q.answer) * 100 + 99999) : 'Voellig Falsch QQ');

test('Pfad-Whitelist: Serverdateien und Umgehungen sind gesperrt', async () => {
  for (const p of ['/server.js', '/package.json', '/data/ranked.json', '/lib/store.js', '/tests/helpers.js', '/./server.js', '//server.js', '/%2e%2e/server.js', '/assets/../server.js', '/docs/team/API-NOTES.md']) {
    assert.strictEqual(await rawGet(S.port, p), 404, p);
  }
  for (const p of ['/', '/game.html', '/questions.json', '/answer-check.js', '/sw.js']) assert.strictEqual(await rawGet(S.port, p), 200, p);
});

test('/health liefert Kennzahlen', async () => {
  const j = await (await fetch(S.url + '/health')).json();
  assert.strictEqual(j.ok, true);
  assert.ok(j.questions >= qs.length - 5 && j.rooms >= 5 && j.uptimeSec >= 0);
  assert.ok(j.counters && typeof j.counters.errors === 'number');
});

test('Melden und Statistik: Validierung', async () => {
  assert.strictEqual((await post(S.url + '/api/report', { questionId: qs[0].id, reason: 'falsch', text: 'x' })).body.ok, true);
  assert.strictEqual((await post(S.url + '/api/report', { questionId: -5, reason: 'falsch' })).status, 400);
  assert.strictEqual((await post(S.url + '/api/report', { questionId: qs[0].id, reason: 'boese' })).status, 400);
  assert.strictEqual((await post(S.url + '/api/stats', { questionId: qs[0].id, correct: true, attempts: 2 })).body.ok, true);
  assert.strictEqual((await post(S.url + '/api/stats', { questionId: qs[0].id, correct: 'ja', attempts: 2 })).status, 400);
});

test('Ranked: Lauf serverseitig, keine Loesung vorab, signiertes Profil, Rangliste nur verifiziert', async () => {
  const gid = 'testgid_' + Date.now();
  await post(S.url + '/api/ranked', { gid, name: 'Cheater', mmr: 4500 });      // altes Client-POST: ohne Wirkung
  assert.ok(!(await (await fetch(S.url + '/api/ranked')).json()).some(e => e.name === 'Cheater'));

  const st = await post(S.url + '/api/ranked/start', { gid, name: 'Tester', profile: { mmr: 19000, peak: 19000 } });
  assert.strictEqual(st.body.ok, true);
  assert.ok(st.body.profile.mmr <= 2000, 'behaupteter MMR wird begrenzt');
  const runId = st.body.runId;
  const nx = await post(S.url + '/api/ranked/next', { runId });
  assert.ok(nx.body.question && nx.body.question.id);
  assert.strictEqual(nx.body.question.answer, undefined);
  assert.strictEqual(nx.body.question.funFact, undefined);
  assert.strictEqual(nx.body.question.acceptedAnswers, undefined);
  const q = qs.find(x => x.id === nx.body.question.id);
  await wait(900);
  const ans = await post(S.url + '/api/ranked/answer', { runId, answer: q.type === 'number' ? String(q.answer) : q.answer });
  assert.strictEqual(ans.body.final, true);
  assert.strictEqual(ans.body.correct, true);
  assert.ok(ans.body.delta >= 0);   // bei hohem Start-MMR und leichter Frage kann der Zuwachs 0 sein
  assert.ok(typeof ans.body.token === 'string' && ans.body.token.includes('.'));
  assert.strictEqual(ans.body.token, st.body.token, 'Token aendert sich erst am Lauf-Ende (vorlaeufige MMR)');
  assert.ok(!(await (await fetch(S.url + '/api/ranked')).json()).some(e => e.name === 'Tester'), 'Rangliste erst nach gueltigem Lauf');
  let fin = ans;
  for (let i = 1; i < 10; i++) {
    const n2 = await post(S.url + '/api/ranked/next', { runId });
    const q2 = qs.find(x => x.id === n2.body.question.id);
    await wait(700);
    fin = await post(S.url + '/api/ranked/answer', { runId, answer: q2.type === 'number' ? String(q2.answer) : q2.answer });
  }
  assert.strictEqual(fin.body.runDone, true);
  assert.notStrictEqual(fin.body.token, st.body.token);
  const forged = await post(S.url + '/api/ranked/start', { gid, name: 'Tester', token: fin.body.token.slice(0, -3) + 'abc', profile: { mmr: 15000 } });
  assert.ok(forged.body.profile.mmr < 5000, 'gefaelschtes Token wird nicht uebernommen');
  const same = await post(S.url + '/api/ranked/start', { gid, name: 'Tester', token: fin.body.token });
  assert.strictEqual(same.body.profile.mmr, fin.body.profile.mmr);
  const list = await (await fetch(S.url + '/api/ranked')).json();
  assert.ok(list.some(e => e.name === 'Tester'));
});

test('Ranked: drei Fehlversuche, Loesung erst am Ende', async () => {
  const gid = 'testgid2_' + Date.now();
  const { body: st } = await post(S.url + '/api/ranked/start', { gid, name: 'Fehler' });
  const nx = await post(S.url + '/api/ranked/next', { runId: st.runId });
  const q = qs.find(x => x.id === nx.body.question.id);
  const wrong = wrongFor(q);
  let r;
  const maxAtt = q.choices && q.choices.length === 2 ? 1 : 3;          // Zweier-Auswahlfragen (ODER, Wahr/Mythos): nur ein Versuch
  for (let i = 0; i < maxAtt; i++) {
    await wait(300);
    r = await post(S.url + '/api/ranked/answer', { runId: st.runId, answer: wrong });
    if (i < maxAtt - 1) { assert.strictEqual(r.body.final, false); assert.strictEqual(r.body.answer, undefined); }
  }
  assert.strictEqual(r.body.final, true);
  assert.strictEqual(r.body.correct, false);
  assert.ok(r.body.delta <= 0);
  assert.ok(r.body.answer !== undefined);
});

test('Wertungstabelle (Multiplayer): Laeutender exakt = 200..250, Daneben = 0', async () => {
  const a = io(S.url, { transports: ['websocket'] }), b = io(S.url, { transports: ['websocket'] });
  const ev = [];
  a.onAny((e, d) => ev.push(['a', e, d]));
  const find = (e) => ev.find(x => x[1] === e);
  await wait(400);
  a.emit('create_room', { playerName: 'A' });
  await wait(300);
  const rid = find('joined')[2].roomId;
  b.emit('join_room', { roomId: rid, playerName: 'B' });
  await wait(300);
  a.emit('player_ready'); b.emit('player_ready');
  for (let i = 0; i < 60 && !find('question'); i++) await wait(100);
  const qd = find('question') && find('question')[2];
  assert.ok(qd, 'Frage kam nicht');
  const q = qs.find(x => x.id === qd.id);
  assert.ok(q);
  a.emit('buzz');
  for (let i = 0; i < 30 && !find('answer_phase'); i++) await wait(100);
  const good = q.type === 'number' ? String(q.answer) : q.answer;
  const bad = wrongFor(q);
  a.emit('submit_answer', { answer: good }); b.emit('submit_answer', { answer: bad });
  for (let i = 0; i < 60 && !find('result'); i++) await wait(100);
  const res = find('result') && find('result')[2];
  assert.ok(res, 'kein Ergebnis');
  const sa = res.scores.find(s => s.name === 'A').score, sb = res.scores.find(s => s.name === 'B').score;
  assert.ok(sa >= 200 && sa <= 250, 'A: ' + sa);
  assert.strictEqual(sb, 0);
  a.close(); b.close();
});
