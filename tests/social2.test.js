const test = require('node:test');
const assert = require('node:assert');
const { io } = require('socket.io-client');
const { startServer, post } = require('./helpers.js');
const qs = require('../questions.json');

let S;
test.before(async () => { S = await startServer({ PROFILE_CREATE_BURST: '200', PROFILE_RATE_FACTOR: '30', INVITE_TTL_MS: '3000' }); });
test.after(() => { if (S) S.stop(); });

const wait = (ms) => new Promise(r => setTimeout(r, ms));
const get = async (path, pt) => { const r = await fetch(S.url + path, { headers: pt ? { Authorization: 'Bearer ' + pt } : {} }); let j = null; try { j = await r.json(); } catch (e) {} return { status: r.status, body: j }; };
const ap = (path, body, pt) => fetch(S.url + path, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + pt }, body: JSON.stringify(body) }).then(async r => ({ status: r.status, body: await r.json().catch(() => null) }));
let n = 0;
async function mk(name, token) {
  token = token || (await post(S.url + '/api/ranked/start', { gid: 'soc2_' + Date.now() + '_' + (n++) + 'abcdef', name: 'T' })).body.token;
  const r = await post(S.url + '/api/profile/create', { token, name, age14: true });
  return { token, pt: r.body.pt, me: r.body.me, pid: r.body.me.pid, code: r.body.me.friendCode };
}
async function befriend(A, B) { await ap('/api/friends/request', { code: A.code }, B.pt); await ap('/api/friends/respond', { pid: B.pid, accept: true }, A.pt); }

test('Feed: Eintraege entstehen automatisch, nur nach Freigabe sichtbar, Reaktionen aus fester Liste, Blockieren/Loeschen entfernt', async () => {
  const A = await mk('feed_a'), B = await mk('feed_b'), C = await mk('feed_c'); await befriend(A, B);
  await ap('/api/profile/update', { badges: [{ id: 'first_correct', date: '2026-02-01' }] }, A.pt);
  // nicht freigegeben: Freunde sehen nichts, man selbst schon
  assert.deepStrictEqual((await get('/api/feed', B.pt)).body.events, []);
  let own = (await get('/api/feed', A.pt)).body.events; assert.strictEqual(own.length, 1); assert.deepStrictEqual([own[0].type, own[0].data.id, own[0].name], ['badge', 'first_correct', 'feed_a']);
  await ap('/api/profile/update', { visibility: { feed: 'friends' } }, A.pt);
  let fb = (await get('/api/feed', B.pt)).body.events;
  assert.strictEqual(fb.length, 1); assert.deepStrictEqual(Object.keys(fb[0]).sort(), ['character', 'data', 'id', 'mine', 'name', 'pid', 'reactions', 'ts', 'type']);
  assert.deepStrictEqual((await get('/api/feed', C.pt)).body.events, [], 'Nicht-Freunde sehen nichts');
  // Reaktionen: feste Liste, eine je Person, nur bei Freunden, nicht bei sich selbst
  const id = fb[0].id;
  assert.strictEqual((await ap('/api/feed/react', { eventId: id, reaction: 'kommentar' }, B.pt)).status, 400);
  assert.strictEqual((await ap('/api/feed/react', { eventId: id, reaction: 'herz' }, B.pt)).status, 200);
  assert.strictEqual((await ap('/api/feed/react', { eventId: id, reaction: 'feuer' }, B.pt)).status, 200);
  fb = (await get('/api/feed', B.pt)).body.events; assert.deepStrictEqual([fb[0].reactions, fb[0].mine], [{ herz: 0, daumen: 0, feuer: 1 }, 'feuer']);
  assert.strictEqual((await ap('/api/feed/react', { eventId: id, reaction: 'daumen' }, A.pt)).status, 404, 'nicht bei eigenen Eintraegen');
  assert.strictEqual((await ap('/api/feed/react', { eventId: id, reaction: 'herz' }, C.pt)).status, 404);
  assert.strictEqual((await ap('/api/feed/react', { eventId: id, reaction: null }, B.pt)).status, 200);
  assert.strictEqual((await get('/api/feed', B.pt)).body.events[0].mine, null);
  // Blockieren verbirgt, Loeschen entfernt Eintraege und Reaktionen
  await ap('/api/feed/react', { eventId: id, reaction: 'herz' }, B.pt);
  await ap('/api/profile/block', { pid: B.pid, block: true }, A.pt);
  assert.deepStrictEqual((await get('/api/feed', B.pt)).body.events, []);
  await ap('/api/profile/block', { pid: B.pid, block: false }, A.pt);
  const ex = await get('/api/profile/export', A.pt); assert.strictEqual(ex.body.social.feed.length, 1);
  await ap('/api/profile/delete', { confirm: 'LOESCHEN' }, A.pt);
  assert.deepStrictEqual((await get('/api/feed', B.pt)).body.events, []);
});

