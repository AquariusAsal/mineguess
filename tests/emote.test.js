const test = require('node:test');
const assert = require('node:assert');
const { io } = require('socket.io-client');
const { startServer, post } = require('./helpers.js');

const wait = (ms) => new Promise(r => setTimeout(r, ms));
function client(url) {
  const s = io(url, { transports: ['websocket'] }); s.ev = [];
  s.onAny((e, d) => s.ev.push([e, d]));
  s.all = (e) => s.ev.filter(x => x[0] === e).map(x => x[1]);
  s.last = (e) => { const a = s.all(e); return a[a.length - 1]; };
  s.until = async (e, ms, from) => { for (let i = 0; i < (ms || 5000) / 50; i++) { const a = s.all(e); if (a.length > (from || 0)) return a[a.length - 1]; await wait(50); } return undefined; };
  return s;
}
async function room(S, n, env) {
  const cs = []; for (let i = 0; i < n; i++) cs.push(client(S.url)); await wait(400);
  cs[0].emit('create_room', { playerName: 'Host', rounds: 10 }); const j = await cs[0].until('joined');
  for (let i = 1; i < n; i++) { cs[i].emit('join_room', { roomId: j.roomId, playerName: 'Gast' + i }); await cs[i].until('joined'); }
  return { cs, rid: j.roomId, joined: j };
}

test('Emote: feste ID-Liste, Broadcast an alle (auch Absender), Rate-Limit 1 je 1,5 s mit Burst 3, nichts anderes wird akzeptiert', async () => {
  const S = await startServer();
  const all = [];
  try {
    const { cs, joined } = await room(S, 3); all.push(...cs);
    assert.strictEqual(joined.settings.emotes, 'on'); assert.strictEqual(joined.settings.fpv, 'off');
    cs[1].emit('emote', { id: 'dance' }); await wait(250);
    cs.forEach(c => { const e = c.last('emote'); assert.ok(e && e.id === 'dance' && e.pid === cs[1].id, 'Broadcast fehlt'); });
    for (const bad of ['e01', 'e24', 'WAVE', 'hallo', '', 7, null, { x: 1 }]) { const n = cs[2].all('emote_denied').length; cs[2].emit('emote', { id: bad }); await wait(80); assert.strictEqual(cs[2].all('emote_denied').length, n + 1, 'ungueltige ID akzeptiert: ' + JSON.stringify(bad)); assert.strictEqual(cs[2].last('emote_denied').reason, 'id'); }
    cs[2].emit('emote', 'kaputt'); await wait(80);
    // Burst 3, dann Sperre
    const c0 = cs[0]; const start = c0.all('emote').length;
    for (let i = 0; i < 6; i++) c0.emit('emote', { id: 'wave' });
    await wait(400);
    const got = c0.all('emote').length - start, denied = c0.all('emote_denied').filter(d => d.reason === 'rate').length;
    assert.ok(got >= 3 && got <= 4 && denied >= 2, 'Rate-Limit: ' + got + '/' + denied);
    await wait(1700); c0.emit('emote', { id: 'cheer' }); await wait(200); assert.strictEqual(c0.last('emote').id, 'cheer', 'nach Wartezeit wieder erlaubt');
  } finally { all.forEach(c => c.close()); S.stop(); }
});

