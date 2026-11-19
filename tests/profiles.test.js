const test = require('node:test');
const assert = require('node:assert');
const { startServer, post } = require('./helpers.js');
const { nameProblem } = require('../lib/profiles.js');

let S;
test.before(async () => { S = await startServer({ PROFILE_CREATE_BURST: '100', PROFILE_SKIN_BURST: '500', PROFILE_RATE_FACTOR: '30' }); });
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
  assert.deepStrictEqual(a.body.me.visibility, { header: 'private', stats: 'private', badges: 'private', rank: 'private', feed: 'private' });
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
  const ok = await authPost('/api/profile/update', { visibility: { stats: 'friends', header: 'public' }, title: 'tueftler', badges: ['first_correct', 'streak_5'], stats: { answered: 120, correct: 90, bestStreak: 12, byCategory: { Redstone: { c: 5, t: 8 } } }, character: 'steve' }, pt);
  assert.strictEqual(ok.status, 200); assert.strictEqual(ok.body.me.visibility.stats, 'friends'); assert.strictEqual(ok.body.me.title, 'tueftler');
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
  assert.strictEqual(v.status, 200); assert.strictEqual(v.body.profile.relation, 'none'); assert.deepStrictEqual(v.body.profile.badges.map(b => b.id), ['first_correct']); assert.ok(!('stats' in v.body.profile) && !('rank' in v.body.profile));
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

test('Profil: Rate-Limits (Code-Suche) und Eingabevalidierung', async () => {
  const S2 = await startServer();
  try {
    const st = await post(S2.url + '/api/ranked/start', { gid: 'ratetest_' + Date.now() + 'abcdef', name: 'T' });
    const pr = await post(S2.url + '/api/profile/create', { token: st.body.token, name: 'rate_user', age14: true });
    const ap = (path, body) => fetch(S2.url + path, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + pr.body.pt }, body: JSON.stringify(body) }).then(async r => ({ status: r.status, body: await r.json().catch(() => null) }));
    let blocked = 0;
    for (let i = 0; i < 25; i++) if ((await ap('/api/profile/lookup', { code: 'AAAA-' + String(1000 + i).slice(0, 4).replace(/[01]/g, 'B') })).status === 429) blocked++;
    assert.ok(blocked >= 3, 'Code-Suche nicht gebremst: ' + blocked);
    assert.strictEqual((await ap('/api/profile/update', 'kaputt')).status, 400);
    assert.strictEqual((await ap('/api/friends/request', {})).status, 404);
    const g = await fetch(S2.url + '/api/profile/view?pid=../../x', { headers: { Authorization: 'Bearer ' + pr.body.pt } });
    assert.strictEqual(g.status, 404);
  } finally { S2.stop(); }
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


// ── Skin und erweiterte Statistik ────────────────────────────────────────────────
const PNGLIB = require('../tools/png.js');
const qsAll = require('../questions.json');
const mkPng = (w, h, noise) => { const px = new Uint8Array(w * h * 4); const rnd = require('crypto').randomBytes(w * h * 4); for (let i = 0; i < w * h; i++) { px[i * 4] = noise ? rnd[i * 4] : (i % w) * 4; px[i * 4 + 1] = noise ? rnd[i * 4 + 1] : 120; px[i * 4 + 2] = noise ? rnd[i * 4 + 2] : 60; px[i * 4 + 3] = noise ? rnd[i * 4 + 3] : 255; } return PNGLIB.encode({ w, h, px }); };
const url = (buf) => 'data:image/png;base64,' + buf.toString('base64');
function chunk(type, data) { const b = Buffer.alloc(12 + data.length); b.writeUInt32BE(data.length, 0); b.write(type, 4, 'latin1'); data.copy(b, 8); b.writeUInt32BE(PNGLIB.crc32(b.subarray(4, 8 + data.length)), 8 + data.length); return b; }

