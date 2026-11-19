const test = require('node:test');
const assert = require('node:assert');
const { startServer, post } = require('./helpers.js');
const qs = require('../questions.json');
const Challenge = require('../challenge.js');

let S;
test.before(async () => { S = await startServer({ PROFILE_CREATE_BURST: '200', PROFILE_RATE_FACTOR: '30', DUEL_TTL_MS: '2500' }); });
test.after(() => { if (S) S.stop(); });

const wait = (ms) => new Promise(r => setTimeout(r, ms));
const get = async (path, pt) => { const r = await fetch(S.url + path, { headers: pt ? { Authorization: 'Bearer ' + pt } : {} }); let j = null; try { j = await r.json(); } catch (e) {} return { status: r.status, body: j }; };
const ap = (path, body, pt) => fetch(S.url + path, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + pt }, body: JSON.stringify(body) }).then(async r => ({ status: r.status, body: await r.json().catch(() => null) }));
let n = 0;
async function mk(name, token) {
  token = token || (await post(S.url + '/api/ranked/start', { gid: 'soc_' + Date.now() + '_' + (n++) + 'abcdef', name: 'T' })).body.token;
  const r = await post(S.url + '/api/profile/create', { token, name, age14: true });
  return { token, pt: r.body.pt, me: r.body.me, pid: r.body.me.pid, code: r.body.me.friendCode };
}
async function befriend(A, B) {
  await ap('/api/friends/request', { code: A.code }, B.pt);
  await ap('/api/friends/respond', { pid: B.pid, accept: true }, A.pt);
}
const results = (correct, ms) => Array.from({ length: 10 }, (_, i) => ({ correct: i < correct, attempts: 1, ms: ms || 1500 }));
async function rankedRun(gid) {
  const st = await post(S.url + '/api/ranked/start', { gid, name: 'R' });
  let last;
  for (let i = 0; i < 10; i++) {
    const nx = await post(S.url + '/api/ranked/next', { runId: st.body.runId });
    const q = qs.find(x => x.id === nx.body.question.id);
    await wait(600);
    last = await post(S.url + '/api/ranked/answer', { runId: st.body.runId, answer: q.type === 'number' ? String(q.answer) : q.answer });
  }
  return last.body.token;
}