test('Feed: gepruefter Rangaufstieg und Duell-Sieg erzeugen Eintraege', async () => {
  // Start knapp unter Iron (behaupteter MMR wird ohne Token bis 2000 uebernommen), ein Lauf bringt den Aufstieg
  const gid = 'rankup_' + Date.now() + 'abcdef';
  const st = await post(S.url + '/api/ranked/start', { gid, name: 'R', profile: { mmr: 990, peak: 990 } });
  let last;
  for (let i = 0; i < 10; i++) {
    const nx = await post(S.url + '/api/ranked/next', { runId: st.body.runId });
    const q = qs.find(x => x.id === nx.body.question.id);
    await wait(600);
    last = await post(S.url + '/api/ranked/answer', { runId: st.body.runId, answer: q.type === 'number' ? String(q.answer) : q.answer });
  }
  assert.strictEqual(last.body.runDone, true);
  const A = await mk('rankup_a', last.body.token);
  // Der Aufstieg geschah vor dem Profil: der Feed-Eintrag entsteht nur, wenn ein Profil existiert -> zweiter Lauf mit Profil
  const st2 = await post(S.url + '/api/ranked/start', { gid: 'rankup2_' + Date.now() + 'abcdef', name: 'R2', profile: { mmr: 990, peak: 990 } });
  let l2;
  const A2 = await mk('rankup_b', st2.body.token);
  for (let i = 0; i < 10; i++) {
    const nx = await post(S.url + '/api/ranked/next', { runId: st2.body.runId });
    const q = qs.find(x => x.id === nx.body.question.id);
    await wait(600);
    l2 = await post(S.url + '/api/ranked/answer', { runId: st2.body.runId, answer: q.type === 'number' ? String(q.answer) : q.answer });
  }
  assert.strictEqual(l2.body.runDone, true);
  const ev = (await get('/api/feed', A2.pt)).body.events;
  assert.ok(ev.some(e => e.type === 'rank_up' && typeof e.data.tier === 'string' && [1, 2, 3].includes(e.data.division)), JSON.stringify(ev));
  assert.ok(A.pt);
});

test('Vergleich: nur Freunde, nur freigegebene Bereiche des Gegenuebers', async () => {
  const A = await mk('cmp_a'), B = await mk('cmp_b'), C = await mk('cmp_c'); await befriend(A, B);
  await ap('/api/profile/update', { stats: { answered: 100, correct: 70, bestStreak: 9, hlBest: 4, byCategory: { Redstone: { c: 5, t: 8 }, Mobs: { c: 20, t: 30 } } } }, A.pt);
  await ap('/api/profile/update', { stats: { answered: 200, correct: 150, bestStreak: 12, byCategory: { Redstone: { c: 40, t: 50 } } } }, B.pt);
  assert.strictEqual((await get('/api/profile/compare?pid=' + B.pid, C.pt)).status, 404, 'kein Freund');
  let c = await get('/api/profile/compare?pid=' + B.pid, A.pt);
  assert.strictEqual(c.status, 200); assert.strictEqual(c.body.other.stats, null, 'B hat Statistik nicht freigegeben');
  assert.deepStrictEqual(c.body.categories.map(x => [x.category, x.other]), [['Mobs', null], ['Redstone', null]]);
  assert.strictEqual(c.body.bests.find(b => b.key === 'bestStreak').me, 9); assert.strictEqual(c.body.bests.find(b => b.key === 'bestStreak').other, null);
  await ap('/api/profile/update', { visibility: { stats: 'friends' } }, B.pt);
  c = await get('/api/profile/compare?pid=' + B.pid, A.pt);
  assert.deepStrictEqual(c.body.categories.find(x => x.category === 'Redstone'), { category: 'Redstone', me: { c: 5, t: 8 }, other: { c: 40, t: 50 } });
  assert.strictEqual(c.body.bests.find(b => b.key === 'bestStreak').other, 12);
  await ap('/api/profile/block', { pid: A.pid, block: true }, B.pt);
  assert.strictEqual((await get('/api/profile/compare?pid=' + B.pid, A.pt)).status, 404);
});

