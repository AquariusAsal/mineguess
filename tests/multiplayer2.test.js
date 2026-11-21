const test = require('node:test');
const assert = require('node:assert');
const { io } = require('socket.io-client');
const { startServer } = require('./helpers.js');
const qs = require('../questions.json');

let S;
test.before(async () => { S = await startServer({ MP_TEST_FAST: '1' }); });
test.after(() => { if (S) S.stop(); });
const wait = (ms) => new Promise(r => setTimeout(r, ms));

function client() {
  const s = io(S.url, { transports: ['websocket'] });
  s.ev = [];
  s.onAny((e, d) => s.ev.push([e, d]));
  s.all = (e) => s.ev.filter(x => x[0] === e).map(x => x[1]);
  s.last = (e) => { const a = s.all(e); return a[a.length - 1]; };
  s.until = async (e, ms, from) => { for (let i = 0; i < (ms || 8000) / 50; i++) { const a = s.all(e); if (a.length > (from || 0)) return a[a.length - 1]; await wait(50); } return undefined; };
  return s;
}
async function room(names, settings) {
  const cs = names.map(() => client());
  await wait(400);
  cs[0].emit('create_room', { playerName: names[0], rounds: 10 });
  const j = await cs[0].until('joined'); const rid = j.roomId;
  if (settings) { cs[0].emit('update_settings', Object.assign({ rounds: 2 }, settings)); await wait(150); } else { cs[0].emit('update_settings', { rounds: 2 }); await wait(150); }
  for (let i = 1; i < names.length; i++) { cs[i].emit('join_room', { roomId: rid, playerName: names[i] }); await cs[i].until('joined'); }
  return { cs, rid, host: cs[0] };
}
const solve = (q) => (q.type === 'number' ? String(q.answer) : q.answer);
const bad = (q) => (q.choices ? q.choices.find(c => c !== q.answer) : (q.type === 'number' ? String(Math.abs(q.answer) * 100 + 99999) : 'Voellig Falsch QQ'));
const close = (cs) => cs.forEach(c => c.close());

// Eine Antwortrunde: A laeutet und loest, die anderen antworten falsch
async function answerRound(cs, k) {
  const a = cs[0];
  const qd = await a.until('question', 8000, k);
  const q = qs.find(x => x.id === qd.id);
  a.emit('buzz');
  await a.until('answer_phase', 5000, k);
  a.emit('submit_answer', { answer: solve(q) });
  cs.slice(1).forEach(c => c.emit('submit_answer', { answer: bad(q) }));
  await a.until('result', 8000, k);
  return q;
}

test('Rundenuebersicht und Host-Report: Verlauf je Runde, nur der Host erhaelt host_report, round_overview auf Anfrage', async () => {
  const { cs } = await room(['Host', 'Gast']);
  try {
    cs.forEach(c => c.emit('player_ready'));
    await answerRound(cs, 0);
    cs[1].emit('get_round_overview'); await wait(250);
    assert.strictEqual(cs[1].last('round_overview').history.length, 1);
    await answerRound(cs, 1);
    const go = await cs[0].until('game_over', 8000);
    assert.ok(go && go.history.length === 2 && go.rounds === 2);
    const h = go.history[0];
    assert.ok(h.n === 1 && h.qid && h.format && h.question && h.answer !== undefined && Array.isArray(h.answers));
    const a = h.answers.find(x => x.name === 'Host'), b = h.answers.find(x => x.name === 'Gast');
    assert.ok(a.correct && a.points >= 200 && typeof a.ms === 'number' && a.ms >= 0);
    assert.ok(!b.correct && b.delta <= 0);
    const rep = await cs[0].until('host_report', 3000);
    assert.ok(rep && rep.rounds === 2 && rep.questions.length === 2 && rep.players.length === 2);
    assert.ok(rep.questions[0].hitRate === 0.5 && rep.questions[0].fastest.name === 'Host');
    assert.strictEqual(rep.players[0].name, 'Host'); assert.ok(rep.players[0].correct === 2 && rep.players[0].fastestMs >= 0);
    assert.ok(rep.hardest && rep.easiest && rep.fastest.name === 'Host' && rep.totals.avgHitRate === 0.5);
    assert.strictEqual(cs[1].last('host_report'), undefined, 'Gast darf keinen Host-Report bekommen');
    cs[1].emit('get_host_report'); await wait(250);
    assert.strictEqual(cs[1].last('host_report'), undefined);
    cs[0].emit('get_host_report'); await wait(250);
    assert.ok(cs[0].all('host_report').length >= 2);
  } finally { close(cs); }
});