test('Emote: Host-Schalter emotes on/off (ungueltiger Wert abgelehnt), nur der Host darf, Klassenraum Standard aus', async () => {
  const S = await startServer({ MP_TEST_FAST: '1' });
  const all = [];
  try {
    const { cs } = await room(S, 2); all.push(...cs);
    cs[1].emit('update_settings', { emotes: 'off' }); await wait(150); assert.strictEqual(cs[1].last('settings_denied').reason, 'host');
    cs[0].emit('update_settings', { emotes: 'vielleicht' }); await wait(150); assert.strictEqual(cs[0].last('settings_denied').reason, 'emotes');
    cs[0].emit('update_settings', { emotes: 'off' }); await wait(200); assert.strictEqual(cs[1].last('settings_updated').emotes, 'off');
    cs[1].emit('emote', { id: 'clap' }); await wait(150); assert.strictEqual(cs[1].last('emote_denied').reason, 'off'); assert.strictEqual(cs[0].all('emote').length, 0);
    cs[0].emit('update_settings', { emotes: 'on' }); await wait(200); cs[1].emit('emote', { id: 'clap' }); await wait(200); assert.strictEqual(cs[0].last('emote').id, 'clap');
    // Klassenraum
    const t = client(S.url), k = client(S.url); all.push(t, k); await wait(400);
    t.emit('create_class', { rounds: 2 }); const cc = await t.until('class_created'); assert.strictEqual(cc.settings.emotes, 'off');
    k.emit('join_class', { code: cc.code }); await k.until('joined'); k.emit('emote', { id: 'wave' }); await wait(200); assert.strictEqual(k.last('emote_denied').reason, 'off');
    t.emit('update_settings', { emotes: 'on' }); await wait(200); k.emit('emote', { id: 'wave' }); await wait(250);
    assert.ok(k.last('emote') && k.last('emote').id === 'wave' && t.last('emote') && t.last('emote').id === 'wave', 'Lehrkraft aktiviert Emotes');
  } finally { all.forEach(c => c.close()); S.stop(); }
});

test('Emote: geblockte Profil-Nutzer sehen und senden keine Emotes untereinander (andere schon)', async () => {
  const S = await startServer();
  const all = [];
  try {
    const mk = async (name) => { const st = await post(S.url + '/api/ranked/start', { gid: 'em_' + name + Date.now() + 'abcdefgh', name }); const pr = await post(S.url + '/api/profile/create', { token: st.body.token, name: 'em_' + name, age14: true }); return pr.body; };
    const [A, B] = [await mk('anna'), await mk('bert')];
    const { cs } = await room(S, 3); all.push(...cs);
    cs[0].emit('profile_auth', { pt: A.pt }); cs[1].emit('profile_auth', { pt: B.pt }); await cs[0].until('profile_auth_ok'); await cs[1].until('profile_auth_ok');
    const bl = await fetch(S.url + '/api/profile/block', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + A.pt }, body: JSON.stringify({ pid: B.me.pid, block: true }) }); assert.ok((await bl.json()).ok);
    cs[1].emit('emote', { id: 'wow' }); await wait(300);
    assert.strictEqual(cs[0].all('emote').length, 0, 'Geblockter erreicht den Blockierenden');
    assert.ok(cs[2].last('emote') && cs[2].last('emote').id === 'wow', 'Dritte sehen es');
    cs[0].emit('emote', { id: 'sad' }); await wait(300);
    assert.strictEqual(cs[1].all('emote').filter(e => e.id === 'sad').length, 0, 'Blockierender erreicht den Geblockten');
    assert.ok(cs[2].all('emote').some(e => e.id === 'sad'));
  } finally { all.forEach(c => c.close()); S.stop(); }
});

