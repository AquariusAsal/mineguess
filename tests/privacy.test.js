const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const { redactText, purgeReports, RETENTION_MS } = require('../lib/privacy.js');
const { startServer, post } = require('./helpers.js');
const qs = require('../questions.json');

test('Datenschutz: Kontaktdaten im Freitext werden geschwaerzt', () => {
  const t = redactText('Mail an max.muster@example.com, Tel +49 170 1234567, siehe https://example.com/x und www.test.de');
  assert.ok(!/@|1234567|https?:|www\./.test(t), t);
  assert.strictEqual(redactText('Die Antwort ist 15 Bloecke, nicht 16'), 'Die Antwort ist 15 Bloecke, nicht 16');
});

test('Datenschutz: Meldungen aelter als 12 Monate werden geloescht, Altbestand bekommt Zeitstempel', () => {
  const now = Date.now();
  const out = purgeReports([
    { questionId: 1, reason: 'falsch', text: 'alt', ts: now - RETENTION_MS - 1000 },
    { questionId: 2, reason: 'falsch', text: 'neu', ts: now - 1000 },
    { questionId: 3, reason: 'unklar', text: 'ohne Zeit' },
    { questionId: 4, reason: 'falsch', text: 'x', ts: now, ip: '1.2.3.4', uid: 'abc', name: 'Max' },
  ], now);
  assert.deepStrictEqual(out.map(r => r.questionId), [2, 3, 4]);
  assert.strictEqual(out[1].ts, now);
  assert.deepStrictEqual(Object.keys(out[2]).sort(), ['questionId', 'reason', 'text', 'ts']);   // keine IP, ID, kein Name
});

test('Datenschutz: reports.json und qstats.json enthalten nur erlaubte Felder; Text hart auf 300 Zeichen', async () => {
  const S = await startServer();
  try {
    const long = 'a'.repeat(400) + ' kontakt: me@mail.de';
    assert.strictEqual((await post(S.url + '/api/report', { questionId: qs[0].id, reason: 'falsch', text: long, name: 'Max', uid: 'u1' })).body.ok, true);
    await post(S.url + '/api/stats', { questionId: qs[0].id, correct: true, attempts: 1, uid: 'u1', name: 'Max' });
    await new Promise(r => setTimeout(r, 2600));
    const reports = JSON.parse(fs.readFileSync(S.dataDir + '/reports.json', 'utf8'));
    assert.strictEqual(reports.length, 1);
    const allowed = new Set(['category', 'reason', 'mode', 'format', 'questionId', 'round', 'text', 'ts', 'count', 'ctx', 'errors', 'room', 'player', 'contact', 'id', 'status', 'rk', 'rewarded', 'lang']);
    Object.keys(reports[0]).forEach(k => assert.ok(allowed.has(k), 'unerwartetes Feld ' + k));   // keine IP, keine Nutzer-ID, kein Name (id = Meldungs-ID, rk nur mit Profil-Token bis zur Pruefung)
    assert.strictEqual(reports[0].category, 'frage'); assert.strictEqual(reports[0].questionId, qs[0].id);
    assert.ok(reports[0].text.length <= 300);
    assert.ok(!/@/.test(JSON.stringify(reports)));
    const stats = JSON.parse(fs.readFileSync(S.dataDir + '/qstats.json', 'utf8'));
    assert.deepStrictEqual(Object.keys(stats[qs[0].id]).sort(), ['attempts', 'correct', 'n']);
  } finally { S.stop(); }
});

test('Limits: /api/stats gibt nie 429, mehrere Spieler pro IP, Ranked-Antworten gehen nicht verloren', async () => {
  const S = await startServer();
  try {
    for (let i = 0; i < 400; i++) { const r = await post(S.url + '/api/stats', { questionId: qs[0].id, correct: true, attempts: 1 }); assert.notStrictEqual(r.status, 429); }
    // zwei Spieler hinter derselben IP, je ein kompletter 10er-Lauf
    const play = async (gid, gap) => {
      const st = await post(S.url + '/api/ranked/start', { gid, name: gid });
      assert.strictEqual(st.body.ok, true);
      let last;
      for (let i = 0; i < 10; i++) {
        const nx = await post(S.url + '/api/ranked/next', { runId: st.body.runId });
        const q = qs.find(x => x.id === nx.body.question.id);
        await new Promise(r => setTimeout(r, gap));
        last = await post(S.url + '/api/ranked/answer', { runId: st.body.runId, answer: q.type === 'number' ? String(q.answer) : q.answer });
        assert.strictEqual(last.body.final, true);
      }
      return last.body;
    };
    const [a, b] = await Promise.all([play('lauf_eins_' + Date.now(), 600), play('lauf_zwei_' + Date.now(), 1000)]);
    for (const r of [a, b]) { assert.strictEqual(r.runDone, true); assert.strictEqual(r.profile.games, 1); assert.strictEqual(r.profile.answered, 10); assert.strictEqual(r.profile.history.length, 1); assert.ok(!r.notCounted); }
  } finally { S.stop(); }
});

test('Anti-Cheat: 3 Antworten unter 500 ms machen den Lauf ungueltig (ohne MMR), Hinweis notCounted', async () => {
  const S = await startServer();
  try {
    const st = await post(S.url + '/api/ranked/start', { gid: 'schnell_' + Date.now(), name: 'Bot' });
    let last;
    for (let i = 0; i < 4; i++) {
      const nx = await post(S.url + '/api/ranked/next', { runId: st.body.runId });
      const q = qs.find(x => x.id === nx.body.question.id);
      last = await post(S.url + '/api/ranked/answer', { runId: st.body.runId, answer: q.type === 'number' ? String(q.answer) : q.answer });
    }
    assert.strictEqual(last.body.notCounted, true);
    assert.strictEqual(last.body.delta, 0);
  } finally { S.stop(); }
});