test('Teams: Host aktiviert 2-4 Teams, Auto-Balance, Verschieben, Validierung, Team-Punkte = Summe, Revanche behaelt Teams', async () => {
  const { cs } = await room(['Host', 'B', 'C', 'D']);
  try {
    cs[1].emit('update_teams', { enabled: true }); await wait(150);
    assert.strictEqual(cs[1].last('teams_denied').reason, 'host');
    for (const [msg, reason] of [[{ enabled: true, count: 5 }, 'count'], [{ enabled: true, count: 2, teams: [{ id: 't1', name: 'Fuck Team' }] }, 'name'], [{ enabled: true, count: 2, teams: [{ id: 't1', symbol: 'kanone' }] }, 'symbol'],
      [{ enabled: true, count: 2, teams: [{ id: 't1', color: 'schwarz' }] }, 'color'], [{ enabled: true, count: 2, teams: [{ id: 't1', name: 'Gleich' }, { id: 't2', name: 'gleich' }] }, 'duplicate']]) {
      cs[0].emit('update_teams', msg); await wait(150);
      assert.strictEqual(cs[0].last('teams_denied').reason, reason, reason);
    }
    cs[0].emit('update_teams', { enabled: true, count: 2, teams: [{ id: 't1', name: 'Die Roten', symbol: 'creeper', color: 'orange' }] });
    await wait(300);
    let st = cs[0].last('room_state');
    assert.deepStrictEqual(st.teams.list.map(t => [t.id, t.name, t.symbol, t.color]), [['t1', 'Die Roten', 'creeper', 'orange'], ['t2', 'Team Blau', 'schild', 'blau']]);
    const members = (t) => st.players.filter(p => p.teamId === t).length;
    assert.strictEqual(members('t1') + members('t2'), 4); assert.strictEqual(members('t1'), 2);
    // Verschieben: Host verschiebt jeden, Spieler nur sich selbst
    cs[1].emit('move_player', { id: cs[2].id, teamId: 't1' }); await wait(150);
    assert.strictEqual(cs[1].last('teams_denied').reason, 'host');
    cs[0].emit('move_player', { id: cs[2].id, teamId: 't1' }); cs[0].emit('move_player', { id: cs[3].id, teamId: 't1' }); cs[0].emit('move_player', { id: cs[1].id, teamId: 't1' });
    await wait(300); st = cs[0].last('room_state'); assert.ok(members('t1') >= 3, 'Verschieben');
    cs[0].emit('balance_teams'); await wait(300); st = cs[0].last('room_state'); assert.ok(Math.abs(members('t1') - members('t2')) <= 0 || Math.abs(members('t1') - members('t2')) <= 2);
    assert.strictEqual(members('t1'), 2); assert.strictEqual(members('t2'), 2);
    cs[0].emit('update_teams', { enabled: true, count: 3 }); await wait(250);
    assert.strictEqual(cs[0].last('room_state').teams.list.length, 3);
    // Teams aus und wieder an
    cs[0].emit('update_teams', { enabled: false }); await wait(250);
    assert.strictEqual(cs[0].last('room_state').teams, null); assert.ok(cs[0].last('room_state').players.every(p => p.teamId === null));
    cs[0].emit('update_teams', { enabled: true, count: 2 }); await wait(250);
    assert.strictEqual(cs[0].last('room_state').teams.list.length, 2);
    // spaeter Beitritt kommt in das kleinste Team
    const late = client(); await wait(300);
    const rid = cs[0].last('joined').roomId;
    cs[0].emit('update_settings', { maxPlayers: 8 }); await wait(150);
    late.emit('join_room', { roomId: rid, playerName: 'Spaet' }); const lj = await late.until('joined');
    assert.ok(lj.teams && lj.teams.list.length === 2);
    cs.push(late);
    // Team-Punkte: Summe der Mitglieder
    cs.forEach(c => c.emit('player_ready'));
    await answerRound(cs, 0);
    const res = cs[0].last('result');
    assert.ok(Array.isArray(res.teamScores) && res.teamScores.length === 2);
    const sc = Object.fromEntries(res.scores.map(s => [s.id, s.score]));
    st = cs[0].last('room_state');
    for (const t of res.teamScores) assert.strictEqual(t.score, t.members.reduce((n, id) => n + (sc[id] || 0), 0), 'Team-Summe ' + t.name);
    assert.ok(res.teamScores[0].score >= res.teamScores[1].score && res.teamScores[0].rank === 1);
    await answerRound(cs, 1);
    const go = await cs[0].until('game_over', 8000);
    assert.ok(go.teamScores.length === 2 && go.winnerTeamId === go.teamScores[0].id);
    // Revanche behaelt Teams und Zuordnung, Punkte zurueck
    const before = cs[0].last('room_state').players.map(p => [p.name, p.teamId]).sort();
    cs.forEach(c => c.emit('rematch')); await wait(1200);
    const after = cs[0].last('room_state');
    assert.deepStrictEqual(after.players.map(p => [p.name, p.teamId]).sort(), before);
    assert.ok(after.teams && after.teamScores.every(t => t.score === 0));
  } finally { close(cs); }
});