test('Katalog, Titel, Banner, Rahmen: nur freigeschaltete waehlbar, Vitrine nur aus eigenen Abzeichen', async () => {
  const A = await mk('kat_a');
  const cat = await get('/api/profile/catalog', A.pt);
  assert.strictEqual(cat.status, 200);
  const byId = (list) => Object.fromEntries(list.map(x => [x.id, x]));
  const t = byId(cat.body.titles), b = byId(cat.body.banners), f = byId(cat.body.frames);
  assert.ok(t.neuling.unlocked && t.tueftler.unlocked && !t.baumeister.unlocked && !t.rangjaeger.unlocked);
  assert.ok(b.ebene.unlocked && !b.nether.unlocked && !b.ozean.unlocked); assert.ok(f.keiner.unlocked && !f.eisen.unlocked);
  assert.deepStrictEqual(cat.body.reactions, ['herz', 'daumen', 'feuer']); assert.ok(cat.body.goals.length >= 6 && cat.body.season.id);
  assert.strictEqual((await ap('/api/profile/update', { title: 'baumeister' }, A.pt)).body.error, 'nicht_freigeschaltet');
  assert.strictEqual((await ap('/api/profile/update', { title: 'erfunden' }, A.pt)).body.error, 'title');
  assert.strictEqual((await ap('/api/profile/update', { banner: 'nether' }, A.pt)).body.error, 'nicht_freigeschaltet');
  assert.strictEqual((await ap('/api/profile/update', { frame: 'gold' }, A.pt)).body.error, 'nicht_freigeschaltet');
  assert.strictEqual((await ap('/api/profile/update', { banner: 'gibtsnicht' }, A.pt)).body.error, 'banner');
  const ok = await ap('/api/profile/update', { title: 'neuling', banner: 'wueste', frame: 'keiner' }, A.pt);
  assert.deepStrictEqual([ok.body.me.title, ok.body.me.banner, ok.body.me.frame], ['neuling', 'wueste', 'keiner']);
  // Abzeichen schalten Titel frei, Vitrine (max. 3, nur eigene, keine Doppelten)
  const bd = await ap('/api/profile/update', { badges: [{ id: 'craft_master', date: '2026-02-01' }, 'first_correct', 'streak_5', 'mp_round_win'] }, A.pt);
  assert.strictEqual(bd.status, 200);
  assert.strictEqual((await ap('/api/profile/update', { title: 'baumeister' }, A.pt)).body.me.title, 'baumeister');
  for (const bad of [['craft_master', 'first_correct', 'streak_5', 'mp_round_win'], ['fremd'], ['first_correct', 'first_correct'], 'x']) assert.strictEqual((await ap('/api/profile/update', { showcase: bad }, A.pt)).body.error, 'showcase');
  const sc = await ap('/api/profile/update', { showcase: ['streak_5', 'craft_master'] }, A.pt);
  assert.deepStrictEqual(sc.body.me.showcase, [{ id: 'streak_5', date: sc.body.me.showcase[0].date }, { id: 'craft_master', date: '2026-02-01' }]);
  // Vitrine folgt der Sichtbarkeit "badges"; entferntes Abzeichen verschwindet aus der Vitrine
  const B = await mk('kat_b'); await befriend(A, B);
  let v = await get('/api/profile/view?pid=' + A.pid, B.pt); assert.ok(!('showcase' in v.body.profile) && !('awards' in v.body.profile));
  await ap('/api/profile/update', { visibility: { badges: 'friends' } }, A.pt);
  v = await get('/api/profile/view?pid=' + A.pid, B.pt); assert.strictEqual(v.body.profile.showcase.length, 2); assert.strictEqual(v.body.profile.title, 'baumeister');
  const rm = await ap('/api/profile/update', { badges: ['first_correct'] }, A.pt);
  assert.deepStrictEqual(rm.body.me.showcase, []);
  // feed-Sichtbarkeit: nur private/friends
  assert.strictEqual((await ap('/api/profile/update', { visibility: { feed: 'public' } }, A.pt)).status, 400);
  assert.strictEqual((await ap('/api/profile/update', { visibility: { feed: 'friends' } }, A.pt)).body.me.visibility.feed, 'friends');
});

