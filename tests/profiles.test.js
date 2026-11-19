const test = require('node:test');
const assert = require('node:assert');
const { startServer, post } = require('./helpers.js');
const { nameProblem } = require('../lib/profiles.js');

let S;
test.before(async () => { S = await startServer({ PROFILE_CREATE_BURST: '100' }); });
test.after(() => { if (S) S.stop(); });

const get = async (path, pt) => { const r = await fetch(S.url + path, { headers: pt ? { Authorization: 'Bearer ' + pt } : {} }); let j = null; try { j = await r.json(); } catch (e) {} return { status: r.status, body: j }; };
const authPost = (path, body, pt) => fetch(S.url + path, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + pt }, body: JSON.stringify(body) }).then(async r => ({ status: r.status, body: await r.json().catch(() => null) }));
let n = 0;
async function rankedToken() { const gid = 'prof_' + Date.now() + '_' + (n++) + 'abcdef'; const st = await post(S.url + '/api/ranked/start', { gid, name: 'T' }); return st.body.token; }
async function mk(name, extra) {
  const token = await rankedToken();
  const r = await post(S.url + '/api/profile/create', Object.assign({ token, name, age14: true }, extra || {}));
  return Object.assign({ token }, r);
}

test('Profil: Name-Regeln (Format, reserviert, Wortfilter, Leetspeak)', () => {
  assert.strictEqual(nameProblem('steve_xl'), null);
  ['ab', 'a'.repeat(17), 'Gross', 'mit leer', 'aeä', '12345', '___'].forEach(x => assert.ok(nameProblem(x), x));
  ['admin', 'mojang', 'minecraft'].forEach(x => assert.strictEqual(nameProblem(x), 'reserviert'));
  ['n4zi', 'f-u-c-k', 'sch31ss3', 'hitler99'].forEach(x => assert.ok(nameProblem(x), x));
});

test('Profil: Einwilligung 14+ Pflicht, Token Pflicht, Standard alles privat, kein Freitext, doppelter Name/Konto abgelehnt', async () => {
  const token = await rankedToken();
  assert.strictEqual((await post(S.url + '/api/profile/create', { token, name: 'kein_haken' })).status, 403);
  assert.strictEqual((await post(S.url + '/api/profile/create', { token, name: 'kein_haken', age14: 'true' })).status, 403);
  assert.strictEqual((await post(S.url + '/api/profile/create', { token: 'x.y', name: 'kein_token', age14: true })).status, 401);
  assert.strictEqual((await post(S.url + '/api/profile/create', { token, name: 'Admin', age14: true })).status, 400);
  const a = await post(S.url + '/api/profile/create', { token, name: 'steve_1', age14: true, bio: 'Freitext', email: 'a@b.de' });
  assert.strictEqual(a.status, 200); assert.ok(a.body.pt && a.body.me.friendCode.length === 9);
  assert.deepStrictEqual(a.body.me.visibility, { header: 'private', stats: 'private', badges: 'private', rank: 'private' });
  assert.strictEqual(a.body.me.consent.age14, true); assert.ok(a.body.me.consent.at > 0);
  assert.ok(!('bio' in a.body.me) && !JSON.stringify(a.body.me).includes('a@b.de'));
  assert.strictEqual((await post(S.url + '/api/profile/create', { token, name: 'steve_2', age14: true })).status, 409);       // ein Konto je Schluessel
  const b = await mk('steve_1'); assert.strictEqual(b.status, 409);                                                           // Name vergeben
  const login = await post(S.url + '/api/profile/login', { token });
  assert.strictEqual(login.status, 200); assert.strictEqual(login.body.me.name, 'steve_1');
  assert.strictEqual((await get('/api/profile/me')).status, 401);
  assert.strictEqual((await get('/api/profile/me', 'kaputt')).status, 401);
  assert.strictEqual((await get('/api/profile/me', token)).status, 401, 'Ranked-Token ist kein Profil-Token');
});