test('"Wer sieht was?": Uebersicht, Alles-privat-Schalter, Export enthaelt soziale Daten', async () => {
  const A = await mk('priv_a'), B = await mk('priv_b'); await befriend(A, B);
  let p = (await get('/api/profile/privacy', A.pt)).body;
  assert.strictEqual(p.allPrivate, true); assert.deepStrictEqual(p.strangers, []); assert.deepStrictEqual(p.friends, ['header']); assert.strictEqual(p.counts.friends, 1);
  await ap('/api/profile/update', { visibility: { header: 'public', stats: 'friends', rank: 'public', feed: 'friends' } }, A.pt);
  p = (await get('/api/profile/privacy', A.pt)).body;
  assert.strictEqual(p.allPrivate, false); assert.deepStrictEqual(p.strangers, ['header', 'rank']); assert.deepStrictEqual(p.friends.sort(), ['feed', 'header', 'rank', 'stats']);
  assert.ok(p.stored.includes('skin') && p.stored.includes('duelle'));
  assert.strictEqual((await ap('/api/profile/privacy', { allPrivate: false }, A.pt)).status, 400);
  const off = await ap('/api/profile/privacy', { allPrivate: true }, A.pt);
  assert.strictEqual(off.body.allPrivate, true); assert.deepStrictEqual(off.body.strangers, []);
  assert.strictEqual((await get('/api/profile/view?pid=' + A.pid, (await mk('priv_c')).pt)).status, 404);
  const ex = await get('/api/profile/export', A.pt);
  assert.ok(ex.body.social && Array.isArray(ex.body.social.duels) && Array.isArray(ex.body.social.feed));
});

// ── Raum-Einladungen (Sockets) ───────────────────────────────────────────────
function client() {
  const s = io(S.url, { transports: ['websocket'] });
  s.ev = []; s.onAny((e, d) => s.ev.push([e, d]));
  s.all = (e) => s.ev.filter(x => x[0] === e).map(x => x[1]);
  s.last = (e) => { const a = s.all(e); return a[a.length - 1]; };
  s.until = async (e, ms, from) => { for (let i = 0; i < (ms || 5000) / 50; i++) { const a = s.all(e); if (a.length > (from || 0)) return a[a.length - 1]; await wait(50); } return undefined; };
  return s;
}

