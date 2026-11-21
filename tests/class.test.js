const test = require('node:test');
const assert = require('node:assert');
const { io } = require('socket.io-client');
const { startServer } = require('./helpers.js');
const qs = require('../questions.json');
const { NAMES } = require('../lib/classnames.js');

const wait = (ms) => new Promise(r => setTimeout(r, ms));
function client(url) {
  const s = io(url, { transports: ['websocket'] }); s.ev = [];
  s.onAny((e, d) => s.ev.push([e, d]));
  s.all = (e) => s.ev.filter(x => x[0] === e).map(x => x[1]);
  s.last = (e) => { const a = s.all(e); return a[a.length - 1]; };
  s.until = async (e, ms, from) => { for (let i = 0; i < (ms || 8000) / 50; i++) { const a = s.all(e); if (a.length > (from || 0)) return a[a.length - 1]; await wait(50); } return undefined; };
  return s;
}
const solve = (q) => (q.type === 'number' ? String(q.answer) : q.answer);
const wrong = (q) => (q.choices ? q.choices.find(c => c !== q.answer) : (q.type === 'number' ? String(Math.abs(q.answer) * 100 + 99999) : 'Voellig Falsch QQ'));

test('Klassenraum: Namensliste fest (eindeutige Namen, <= 16 Zeichen)', () => {
  assert.ok(NAMES.length >= 40); assert.strictEqual(new Set(NAMES).size, NAMES.length);
  NAMES.forEach(n => assert.ok(n.length <= 16 && /^[A-Za-zÄÖÜäöüß]+$/.test(n), n));
});

test('Klassenraum: Ablauf (Lehrkraft nicht im Spiel, Namen nur aus der Liste, Start nur durch Lehrkraft, Report/Export ohne Personenbezug, Kick ohne IP-Bann)', async () => {
  const S = await startServer({ MP_TEST_FAST: '1' });
  const all = [];
  const mk = () => { const c = client(S.url); all.push(c); return c; };
  try {
    const t = mk(); await wait(400);
    t.emit('create_class', { rounds: 2, tf: 'only' });
    const cc = await t.until('class_created'); assert.ok(cc, 'kein class_created');
    assert.match(cc.code, /^[A-HJ-NP-Z2-9]{6}$/); assert.strictEqual(cc.max, 30); assert.strictEqual(cc.settings.isClass, true); assert.strictEqual(cc.settings.tf, 'only'); assert.ok(cc.names.length >= 40); assert.strictEqual(cc.idleMinutes, 240);
    // Schueler
    const a = mk(), b = mk(), c3 = mk(); await wait(400);
    a.emit('class_info', { code: cc.code.toLowerCase() }); const inf = await a.until('class_info'); assert.ok(inf.ok && inf.free.length === NAMES.length && inf.count === 0);
    a.emit('join_class', { code: cc.code, name: 'Creeper' }); const ja = await a.until('joined'); assert.strictEqual(ja.playerName, 'Creeper'); assert.strictEqual(ja.settings.isClass, true);
    b.emit('join_class', { code: cc.code, name: 'Creeper' }); const e1 = await b.until('join_error'); assert.strictEqual(e1.code, 'name_taken');
    b.emit('join_class', { code: cc.code, name: 'Max Mustermann' }); await wait(200); assert.strictEqual(b.all('join_error').pop().code, 'name');
    b.emit('join_class', { code: cc.code }); const jb = await b.until('joined'); assert.ok(NAMES.includes(jb.playerName) && jb.playerName !== 'Creeper');
    assert.ok(!jb.players.some(p => p.id === jb.hostId), 'Lehrkraft im Roster');
    // normale Beitritte in den Klassenraum sind nicht moeglich
    c3.emit('join_room', { roomId: cc.code, playerName: 'Freitext Name' }); const e2 = await c3.until('join_error'); assert.match(e2.message, /nicht gefunden/);
    c3.emit('join_class', { code: 'ZZZZZZ' }); await wait(200); assert.strictEqual(c3.last('join_error').code, 'notfound');
    // Schueler koennen nicht starten (Auto-Start bei "bereit" ist aus), Lehrkraft schon
    a.emit('player_ready'); b.emit('player_ready'); a.emit('class_start'); await wait(2200);
    assert.strictEqual(a.all('question').length, 0, 'Spiel startete ohne Lehrkraft');
    t.emit('class_start'); const q0 = await t.until('question', 8000); assert.ok(q0, 'Lehrkraft-Start ohne Frage');
    // Beitritt waehrend des Spiels nicht
    const late = mk(); await wait(300); late.emit('join_class', { code: cc.code }); assert.strictEqual((await late.until('join_error')).code, 'running');
    // zwei Runden spielen: a richtig, b falsch
    for (let k = 0; k < 2; k++) {
      const qd = k === 0 ? q0 : await t.until('question', 8000, k); const q = qs.find(x => x.id === qd.id); assert.strictEqual(q.fmt, 'tf'); assert.deepStrictEqual(qd.options, ['Wahr', 'Mythos']);
      a.emit('buzz'); await a.until('answer_phase', 5000, k);
      a.emit('submit_answer', { answer: solve(q) }); b.emit('submit_answer', { answer: wrong(q) });
      await t.until('result', 8000, k);
    }
    const go = await t.until('game_over', 8000); assert.ok(go);
    assert.ok(go.scores.length === 2 && !go.scores.some(p => p.id === jb.hostId));
    t.emit('get_host_report'); const hr = await t.until('host_report'); assert.strictEqual(hr.rounds, 2); assert.deepStrictEqual(hr.players.map(p => p.name).sort(), [ja.playerName, jb.playerName].sort());
    // Export: nur Tiernamen/Zahlen, kein Personenbezug
    t.emit('class_export'); const ex = await t.until('class_export'); assert.ok(ex.ok && ex.students.length === 2 && ex.questions.length === 2);
    assert.ok(ex.students.every(s => NAMES.includes(s.name)) && ex.questions.every(q => q.hitPct === 50), JSON.stringify(ex.questions));
    assert.match(ex.csv, /^Name;Antworten;Richtig;Trefferquote %;Punkte\r\n/);
    a.emit('class_export'); await wait(250); assert.strictEqual(a.all('class_export').length, 0, 'Export nur fuer die Lehrkraft');
    // Kick: Schueler fliegt raus, kann (gleiche IP) sofort wieder rein
    t.emit('kick_player', { id: ja.playerId }); assert.ok(await a.until('kicked', 3000)); await wait(300);
    a.emit('class_info', { code: cc.code }); await a.until('class_info', 2000, 1);
    // Lehrkraft schliesst den Raum
    t.emit('class_close'); assert.ok(await b.until('class_closed', 3000)); await wait(200);
    c3.emit('join_class', { code: cc.code }); await wait(250); assert.strictEqual(c3.last('join_error').code, 'notfound');
  } finally { all.forEach(c => c.close()); S.stop(); }
});

