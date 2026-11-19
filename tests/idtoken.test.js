const test = require('node:test');
const assert = require('node:assert');
const { startServer, post } = require('./helpers.js');
const idToken = require('../lib/idtoken.js');
const PNGLIB = require('../tools/png.js');

const wait = (ms) => new Promise(r => setTimeout(r, ms));
const UID_A = 'googleUidAlice1234567890abcd', UID_B = 'googleUidBob1234567890abcdef';
const skinUrl = () => { const px = new Uint8Array(64 * 64 * 4); for (let i = 0; i < 64 * 64; i++) { px[i * 4] = (i % 64) * 4; px[i * 4 + 1] = 90; px[i * 4 + 2] = 40; px[i * 4 + 3] = 255; } return 'data:image/png;base64,' + PNGLIB.encode({ w: 64, h: 64, px }).toString('base64'); };

test('ID-Token-Pruefer: Einheit (Mock-Pruefer, ungueltige Eingaben, ohne Admin nicht verfuegbar)', async () => {
  assert.strictEqual(idToken.available(), false, 'ohne ENV und ohne Pruefer nicht verfuegbar');
  assert.strictEqual(await idToken.verify('egal'), null);
  idToken.setVerifier(async (t) => (t === 'gut' ? { uid: 'abc123def456' } : null));
  try {
    assert.strictEqual(idToken.available(), true);
    assert.deepStrictEqual(await idToken.verify('gut'), { uid: 'abc123def456' });
    assert.strictEqual(await idToken.verify('schlecht'), null);
    assert.strictEqual(await idToken.verify(12345), null); assert.strictEqual(await idToken.verify('x'.repeat(5000)), null);
  } finally { idToken.setVerifier(null); }
  assert.strictEqual(idToken.available(), false);
});