test('FPV: Raum-Einstellung off|allowed|all, Einverstaendnis je Spieler, pose nur mit Zustimmung, Wertebereich und Rate-Limit', async () => {
  const S = await startServer();
  const all = [];
  try {
    const { cs } = await room(S, 3); all.push(...cs);
    cs[0].emit('update_settings', { fpv: 'immer' }); await wait(150); assert.strictEqual(cs[0].last('settings_denied').reason, 'fpv');
    cs[1].emit('update_settings', { fpv: 'all' }); await wait(150); assert.strictEqual(cs[1].last('settings_denied').reason, 'host');
    // off: pose wird ignoriert, fpv_respond abgelehnt
    cs[1].emit('pose', { yaw: 10, pitch: 5 }); cs[1].emit('fpv_respond', { accept: true }); await wait(200);
    assert.strictEqual(cs[2].all('pose').length, 0); assert.strictEqual(cs[1].last('fpv_denied').reason, 'off');
    // all: Angebot an alle ausser dem Host
    cs[0].emit('update_settings', { fpv: 'all' }); await wait(300);
    assert.ok(cs[1].last('fpv_offer') && cs[2].last('fpv_offer') && !cs[0].last('fpv_offer'), 'Angebot an Mitspieler');
    assert.strictEqual(cs[1].last('settings_updated').fpv, 'all');
    // ohne Zustimmung keine Pose
    cs[1].emit('pose', { yaw: 10, pitch: 5 }); await wait(200); assert.strictEqual(cs[2].all('pose').length, 0, 'Pose ohne Zustimmung');
    // Zustimmung von 1, Ablehnung von 2
    cs[1].emit('fpv_respond', { accept: true }); cs[2].emit('fpv_respond', { accept: false }); await wait(300);
    assert.deepStrictEqual(cs[0].last('fpv_state').on, [cs[1].id]);
    cs[1].emit('pose', { yaw: 10.04, pitch: -5.55 }); await wait(250);
    const p = cs[2].last('pose'); assert.ok(p && p.pid === cs[1].id && p.yaw === 10 && Math.abs(p.pitch + 5.5) < 0.2, JSON.stringify(p)); assert.strictEqual(cs[1].all('pose').length, 0, 'kein Echo');
    // ungueltige Werte
    const n = cs[0].all('pose').length;
    for (const bad of [{ yaw: 181, pitch: 0 }, { yaw: 0, pitch: 91 }, { yaw: 'a', pitch: 0 }, { yaw: NaN, pitch: 0 }, { yaw: 0 }, null, 'x']) { await wait(100); cs[1].emit('pose', bad); }
    await wait(300); assert.strictEqual(cs[0].all('pose').length, n, 'ungueltige Pose akzeptiert');
    // Rate-Limit: 30 Nachrichten sofort -> hoechstens ein Bruchteil
    const before = cs[0].all('pose').length; for (let i = 0; i < 30; i++) cs[1].emit('pose', { yaw: i, pitch: 0 }); await wait(400);
    assert.ok(cs[0].all('pose').length - before <= 8, 'Rate-Limit pose: ' + (cs[0].all('pose').length - before));
    // allowed: freiwillig ohne Angebot; off loescht alle Zustimmungen
    cs[0].emit('update_settings', { fpv: 'off' }); await wait(250); assert.deepStrictEqual(cs[0].last('fpv_state').on, []);
    cs[0].emit('update_settings', { fpv: 'allowed' }); await wait(250); assert.strictEqual(cs[1].all('fpv_offer').length, 1, 'allowed: kein neues Angebot');
    cs[2].emit('fpv_respond', { accept: true }); await wait(250); assert.deepStrictEqual(cs[0].last('fpv_state').on, [cs[2].id]);
  } finally { all.forEach(c => c.close()); S.stop(); }
});

test('Emote: emotes.json (24 Emotes, 3 Seiten a 8, DE/EN) ist die einzige Quelle: Server akzeptiert genau diese IDs, Datei wird ausgeliefert', async () => {
  const L = require('../emotes.json');
  assert.strictEqual(L.emotes.length, 24); assert.strictEqual(L.pages.length, 3);
  assert.strictEqual(new Set(L.emotes.map(e => e.id)).size, 24);
  L.emotes.forEach((e, i) => { assert.ok(/^[a-z]+$/.test(e.id) && e.de && e.en && e.symbol && e.ms >= 1000 && e.page === Math.floor(i / 8) + 1 && e.slot === i % 8 + 1, e.id); });
  const S = await startServer(); const all = [];
  try {
    const r = await fetch(S.url + '/emotes.json'); assert.strictEqual(r.status, 200); assert.strictEqual((await r.json()).emotes[0].id, 'wave');
    const { cs } = await room(S, 2); all.push(...cs);
    for (const e of L.emotes) { await wait(1600); cs[0].emit('emote', { id: e.id }); await wait(120); assert.strictEqual(cs[1].last('emote').id, e.id, e.id); }
  } finally { all.forEach(c => c.close()); S.stop(); }
});