test('Klassenraum: Obergrenze 30, Lehrkraft-Reconnect, Auto-Loeschung nach Inaktivitaet', async () => {
  const S = await startServer({ MP_TEST_FAST: '1', CLASS_IDLE_MS: '3000', CLASS_SWEEP_MS: '300' });
  const all = [];
  const mk = () => { const c = client(S.url); all.push(c); return c; };
  try {
    const base = (await (await fetch(S.url + '/health')).json()).rooms;
    const t = mk(); await wait(400); t.emit('create_class', {}); const cc = await t.until('class_created');
    assert.strictEqual((await (await fetch(S.url + '/health')).json()).rooms, base + 1);
    const kids = []; for (let i = 0; i < 31; i++) kids.push(mk()); await wait(900);
    for (const kid of kids) kid.emit('join_class', { code: cc.code });
    await wait(1800);
    const joined = kids.filter(k => k.all('joined').length), full = kids.filter(k => k.all('join_error').some(e => e.code === 'full'));
    assert.strictEqual(joined.length, 30); assert.strictEqual(full.length, 1);
    assert.strictEqual(new Set(joined.map(k => k.last('joined').playerName)).size, 30, 'doppelte Namen');
    // Lehrkraft verbindet neu: Token noetig
    const t2 = mk(); await wait(300);
    t2.emit('class_rejoin', { code: cc.code, token: 'x'.repeat(32) }); await wait(250); assert.strictEqual(t2.last('class_denied').reason, 'notfound');
    t2.emit('class_rejoin', { code: cc.code, token: cc.token }); const rj = await t2.until('class_created', 3000); assert.ok(rj, JSON.stringify(t2.ev.map(x => x[0]))); assert.ok(rj.rejoined);
    t2.emit('class_start'); assert.ok(await t2.until('question', 6000), 'Start nach Reconnect');
    // Inaktivitaet: alle trennen, warten -> Raum weg
    all.forEach(c => c.close()); await wait(5000);
    const late = mk(); await wait(400); late.emit('join_class', { code: cc.code }); const e = await late.until('join_error'); assert.strictEqual(e.code, 'notfound');
    const h = await (await fetch(S.url + '/health')).json(); assert.strictEqual(h.rooms, base, 'Klassenraum nicht geloescht');
  } finally { all.forEach(c => c.close()); S.stop(); }
});