test('Skin: gueltige PNGs (64x64, 64x32) werden normalisiert gespeichert, ungueltige abgelehnt, alter Skin bleibt', async () => {
  const A = await mk('skin_a'); const pt = A.body.pt;
  const good = url(mkPng(64, 64));
  const r = await authPost('/api/profile/skin', { skin: good }, pt);
  assert.strictEqual(r.status, 200); assert.ok(/^data:image\/png;base64,/.test(r.body.skin) && /^[0-9a-f]{8}$/.test(r.body.skinV));
  const me = await get('/api/profile/me', pt);
  assert.strictEqual(me.body.me.skin, r.body.skin); assert.strictEqual(me.body.me.skinV, r.body.skinV);
  const back = PNGLIB.decode(Buffer.from(me.body.me.skin.split(',')[1], 'base64')); assert.deepStrictEqual([back.w, back.h], [64, 64]);
  assert.strictEqual((await authPost('/api/profile/skin', { skin: url(mkPng(64, 32)) }, pt)).status, 200, '64x32');
  const png = mkPng(64, 64);
  const crcBad = Buffer.from(png); crcBad[crcBad.length - 20] ^= 0xff;
  const withText = Buffer.concat([png.subarray(0, 33), chunk('tEXt', Buffer.from('Comment-geheim')), png.subarray(33)]);
  const cases = [[url(mkPng(32, 32)), 'skin_masse'], [url(mkPng(128, 128)), 'skin_masse'], ['data:image/png;base64,AAAA', 'skin_png'], ['http://example.org/skin.png', 'skin_png'], [url(crcBad), 'skin_png'], [url(withText), 'skin_png'],
    [url(mkPng(64, 64, true)), 'skin_groesse'], [png.toString('base64'), 'skin_png'], ['data:image/gif;base64,' + png.toString('base64'), 'skin_png'], [12345, 'skin_png']];
  for (const [skin, err] of cases) { const x = await authPost('/api/profile/skin', { skin }, pt); assert.strictEqual(x.status, 400, err); assert.strictEqual(x.body.error, err); }
  const before = (await get('/api/profile/me', pt)).body.me.skin;
  const up = await authPost('/api/profile/update', { skin: url(mkPng(10, 10)), title: 'tueftler' }, pt);
  assert.strictEqual(up.status, 200); assert.strictEqual(up.body.skinError, 'skin_masse'); assert.strictEqual(up.body.me.title, 'tueftler'); assert.strictEqual(up.body.me.skin, before);
  const rm = await authPost('/api/profile/update', { skin: null }, pt);
  assert.strictEqual(rm.body.me.skin, null); assert.strictEqual(rm.body.me.skinV, null);
});

test('Skin: Auslieferung nur nach Sichtbarkeit (Freunde immer, Fremde nur bei oeffentlichem Kopf), Freundesliste, Blockieren, Export, Loeschen', async () => {
  const A = await mk('skinv_a'), B = await mk('skinv_b'), C = await mk('skinv_c');
  const sk = url(mkPng(64, 64));
  assert.strictEqual((await authPost('/api/profile/skin', { skin: sk }, A.body.pt)).status, 200);
  const pidA = A.body.me.pid;
  assert.strictEqual((await get('/api/profile/skin?pid=' + pidA, C.body.pt)).status, 404);
  await authPost('/api/profile/update', { visibility: { header: 'public' } }, A.body.pt);
  let v = await get('/api/profile/view?pid=' + pidA, C.body.pt);
  assert.ok(v.body.profile.skin && v.body.profile.skinV);
  assert.ok((await get('/api/profile/skin?pid=' + pidA, C.body.pt)).body.skin);
  await authPost('/api/profile/update', { visibility: { header: 'private' } }, A.body.pt);
  assert.strictEqual((await get('/api/profile/view?pid=' + pidA, C.body.pt)).status, 404);
  await authPost('/api/friends/request', { code: A.body.me.friendCode }, B.body.pt);
  const pidB = (await get('/api/friends', A.body.pt)).body.incoming[0].pid;
  await authPost('/api/friends/respond', { pid: pidB, accept: true }, A.body.pt);
  v = await get('/api/profile/view?pid=' + pidA, B.body.pt); assert.ok(v.body.profile.skin);
  assert.strictEqual((await get('/api/profile/skin?pid=' + pidA, B.body.pt)).body.skin, v.body.profile.skin);
  let fl = (await get('/api/friends', B.body.pt)).body.friends[0];
  assert.deepStrictEqual([fl.name, !!fl.skinV, 'skin' in fl, 'lastSeenDay' in fl], ['skinv_a', true, false, false]);
  fl = (await get('/api/friends?skins=1', B.body.pt)).body.friends[0]; assert.ok(fl.skin);
  await authPost('/api/profile/update', { visibility: { stats: 'friends' }, title: 'neuling' }, A.body.pt);
  fl = (await get('/api/friends', B.body.pt)).body.friends[0]; assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(fl.lastSeenDay)); assert.strictEqual(fl.title, 'neuling');
  await authPost('/api/profile/block', { pid: pidB, block: true }, A.body.pt);
  assert.strictEqual((await get('/api/profile/skin?pid=' + pidA, B.body.pt)).status, 404);
  const ex = await get('/api/profile/export', A.body.pt); assert.ok(ex.body.skin && ex.body.profile.skin);
  assert.strictEqual((await authPost('/api/profile/delete', { confirm: 'LOESCHEN' }, A.body.pt)).status, 200);
  const again = await post(S.url + '/api/profile/create', { token: A.token, name: 'skinv_a', age14: true });
  assert.strictEqual(again.body.me.skin, null, 'nach dem Loeschen ist kein Skin mehr vorhanden');
});

test('Skin: Rate-Limit fuer Uploads (Standard 6)', async () => {
  const S2 = await startServer();
  try {
    const st = await post(S2.url + '/api/ranked/start', { gid: 'skinrate_' + Date.now() + 'abcdef', name: 'T' });
    const pr = await post(S2.url + '/api/profile/create', { token: st.body.token, name: 'skin_rate', age14: true });
    let limited = 0;
    for (let i = 0; i < 9; i++) { const r = await fetch(S2.url + '/api/profile/skin', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + pr.body.pt }, body: JSON.stringify({ skin: url(mkPng(64, 64)) }) }); if (r.status === 429) limited++; }
    assert.ok(limited >= 2, 'Skin-Uploads nicht gebremst: ' + limited);
  } finally { S2.stop(); }
});