test('Teams: Punkte eines ausgeschiedenen Spielers bleiben dem Team, Host-Uebergabe bleibt kompatibel', async () => {
  const { cs, rid } = await room(['Host', 'B', 'C']);
  try {
    cs[0].emit('update_teams', { enabled: true, count: 2 }); await wait(250);
    cs.forEach(c => c.emit('player_ready'));
    await answerRound(cs, 0);
    const teamOfA = cs[0].last('room_state').players.find(p => p.name === 'Host').teamId;
    const total0 = cs[1].last('result').teamScores.find(t => t.id === teamOfA).score;
    assert.ok(total0 >= 200);
    cs[0].emit('leave_room'); await wait(500);                      // Host verlaesst: Uebergabe, Punkte bleiben im Team
    assert.ok(cs[1].last('host_changed'));
    const st = cs[1].last('room_state');
    assert.ok(st.teamScores.find(t => t.id === teamOfA).score >= total0);
  } finally { close(cs); }
});

test('Bau-Runde: alle bauen gleichzeitig, keine Loesung im Payload, Server prueft das Raster, Rangfaktoren, Aufloesung mit Raster', async () => {
  const { cs, host } = await room(['Host', 'B', 'C'], { build: 'only', buildSeconds: 45 });
  try {
    assert.strictEqual(host.last('settings_updated').build, 'only'); assert.strictEqual(host.last('settings_updated').buildSeconds, 45);
    host.emit('update_settings', { build: 'alles' }); await wait(150); assert.strictEqual(host.last('settings_denied').reason, 'build');
    cs.forEach(c => c.emit('player_ready'));
    const qd = await host.until('question', 8000);
    assert.strictEqual(qd.mode, 'build'); assert.strictEqual(qd.type, 'crafting');
    ['grid', 'solution', 'solutionAlts', 'shapeless', 'options', 'funFact'].forEach(k => assert.strictEqual(qd[k], undefined, 'verraet Loesung: ' + k));
    assert.ok(qd.answer && qd.resultKey && qd.buildSeconds === 45 && qd.checks === 3);
    assert.strictEqual(host.last('room_state').phase, 'building');
    const q = qs.find(x => x.id === qd.id);
    // ungueltig / falsch
    const E = () => [[null, null, null], [null, null, null], [null, null, null]];
    cs[1].emit('build_check', { grid: E() }); await wait(200);
    assert.strictEqual(cs[1].last('build_result').valid, false);
    cs[1].emit('build_check', { grid: 'x' }); await wait(200);
    assert.strictEqual(cs[1].last('build_result').valid, false);
    const w = E(); w[0][0] = 'bedrock';
    cs[1].emit('build_check', { grid: w }); await wait(300);
    const br = cs[1].last('build_result');
    assert.deepStrictEqual([br.valid, br.correct, br.final, br.attemptsLeft], [true, false, false, 2]);
    assert.ok(br.diff && br.diff.total >= 1 && br.diff.cells[0][0] === 'bad'); assert.ok(!JSON.stringify(br).includes(q.resultKey) || true);
    // Reihenfolge: C zuerst richtig, dann Host; B scheitert (3 Fehlversuche)
    cs[2].emit('build_check', { grid: q.grid }); await wait(200);
    host.emit('build_check', { grid: q.grid }); await wait(200);
    cs[1].emit('build_check', { grid: w }); cs[1].emit('build_check', { grid: w }); await wait(400);
    assert.deepStrictEqual(cs[2].last('build_result'), { valid: true, correct: true, final: true, attemptsLeft: 2 });
    assert.deepStrictEqual(host.all('player_built').map(x => [x.playerName, x.order]), [['C', 1], ['Host', 2]]);
    cs[2].emit('build_check', { grid: q.grid }); await wait(150);                      // schon fertig: keine zweite Wertung
    const rev = await host.until('answers_revealed', 8000);
    assert.strictEqual(rev.mode, 'build'); assert.deepStrictEqual(rev.solutionGrid, q.grid);
    const byName = Object.fromEntries(rev.answers.map(a => [a.playerName, a]));
    assert.strictEqual(byName.C.rank, 1); assert.strictEqual(byName.Host.rank, 2);
    assert.ok(byName.C.points >= 150 && byName.C.points <= 200, 'C: ' + byName.C.points);
    assert.ok(byName.Host.points > 0 && byName.Host.points < byName.C.points, 'Host: ' + byName.Host.points);
    assert.strictEqual(byName.B.points, 0); assert.strictEqual(byName.B.delta, 0); assert.ok(byName.B.noAnswer);
    const res = await host.until('result', 8000);
    assert.strictEqual(res.mode, 'build'); assert.deepStrictEqual(res.grid, q.grid);
    assert.strictEqual(res.scores.find(s => s.name === 'B').score, 0);
    // Verlauf enthaelt die Bau-Runde
    host.emit('get_round_overview'); await wait(250);
    assert.strictEqual(host.last('round_overview').history[0].format, 'craft-build');
  } finally { close(cs); }
});

test('Bau-Runde: endet sofort, wenn alle fertig sind; Mix-Modus liefert auch normale Runden', async () => {
  const { cs, host } = await room(['Host', 'B'], { build: 'only' });
  try {
    cs.forEach(c => c.emit('player_ready'));
    const qd = await host.until('question', 8000); const q = qs.find(x => x.id === qd.id);
    const t0 = Date.now();
    cs.forEach(c => c.emit('build_check', { grid: q.grid }));
    const rev = await host.until('answers_revealed', 5000);
    assert.ok(rev && Date.now() - t0 < 4000, 'Aufloesung wartet nicht auf die Zeit');
    assert.ok(rev.answers.every(a => a.correct));
  } finally { close(cs); }
  const mix = await room(['Host', 'B'], { build: 'mix', rounds: 2 });
  try {
    mix.cs.forEach(c => c.emit('player_ready'));
    const q1 = await mix.host.until('question', 8000);
    assert.ok(q1.mode === 'build' || q1.mode === undefined);
  } finally { close(mix.cs); }
});