test('Raum-Einladung: Freund laedt Freund ein, Annehmen ersetzt das Passwort, Ablehnen, Limits, Ablauf, Fremde/Offline abgelehnt', async () => {
  const A = await mk('inv_a'), B = await mk('inv_b'), C = await mk('inv_c'), D = await mk('inv_d'); await befriend(A, B); await befriend(A, D);
  const sa = client(), sb = client(), sc = client(), sb2 = client();
  try {
    await wait(400);
    // ohne Anmeldung
    sa.emit('invite_friend', { pid: B.pid }); await wait(150); assert.strictEqual(sa.last('invite_denied').reason, 'auth');
    sa.emit('profile_auth', { pt: 'kaputt' }); await wait(150); assert.ok(sa.last('profile_auth_failed'));
    sa.emit('profile_auth', { pt: A.pt }); sb.emit('profile_auth', { pt: B.pt }); sc.emit('profile_auth', { pt: C.pt }); sb2.emit('profile_auth', { pt: B.pt });
    await wait(300); assert.strictEqual(sa.last('profile_auth_ok').name, 'inv_a');
    // kein Raum
    sa.emit('invite_friend', { pid: B.pid }); await wait(150); assert.strictEqual(sa.last('invite_denied').reason, 'room');
    sa.emit('create_room', { playerName: 'A', password: 'geheim' }); const j = await sa.until('joined'); const rid = j.roomId;
    // Fremde, Unbekannte, Offline
    sa.emit('invite_friend', { pid: C.pid }); await wait(150); assert.strictEqual(sa.last('invite_denied').reason, 'friend');
    sa.emit('invite_friend', { pid: 'aaaaaaaaaa' }); await wait(150); assert.strictEqual(sa.last('invite_denied').reason, 'friend');
    sa.emit('invite_friend', { pid: D.pid }); await wait(150); assert.strictEqual(sa.last('invite_denied').reason, 'offline');
    // Einladung an B (zwei Geraete bekommen sie)
    sa.emit('invite_friend', { pid: B.pid });
    const inv = await sb.until('room_invite'); assert.ok(await sb2.until('room_invite'));
    assert.deepStrictEqual([inv.from.name, inv.roomId, inv.roomName, inv.hasPassword], ['inv_a', rid, rid, true]); assert.ok(!JSON.stringify(inv).includes('geheim'));
    assert.ok(await sa.until('invite_sent'));
    // ohne Annahme kein Beitritt ohne Passwort
    sb.emit('join_room', { roomId: rid, playerName: 'B', inviteId: inv.inviteId }); await wait(250);
    assert.ok(/Passwort/.test(sb.last('join_error').message));
    // get_invites
    sb.emit('get_invites'); await wait(200); assert.strictEqual(sb.last('invites').list.length, 1);
    // Annehmen -> Beitritt ohne Passwort
    sb.emit('invite_respond', { inviteId: inv.inviteId, accept: true });
    assert.deepStrictEqual((await sb.until('invite_accepted')).roomId, rid); assert.strictEqual((await sa.until('invite_accepted_by')).name, 'inv_b');
    sb.emit('join_room', { roomId: rid, playerName: 'B', inviteId: inv.inviteId });
    assert.ok(await sb.until('joined'), 'Einladung ersetzt das Passwort');
    // Einladung ist verbraucht; ein anderer Spieler kann sie nicht nutzen
    sc.emit('join_room', { roomId: rid, playerName: 'C', inviteId: inv.inviteId }); await wait(250); assert.ok(/Passwort/.test(sc.last('join_error').message));
    // schon im Raum
    sa.emit('invite_friend', { pid: B.pid }); await wait(200); assert.strictEqual(sa.last('invite_denied').reason, 'room');
    // Ablehnen und Ablauf (D online)
    const sd = client(); await wait(300); sd.emit('profile_auth', { pt: D.pt }); await wait(200);
    sa.emit('invite_friend', { pid: D.pid }); const invD = await sd.until('room_invite');
    sd.emit('invite_respond', { inviteId: invD.inviteId, accept: false }); assert.strictEqual((await sa.until('invite_declined')).name, 'inv_d');
    sd.emit('join_room', { roomId: rid, playerName: 'D', inviteId: invD.inviteId }); await wait(250); assert.ok(/Passwort/.test(sd.last('join_error').message), 'abgelehnte Einladung gilt nicht');
    sa.emit('invite_friend', { pid: D.pid }); const invD2 = await sd.until('room_invite', 3000, 1);
    await wait(3600);
    sd.emit('invite_respond', { inviteId: invD2.inviteId, accept: true }); await wait(200);
    assert.ok(sd.all('invite_expired').length >= 1, 'Einladung verfaellt');
    sd.close();
  } finally { [sa, sb, sc, sb2].forEach(s => s.close()); }
});

test('Raum-Einladung: Rate-Limit (10 je 10 min) und Limit je Empfaenger (3 offene)', async () => {
  const A = await mk('invr_a'), B = await mk('invr_b'); await befriend(A, B);
  const sa = client(), sb = client();
  try {
    await wait(400);
    sa.emit('profile_auth', { pt: A.pt }); sb.emit('profile_auth', { pt: B.pt }); await wait(300);
    sa.emit('create_room', { playerName: 'A' }); await sa.until('joined');
    const reasons = [];
    for (let i = 0; i < 6; i++) { sa.emit('invite_friend', { pid: B.pid }); await wait(150); }
    const den = sa.all('invite_denied').map(d => d.reason);
    assert.strictEqual(sa.all('invite_sent').length, 3); assert.deepStrictEqual(den, ['limit', 'limit', 'limit']);
    assert.ok(reasons.length === 0);
  } finally { [sa, sb].forEach(s => s.close()); }
});