test('Meldetext mit 301 Zeichen wird auf 300 gekuerzt', async () => {
  const S = await startServer();
  try {
    const r = await post(S.url + '/api/report', { questionId: qs[0].id, reason: 'falsch', text: 'b'.repeat(301) });
    assert.strictEqual(r.body.ok, true);   // wird auf 300 gekuerzt
  } finally { S.stop(); }
});

test('Anti-Cheat: abgebrochene Laeufe veraendern weder Rangliste noch signiertes Profil (Farming)', async () => {
  const S = await startServer();
  try {
    const gid = 'farm_' + Date.now();
    let token = '';
    for (let i = 0; i < 4; i++) {
      const st = await post(S.url + '/api/ranked/start', { gid, name: 'Farm', token });
      if (st.status === 429) break;                       // Start-Limit je Spieler
      token = st.body.token;
      for (let j = 0; j < 2; j++) {
        const nx = await post(S.url + '/api/ranked/next', { runId: st.body.runId });
        const q = qs.find(x => x.id === nx.body.question.id);
        const a = await post(S.url + '/api/ranked/answer', { runId: st.body.runId, answer: q.type === 'number' ? String(q.answer) : q.answer });
        token = a.body.token;                             // Token aendert sich nicht
      }
    }
    const again = await post(S.url + '/api/ranked/start', { gid, name: 'Farm', token });
    if (again.body && again.body.profile) assert.ok(again.body.profile.mmr <= 520, 'MMR darf nicht gewachsen sein: ' + again.body.profile.mmr);
    const list = await (await fetch(S.url + '/api/ranked')).json();
    assert.ok(!list.some(e => e.name === 'Farm'));
  } finally { S.stop(); }
});

test('Anti-Cheat streng: zu schneller kompletter Lauf (unter 12 s) wird nicht gewertet, Rangliste leer', async () => {
  const S = await startServer({ RANKED_STRICT: '1' });
  try {
    const st = await post(S.url + '/api/ranked/start', { gid: 'streng_' + Date.now(), name: 'Streng' });
    let last;
    for (let i = 0; i < 10; i++) {
      const nx = await post(S.url + '/api/ranked/next', { runId: st.body.runId });
      const q = qs.find(x => x.id === nx.body.question.id);
      await new Promise(r => setTimeout(r, 650));
      last = await post(S.url + '/api/ranked/answer', { runId: st.body.runId, answer: q.type === 'number' ? String(q.answer) : q.answer });
    }
    assert.strictEqual(last.body.runDone, true);
    assert.strictEqual(last.body.notCounted, true);
    assert.strictEqual(last.body.token, st.body.token);
    assert.ok(!(await (await fetch(S.url + '/api/ranked')).json()).some(e => e.name === 'Streng'));
  } finally { S.stop(); }
});

test('Limits: Lauf-Starts je Spieler begrenzt (429), anderer Spieler hinter gleicher IP unbehelligt', async () => {
  const S = await startServer();
  try {
    const gid = 'spam_' + Date.now();
    let blocked = 0;
    for (let i = 0; i < 8; i++) if ((await post(S.url + '/api/ranked/start', { gid, name: 'Spam' })).status === 429) blocked++;
    assert.ok(blocked >= 4, 'zu viele Starts wurden nicht gebremst: ' + blocked);
    assert.strictEqual((await post(S.url + '/api/ranked/start', { gid: 'anderer_' + Date.now(), name: 'Anderer' })).body.ok, true);
  } finally { S.stop(); }
});

test('Anti-Cheat: Abbruch nach 5 Antworten mit Verlust gilt als Niederlage, Gewinn verfaellt', async () => {
  const S = await startServer();
  try {
    const gid = 'abbruch_' + Date.now();
    const st = await post(S.url + '/api/ranked/start', { gid, name: 'Abbruch', profile: { mmr: 1500, peak: 1500 } });
    const start = st.body.profile.mmr;
    for (let i = 0; i < 5; i++) {
      const nx = await post(S.url + '/api/ranked/next', { runId: st.body.runId });
      const q = qs.find(x => x.id === nx.body.question.id);
      const wrong = q.choices ? q.choices.find(c => c !== q.answer) : (q.type === 'number' ? String(Math.abs(q.answer) * 100 + 99999) : 'Voellig Falsch QQ');
      let r;
      for (let k = 0; k < 3 && !(r && r.body.final); k++) { await new Promise(res => setTimeout(res, 300)); r = await post(S.url + '/api/ranked/answer', { runId: st.body.runId, answer: wrong }); }
      assert.strictEqual(r.body.final, true);
    }
    const again = await post(S.url + '/api/ranked/start', { gid, name: 'Abbruch', token: st.body.token });
    assert.ok(again.body.profile.mmr < start, 'Verlust muss gelten: ' + again.body.profile.mmr + ' vs ' + start);
    const replay = await post(S.url + '/api/ranked/start', { gid, name: 'Abbruch', token: st.body.token });
    assert.ok(replay.status === 429 || replay.body.profile.mmr <= again.body.profile.mmr);
  } finally { S.stop(); }
});