test('Statistik: Grenzen, Summen, nicht sinkend, nicht unplausibel schnell, Abzeichen mit Datum', async () => {
  const A = await mk('stats_a'); const pt = A.body.pt;
  const base = { answered: 100, correct: 70, bestStreak: 9, dailyStreak: 4, blitzBest: 4200, hlBest: 7, hardcoreBest: 5, challengeBest: 8, byCategory: { Redstone: { c: 5, t: 8 }, Mobs: { c: 20, t: 30 } } };
  const ok = await authPost('/api/profile/update', { stats: base, badges: [{ id: 'first_correct', date: '2026-01-05' }, 'streak_5'] }, pt);
  assert.strictEqual(ok.status, 200); assert.strictEqual(ok.body.me.stats.hlBest, 7);
  assert.deepStrictEqual(ok.body.me.badges.map(b => b.id), ['first_correct', 'streak_5']); assert.strictEqual(ok.body.me.badges[0].date, '2026-01-05'); assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(ok.body.me.badges[1].date));
  const bad = [{ answered: 10, correct: 11, bestStreak: 1 }, { answered: 10, correct: 5, bestStreak: 11 }, Object.assign({}, base, { dailyStreak: 4000 }), Object.assign({}, base, { challengeBest: 11 }), Object.assign({}, base, { hlBest: 10001 }),
    Object.assign({}, base, { answered: 150, correct: 100, byCategory: { Redstone: { c: 5, t: 90 }, Mobs: { c: 20, t: 70 } } }), Object.assign({}, base, { answered: 150, correct: 100, byCategory: { Redstone: { c: 90, t: 91 }, Mobs: { c: 20, t: 30 } } }),
    Object.assign({}, base, { answered: 150, correct: 100, byCategory: { Unbekannt: { c: 1, t: 1 } } }), Object.assign({}, base, { answered: 1.5 }), 'x', null];
  for (const stats of bad) assert.strictEqual((await authPost('/api/profile/update', { stats }, pt)).status, 400, JSON.stringify(stats).slice(0, 60));
  assert.strictEqual((await authPost('/api/profile/update', { stats: Object.assign({}, base, { answered: 90, correct: 60 }) }, pt)).body.error, 'stats_niedriger');
  assert.strictEqual((await authPost('/api/profile/update', { stats: Object.assign({}, base, { hlBest: 3 }) }, pt)).body.error, 'stats_niedriger');
  assert.strictEqual((await authPost('/api/profile/update', { stats: Object.assign({}, base, { answered: 9000, correct: 8000 }) }, pt)).body.error, 'stats_plausibel');
  const inc = await authPost('/api/profile/update', { stats: { answered: 400, correct: 280, bestStreak: 12 } }, pt);
  assert.strictEqual(inc.status, 200); assert.strictEqual(inc.body.me.stats.hlBest, 7, 'fehlende Felder behalten den alten Wert');
  for (const badges of [[{ id: 'x1', date: '2999-01-01' }], [{ id: 'x1', date: '2020-01-01' }], [{ id: 'Gross' }], [{ id: 'ok', date: 'gestern' }], Array.from({ length: 41 }, (_, i) => 'b' + i), 'kaputt']) assert.strictEqual((await authPost('/api/profile/update', { badges }, pt)).status, 400, JSON.stringify(badges).slice(0, 50));
});

test('Rang: MMR-Verlauf (letzte 30 Laeufe) kommt aus der geprueften Rangliste und folgt der Sichtbarkeit', async () => {
  const gid = 'hist_' + Date.now() + 'abcdef';
  const st = await post(S.url + '/api/ranked/start', { gid, name: 'Hist' });
  let last;
  for (let i = 0; i < 10; i++) {
    const nx = await post(S.url + '/api/ranked/next', { runId: st.body.runId });
    const q = qsAll.find(x => x.id === nx.body.question.id);
    await new Promise(r => setTimeout(r, 600));
    last = await post(S.url + '/api/ranked/answer', { runId: st.body.runId, answer: q.type === 'number' ? String(q.answer) : q.answer });
  }
  assert.strictEqual(last.body.runDone, true);
  const pr = await post(S.url + '/api/profile/create', { token: last.body.token, name: 'hist_user', age14: true });
  const pt = pr.body.pt;
  const me = await get('/api/profile/me', pt);
  assert.ok(me.body.me.rank && me.body.me.rank.games === 1 && me.body.me.rank.history.length === 1);
  assert.deepStrictEqual(Object.keys(me.body.me.rank.history[0]).sort(), ['correct', 'day', 'delta', 'mmr', 'total']);
  const other = await mk('hist_other');
  assert.strictEqual((await get('/api/profile/view?pid=' + pr.body.me.pid, other.body.pt)).status, 404, 'privat');
  await authPost('/api/profile/update', { visibility: { header: 'public', rank: 'public' } }, pt);
  const v = await get('/api/profile/view?pid=' + pr.body.me.pid, other.body.pt);
  assert.ok(v.body.profile.rank && v.body.profile.rank.history.length === 1 && !('stats' in v.body.profile));
});