test('Duelle: Einladung, Annehmen, gleiche 10 Fragen, Ergebnisse erst nach beiden Abgaben, Sieger, Revanche, Limits', async () => {
  const A = await mk('duel_a'), B = await mk('duel_b'), C = await mk('duel_c');
  assert.strictEqual((await ap('/api/duels/create', { pid: B.pid }, A.pt)).status, 404, 'nur Freunde');
  await befriend(A, B);
  const cr = await ap('/api/duels/create', { pid: B.pid }, A.pt);
  assert.strictEqual(cr.status, 200); const id = cr.body.duel.id;
  assert.strictEqual(cr.body.duel.status, 'pending'); assert.ok(!cr.body.duel.seed && !cr.body.duel.questionIds, 'Fragen erst nach Annahme');
  assert.strictEqual((await ap('/api/duels/create', { pid: B.pid }, A.pt)).body.error, 'bereits_offen');
  assert.strictEqual((await ap('/api/duels/respond', { id, accept: true }, A.pt)).status, 409, 'nur der Eingeladene');
  assert.strictEqual((await ap('/api/duels/get?id=' + id, {}, C.pt)).status, 404);
  assert.strictEqual((await get('/api/duels/get?id=' + id, C.pt)).status, 404, 'Dritte sehen nichts');
  assert.strictEqual((await ap('/api/duels/result', { id, results: results(5) }, A.pt)).status, 409, 'erst nach Annahme');
  const inc = await get('/api/duels', B.pt); assert.strictEqual(inc.body.incoming.length, 1);
  const acc = await ap('/api/duels/respond', { id, accept: true }, B.pt);
  assert.strictEqual(acc.body.duel.status, 'active');
  const d = acc.body.duel; assert.strictEqual(d.questionIds.length, 10);
  assert.deepStrictEqual(Challenge.select(qs, d.seed).ids, d.questionIds, 'Fragen = MGChallenge.select(seed)');
  assert.deepStrictEqual((await get('/api/duels/get?id=' + id, A.pt)).body.duel.questionIds, d.questionIds, 'beide dieselben');
  // Plausibilitaet
  for (const bad of [results(5).slice(0, 9), results(5, 100), results(5, 700), [{ correct: 'ja', attempts: 1, ms: 1000 }], 'x']) assert.strictEqual((await ap('/api/duels/result', { id, results: bad }, A.pt)).status, 400);
  assert.strictEqual((await ap('/api/duels/result', { id, results: results(5), points: 99999 }, A.pt)).status, 400);
  // A gibt ab, B sieht nur "abgegeben"
  const ra = await ap('/api/duels/result', { id, results: results(7), points: 1200 }, A.pt);
  assert.strictEqual(ra.status, 200); assert.strictEqual(ra.body.duel.status, 'active'); assert.strictEqual(ra.body.duel.mine.submitted, true);
  assert.strictEqual((await ap('/api/duels/result', { id, results: results(7) }, A.pt)).status, 409, 'nur einmal');
  const seenByB = (await get('/api/duels/get?id=' + id, B.pt)).body.duel;
  assert.deepStrictEqual(seenByB.results[A.pid], { submitted: true }); assert.strictEqual(seenByB.results[B.pid], null); assert.strictEqual(seenByB.winner, null);
  const rb = await ap('/api/duels/result', { id, results: results(8, 2000), points: 1400 }, B.pt);
  assert.strictEqual(rb.body.duel.status, 'finished'); assert.strictEqual(rb.body.duel.winner, B.pid);
  assert.strictEqual(rb.body.duel.results[A.pid].correct, 7); assert.strictEqual(rb.body.duel.results[B.pid].correct, 8);
  assert.ok(!JSON.stringify(rb.body).includes('"answer"'), 'keine Loesungen');
  assert.strictEqual((await get('/api/profile/me', B.pt)).body.me.duelWins, 1);
  const lst = await get('/api/duels', A.pt); assert.strictEqual(lst.body.finished.length, 1); assert.strictEqual(lst.body.active.length, 0);
  // Revanche
  const rm = await ap('/api/duels/rematch', { id }, A.pt);
  assert.strictEqual(rm.status, 200); assert.strictEqual(rm.body.duel.status, 'pending'); assert.notStrictEqual(rm.body.duel.id, id);
  // Ablehnen / Zurueckziehen / Blockieren schliesst offene Duelle
  assert.strictEqual((await ap('/api/duels/respond', { id: rm.body.duel.id, accept: false }, B.pt)).body.duel.status, 'declined');
  const c2 = await ap('/api/duels/create', { pid: B.pid }, A.pt);
  assert.strictEqual((await ap('/api/duels/cancel', { id: c2.body.duel.id }, A.pt)).status, 200);
  const c3 = await ap('/api/duels/create', { pid: A.pid }, B.pt); assert.strictEqual(c3.status, 200);
  await ap('/api/profile/block', { pid: A.pid, block: true }, B.pt);
  assert.strictEqual((await get('/api/duels/get?id=' + c3.body.duel.id, A.pt)).status, 404, 'Blockierte sehen kein Duell');
  assert.deepStrictEqual((await get('/api/duels', B.pt)).body.outgoing, []);
});