test('Profil: aendern (Sichtbarkeit, Titel-Katalog, Statistik-Validierung, Umbenennen nur alle 30 Tage)', async () => {
  const a = await mk('upd_user');
  const pt = a.body.pt;
  const bad = [{ visibility: { header: 'alle' } }, { visibility: { foo: 'public' } }, { title: 'Frei erfundener Titel' }, { badges: ['A B'] }, { stats: { answered: 5, correct: 9, bestStreak: 1 } }, { stats: { answered: -1, correct: 0, bestStreak: 0 } }, { character: '../x' }, { name: 'nazi_1' }];
  for (const x of bad) assert.strictEqual((await authPost('/api/profile/update', x, pt)).status, 400, JSON.stringify(x));
  const ok = await authPost('/api/profile/update', { visibility: { stats: 'friends', header: 'public' }, title: 'baumeister', badges: ['first_correct', 'streak_5'], stats: { answered: 120, correct: 90, bestStreak: 12, byCategory: { Redstone: { c: 5, t: 8 } } }, character: 'steve' }, pt);
  assert.strictEqual(ok.status, 200); assert.strictEqual(ok.body.me.visibility.stats, 'friends'); assert.strictEqual(ok.body.me.title, 'baumeister');
  const unknownCat = await authPost('/api/profile/update', { stats: { answered: 1, correct: 1, bestStreak: 1, byCategory: { Unbekannt: { c: 1, t: 1 } } } }, pt);
  assert.strictEqual(unknownCat.status, 400);
  assert.strictEqual((await authPost('/api/profile/update', { name: 'upd_user2' }, pt)).status, 200);
  assert.strictEqual((await authPost('/api/profile/update', { name: 'upd_user3' }, pt)).status, 429, 'zweites Umbenennen binnen 30 Tagen');
  const oldCode = ok.body.me.friendCode;
  const nc = await authPost('/api/profile/update', { newCode: true }, pt);
  assert.notStrictEqual(nc.body.me.friendCode, oldCode);
});

test('Freunde: Freundescode, Anfrage, Bestaetigung, Sichtbarkeit je Bereich, Blockieren, Entfernen', async () => {
  const A = await mk('freund_a'), B = await mk('freund_b'), C = await mk('freund_c');
  await authPost('/api/profile/update', { visibility: { stats: 'friends', badges: 'public', rank: 'private', header: 'public' }, badges: ['first_correct'], stats: { answered: 10, correct: 7, bestStreak: 3 } }, A.body.pt);
  const codeA = A.body.me.friendCode;
  // Suche nur ueber Code
  assert.strictEqual((await authPost('/api/profile/lookup', { code: 'ZZZZ-ZZZZ' }, B.body.pt)).status, 404);
  const look = await authPost('/api/profile/lookup', { code: codeA.toLowerCase().replace('-', ' ') }, B.body.pt);
  assert.strictEqual(look.status, 200); assert.strictEqual(look.body.user.name, 'freund_a'); assert.deepStrictEqual(Object.keys(look.body.user).sort(), ['character', 'name', 'pid']);
  const pidA = look.body.user.pid;
  assert.strictEqual((await authPost('/api/profile/lookup', { code: B.body.me.friendCode }, B.body.pt)).status, 404, 'eigener Code');
  // Fremder (C) sieht oeffentliche Bereiche, aber nicht friends-Bereiche
  let v = await get('/api/profile/view?pid=' + pidA, C.body.pt);
  assert.strictEqual(v.status, 200); assert.strictEqual(v.body.profile.relation, 'none'); assert.deepStrictEqual(v.body.profile.badges, ['first_correct']); assert.ok(!('stats' in v.body.profile) && !('rank' in v.body.profile));
  // Anfrage
  const rq = await authPost('/api/friends/request', { code: codeA }, B.body.pt);
  assert.deepStrictEqual([rq.status, rq.body.status], [200, 'pending']);
  assert.strictEqual((await authPost('/api/friends/request', { code: codeA }, B.body.pt)).body.status, 'pending', 'doppelte Anfrage');
  let fa = await get('/api/friends', A.body.pt); assert.deepStrictEqual(fa.body.incoming.map(x => x.name), ['freund_b']);
  assert.strictEqual((await authPost('/api/friends/respond', { pid: 'aaaaaaaaaa', accept: true }, A.body.pt)).status, 404);
  const pidB = fa.body.incoming[0].pid;
  assert.strictEqual((await authPost('/api/friends/respond', { pid: pidB, accept: true }, A.body.pt)).status, 200);
  fa = await get('/api/friends', A.body.pt); assert.deepStrictEqual(fa.body.friends.map(x => x.name), ['freund_b']);
  // Freund sieht friends-Bereiche
  v = await get('/api/profile/view?pid=' + pidA, B.body.pt);
  assert.strictEqual(v.body.profile.relation, 'friend'); assert.strictEqual(v.body.profile.stats.answered, 10);
  // Blockieren beendet Freundschaft und versteckt das Profil
  assert.strictEqual((await authPost('/api/profile/block', { pid: pidB, block: true }, A.body.pt)).status, 200);
  assert.strictEqual((await get('/api/profile/view?pid=' + pidA, B.body.pt)).status, 404);
  assert.deepStrictEqual((await get('/api/friends', B.body.pt)).body.friends, []);
  assert.strictEqual((await authPost('/api/friends/request', { code: codeA }, B.body.pt)).status, 404, 'Blockierte koennen nichts anfragen');
  assert.strictEqual((await authPost('/api/profile/lookup', { code: codeA }, B.body.pt)).status, 404);
  assert.strictEqual((await authPost('/api/profile/block', { pid: pidB, block: false }, A.body.pt)).status, 200);
  // beide fragen gleichzeitig an -> sofort Freunde; Entfernen
  assert.strictEqual((await authPost('/api/friends/request', { code: codeA }, B.body.pt)).body.status, 'pending');
  const codeB = (await get('/api/profile/me', B.body.pt)).body.me.friendCode;
  assert.strictEqual((await authPost('/api/friends/request', { code: codeB }, A.body.pt)).body.status, 'friends');
  assert.strictEqual((await authPost('/api/friends/remove', { pid: pidB }, A.body.pt)).status, 200);
  assert.deepStrictEqual((await get('/api/friends', B.body.pt)).body.friends, []);
  // per pid nur als Antwort auf eine Anfrage (kein Durchsuchen)
  assert.strictEqual((await authPost('/api/friends/request', { pid: pidA }, C.body.pt)).status, 404);
});