test('Google-Konto: Kennung kommt aus dem geprueften ID-Token, uid-Behauptung ohne Token wird abgelehnt, Fremde koennen kein Profil uebernehmen', async () => {
  const S = await startServer({ ID_TOKEN_VERIFIER: 'test', PROFILE_RATE_FACTOR: '30', PROFILE_CREATE_BURST: '50' });
  try {
    const h = await (await fetch(S.url + '/health')).json(); assert.strictEqual(h.idCheck, 'on');
    const ap = (path, body, pt) => fetch(S.url + path, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + pt }, body: JSON.stringify(body) }).then(async r => ({ status: r.status, body: await r.json().catch(() => null) }));
    const get = (path, pt) => fetch(S.url + path, { headers: { Authorization: 'Bearer ' + pt } }).then(async r => ({ status: r.status, body: await r.json().catch(() => null) }));
    // uid nur behauptet: abgelehnt; kaputtes Token: abgelehnt
    assert.strictEqual((await post(S.url + '/api/ranked/start', { uid: UID_A, name: 'A' })).status, 401);
    assert.strictEqual((await post(S.url + '/api/ranked/start', { uid: UID_A, idToken: 'test:' + UID_B.slice(0, 3), name: 'A' })).status, 401);
    assert.strictEqual((await post(S.url + '/api/ranked/start', { idToken: 'kein-token', name: 'A' })).status, 401);
    // Geraet A: Anmeldung mit ID-Token, Profil anlegen, Skin, Vitrine, Freund
    const a1 = await post(S.url + '/api/ranked/start', { idToken: 'test:' + UID_A, name: 'Alice' });
    assert.strictEqual(a1.status, 200); assert.strictEqual(a1.body.idVerified, true);
    const pr = await post(S.url + '/api/profile/create', { token: a1.body.token, name: 'alice_g', age14: true });
    assert.strictEqual(pr.status, 200); assert.strictEqual(pr.body.me.accountKind, 'verified');
    const skin = skinUrl();
    assert.strictEqual((await ap('/api/profile/update', { skin, title: 'tueftler', badges: [{ id: 'first_correct', date: '2026-03-01' }], showcase: ['first_correct'] }, pr.body.pt)).status, 200);
    const bob = await post(S.url + '/api/ranked/start', { idToken: 'test:' + UID_B, name: 'Bob' });
    const bp = await post(S.url + '/api/profile/create', { token: bob.body.token, name: 'bob_g', age14: true });
    await ap('/api/friends/request', { code: pr.body.me.friendCode }, bp.body.pt);
    await ap('/api/friends/respond', { pid: bp.body.me.pid, accept: true }, pr.body.pt);
    // Geraet B (neues Geraet, andere gid, nur Google-Anmeldung): gleiches Profil samt Skin, Freunden, Vitrine
    const a2 = await post(S.url + '/api/ranked/start', { gid: 'anderes_geraet_' + Date.now() + 'abcdef', idToken: 'test:' + UID_A, uid: 'ignoriert_oder_gleich_abcdef', name: 'Alice' });
    assert.strictEqual(a2.status, 200); assert.strictEqual(a2.body.idVerified, true);
    const login = await post(S.url + '/api/profile/login', { token: a2.body.token });
    assert.strictEqual(login.status, 200); assert.strictEqual(login.body.me.pid, pr.body.me.pid); assert.strictEqual(login.body.me.accountKind, 'verified');
    const me = (await get('/api/profile/me', login.body.pt)).body.me;
    assert.strictEqual(me.skin, (await get('/api/profile/me', pr.body.pt)).body.me.skin); assert.ok(me.skin.startsWith('data:image/png;base64,'));
    assert.deepStrictEqual(me.showcase.map(x => x.id), ['first_correct']); assert.strictEqual(me.title, 'tueftler');
    const fr = (await get('/api/friends', login.body.pt)).body.friends; assert.deepStrictEqual(fr.map(f => f.name), ['bob_g']);
    // Fremder mit anderem Token kann Alices Profil nicht bekommen; Behauptung "uid=A" mit Bobs Token zaehlt nicht
    const evil = await post(S.url + '/api/ranked/start', { uid: UID_A, idToken: 'test:' + UID_B, name: 'Evil' });
    assert.strictEqual(evil.status, 200);
    const evilLogin = await post(S.url + '/api/profile/login', { token: evil.body.token });
    assert.strictEqual(evilLogin.body.me.pid, bp.body.me.pid, 'Kennung stammt aus dem Token (Bob), nicht aus der behaupteten uid (Alice)');
    // Gast: nur dieses Geraet
    const g = await post(S.url + '/api/ranked/start', { gid: 'gast_' + Date.now() + 'abcdef', name: 'G' });
    assert.strictEqual(g.body.idVerified, false);
    const gp = await post(S.url + '/api/profile/create', { token: g.body.token, name: 'gast_profil', age14: true });
    assert.strictEqual(gp.body.me.accountKind, 'device');
  } finally { S.stop(); }
});

test('Ohne Admin-Zugang: uid wird ungeprueft uebernommen (ehrlich: "unverified"), /health meldet idCheck off', async () => {
  const S = await startServer({ PROFILE_RATE_FACTOR: '30' });
  try {
    assert.strictEqual((await (await fetch(S.url + '/health')).json()).idCheck, 'off');
    const st = await post(S.url + '/api/ranked/start', { uid: UID_A, name: 'A' });
    assert.strictEqual(st.status, 200); assert.strictEqual(st.body.idVerified, false);
    const pr = await post(S.url + '/api/profile/create', { token: st.body.token, name: 'unver_a', age14: true });
    assert.strictEqual(pr.body.me.accountKind, 'unverified');
    // gleiche uid auf anderem Geraet: gleiches Profil (aber nicht bewiesen!)
    const st2 = await post(S.url + '/api/ranked/start', { uid: UID_A, name: 'A' });
    assert.strictEqual((await post(S.url + '/api/profile/login', { token: st2.body.token })).body.me.pid, pr.body.me.pid);
  } finally { S.stop(); }
});