test('Duelle: Unentschieden/Tiebreak, Ablauf (pending -> expired, active mit einer Abgabe -> fertig), Konto loeschen entfernt Duelle', async () => {
  const A = await mk('dexp_a'), B = await mk('dexp_b'); await befriend(A, B);
  const id = (await ap('/api/duels/create', { pid: B.pid }, A.pt)).body.duel.id;
  await wait(2800);
  assert.strictEqual((await get('/api/duels/get?id=' + id, A.pt)).body.duel.status, 'expired');
  assert.strictEqual((await ap('/api/duels/respond', { id, accept: true }, B.pt)).status, 409);
  const id2 = (await ap('/api/duels/create', { pid: B.pid }, A.pt)).body.duel.id;
  await ap('/api/duels/respond', { id: id2, accept: true }, B.pt);
  await ap('/api/duels/result', { id: id2, results: results(6), points: 900 }, A.pt);
  await wait(2800);
  const fin = (await get('/api/duels/get?id=' + id2, B.pt)).body.duel;
  assert.strictEqual(fin.status, 'finished'); assert.strictEqual(fin.winner, A.pid);
  // Gleichstand: gleiche richtige/Punkte, schnellere Zeit gewinnt, sonst draw
  const C = await mk('dtie_a'), D = await mk('dtie_b'); await befriend(C, D);
  const id3 = (await ap('/api/duels/create', { pid: D.pid }, C.pt)).body.duel.id;
  await ap('/api/duels/respond', { id: id3, accept: true }, D.pt);
  await ap('/api/duels/result', { id: id3, results: results(5, 1500), points: 800 }, C.pt);
  const tie = await ap('/api/duels/result', { id: id3, results: results(5, 1500), points: 800 }, D.pt);
  assert.strictEqual(tie.body.duel.winner, 'draw');
  // Konto loeschen entfernt Duelle
  const id4 = (await ap('/api/duels/create', { pid: D.pid }, C.pt)).body.duel.id;
  assert.strictEqual((await ap('/api/profile/delete', { confirm: 'LOESCHEN' }, D.pt)).status, 200);
  assert.strictEqual((await get('/api/duels/get?id=' + id4, C.pt)).status, 404);
  assert.deepStrictEqual((await get('/api/duels', C.pt)).body.finished, []);
});

test('Freunde-Rangliste: nur geprueftes Ranked, nur freigegebene Bereiche, Woche/Gesamt, eigenes Profil immer', async () => {
  const ta = await rankedRun('lb_a_' + Date.now() + 'abcdef'), tb = await rankedRun('lb_b_' + Date.now() + 'abcdef'), tc = await rankedRun('lb_c_' + Date.now() + 'abcdef');
  const A = await mk('lb_a', ta), B = await mk('lb_b', tb), C = await mk('lb_c', tc), D = await mk('lb_d');
  await befriend(A, B); await befriend(A, C); await befriend(A, D);
  let lb = await get('/api/friends/leaderboard', A.pt);
  assert.strictEqual(lb.status, 200); assert.strictEqual(lb.body.period, 'all');
  assert.deepStrictEqual(lb.body.rows.map(r => r.name), ['lb_a'], 'Freunde ohne Freigabe erscheinen nicht');
  assert.strictEqual(lb.body.hidden, 3);
  assert.ok(lb.body.rows[0].isSelf && lb.body.rows[0].mmr > 0 && lb.body.rows[0].games === 1 && lb.body.rows[0].tier);
  await ap('/api/profile/update', { visibility: { rank: 'friends' } }, B.pt);
  await ap('/api/profile/update', { visibility: { rank: 'public' } }, C.pt);
  await ap('/api/profile/update', { visibility: { rank: 'friends' } }, D.pt);        // D hat keinen gewerteten Lauf
  lb = await get('/api/friends/leaderboard?period=all', A.pt);
  const names = lb.body.rows.map(r => r.name); assert.deepStrictEqual(names.slice().sort(), ['lb_a', 'lb_b', 'lb_c']); assert.strictEqual(lb.body.hidden, 1);
  assert.deepStrictEqual(lb.body.rows.map(r => r.mmr), lb.body.rows.map(r => r.mmr).slice().sort((x, y) => y - x), 'nach MMR sortiert');
  assert.ok(lb.body.rows.every(r => typeof r.weekDelta === 'number' && r.weekRuns === 1));
  const wk = await get('/api/friends/leaderboard?period=week', A.pt);
  assert.strictEqual(wk.body.period, 'week'); assert.deepStrictEqual(wk.body.rows.map(r => r.weekDelta), wk.body.rows.map(r => r.weekDelta).slice().sort((x, y) => y - x));
  // Blockieren: nicht mehr in der Liste
  await ap('/api/profile/block', { pid: C.pid, block: true }, A.pt);
  assert.ok(!(await get('/api/friends/leaderboard', A.pt)).body.rows.some(r => r.name === 'lb_c'));
  assert.strictEqual((await get('/api/friends/leaderboard', 'kaputt')).status, 401);
});