test('Datenschutz: Export (Auskunft), Loeschen entfernt Profil, Freundschaften, Namen, Ranglisten-Name', async () => {
  const A = await mk('loesch_a'), B = await mk('loesch_b');
  await authPost('/api/friends/request', { code: A.body.me.friendCode }, B.body.pt);
  const pidB = (await get('/api/friends', A.body.pt)).body.incoming[0].pid;
  await authPost('/api/friends/respond', { pid: pidB, accept: true }, A.body.pt);
  const ex = await get('/api/profile/export', A.body.pt);
  assert.strictEqual(ex.status, 200); assert.strictEqual(ex.body.profile.name, 'loesch_a'); assert.deepStrictEqual(ex.body.friends.map(f => f.name), ['loesch_b']);
  assert.strictEqual((await authPost('/api/profile/delete', {}, A.body.pt)).status, 400, 'ohne Bestaetigung');
  assert.strictEqual((await authPost('/api/profile/delete', { confirm: 'LOESCHEN' }, A.body.pt)).status, 200);
  assert.strictEqual((await get('/api/profile/me', A.body.pt)).status, 401, 'Token zeigt auf geloeschtes Profil');
  assert.deepStrictEqual((await get('/api/friends', B.body.pt)).body.friends, []);
  assert.strictEqual((await post(S.url + '/api/profile/login', { token: A.token })).status, 404);
  const again = await post(S.url + '/api/profile/create', { token: A.token, name: 'loesch_a', age14: true });
  assert.strictEqual(again.status, 200, 'Name und Konto sind nach dem Loeschen wieder frei');
});

test('Profil: Rate-Limits (Anlegen je IP, Code-Suche), Eingabevalidierung', async () => {
  const T = await mk('rate_user');
  let blocked = 0;
  for (let i = 0; i < 25; i++) if ((await authPost('/api/profile/lookup', { code: 'AAAA-' + String(1000 + i).slice(0, 4).replace(/[01]/g, 'B') }, T.body.pt)).status === 429) blocked++;
  assert.ok(blocked >= 3, 'Code-Suche nicht gebremst: ' + blocked);
  assert.strictEqual((await authPost('/api/profile/update', 'kaputt', T.body.pt)).status, 400);
  assert.strictEqual((await authPost('/api/friends/request', {}, T.body.pt)).status, 404);
  assert.strictEqual((await get('/api/profile/view?pid=../../x', T.body.pt)).status, 404);
});

test('Profil: Anlegen je IP begrenzt (Standard 5)', async () => {
  const S2 = await startServer();
  try {
    let limited = 0;
    for (let i = 0; i < 8; i++) {
      const st = await post(S2.url + '/api/ranked/start', { gid: 'lim_' + Date.now() + '_' + i + 'abcdef', name: 'T' });
      const r = await post(S2.url + '/api/profile/create', { token: st.body.token, name: 'lim_user' + i, age14: true });
      if (r.status === 429) limited++;
    }
    assert.ok(limited >= 2, 'Limit greift nicht: ' + limited);
  } finally { S2.stop(); }
});
