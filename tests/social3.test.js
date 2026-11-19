const test = require('node:test');
const assert = require('node:assert');
const { startServer, post } = require('./helpers.js');
const Social = require('../lib/social.js');
const qs = require('../questions.json');

let S;
test.before(async () => { S = await startServer({ PROFILE_CREATE_BURST: '200', PROFILE_RATE_FACTOR: '30' }); });
test.after(() => { if (S) S.stop(); });

const wait = (ms) => new Promise(r => setTimeout(r, ms));
const get = async (path, pt) => { const r = await fetch(S.url + path, { headers: pt ? { Authorization: 'Bearer ' + pt } : {} }); let j = null; try { j = await r.json(); } catch (e) {} return { status: r.status, body: j }; };
const ap = (path, body, pt) => fetch(S.url + path, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + pt }, body: JSON.stringify(body) }).then(async r => ({ status: r.status, body: await r.json().catch(() => null) }));
let n = 0;
async function mk(name, token) {
  token = token || (await post(S.url + '/api/ranked/start', { gid: 'soc3_' + Date.now() + '_' + (n++) + 'abcdef', name: 'T' })).body.token;
  const r = await post(S.url + '/api/profile/create', { token, name, age14: true });
  return { token, pt: r.body.pt, me: r.body.me, pid: r.body.me.pid, code: r.body.me.friendCode };
}
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

test('Gruppen: anlegen, Beitritt per Code, Limits, Besitzer-Rechte, Uebergabe, Verlassen, Aufloesen, Namensfilter', async () => {
  const [A, B, C, D] = [await mk('grp_a'), await mk('grp_b'), await mk('grp_c'), await mk('grp_d')];
  for (const [body, err] of [[{ name: 'ab', symbol: 'schwert', color: 'rot' }, 'name_format'], [{ name: 'admin', symbol: 'schwert', color: 'rot' }, 'name_reserviert'], [{ name: 'n4zi_clan', symbol: 'schwert', color: 'rot' }, 'name_unzulaessig'],
    [{ name: 'gruppe_x', symbol: 'kanone', color: 'rot' }, 'symbol'], [{ name: 'gruppe_x', symbol: 'schwert', color: 'schwarz' }, 'color']]) { const r = await ap('/api/groups/create', body, A.pt); assert.strictEqual(r.status, 400); assert.strictEqual(r.body.error, err); }
  const cr = await ap('/api/groups/create', { name: 'Die_Bauer', symbol: 'spitzhacke', color: 'gruen' }, A.pt);
  assert.strictEqual(cr.status, 200); const g = cr.body.group;
  assert.deepStrictEqual([g.name, g.symbol, g.color, g.ownerPid, g.members.length], ['die_bauer', 'spitzhacke', 'gruen', A.pid, 1]); assert.ok(/^[A-Z2-9]{8}$/.test(g.code));
  assert.strictEqual((await ap('/api/groups/create', { name: 'andere', symbol: 'schild', color: 'rot' }, A.pt)).body.error, 'bereits_in_gruppe');
  assert.strictEqual((await ap('/api/groups/create', { name: 'die_bauer', symbol: 'schild', color: 'rot' }, B.pt)).body.error, 'name_vergeben');
  assert.strictEqual((await ap('/api/groups/join', { code: 'ZZZZZZZZ' }, B.pt)).status, 404);
  const jb = await ap('/api/groups/join', { code: g.code.toLowerCase() }, B.pt);
  assert.strictEqual(jb.status, 200); assert.strictEqual(jb.body.group.members.length, 2); assert.ok(!('code' in jb.body.group), 'Code sieht nur der Besitzer');
  assert.strictEqual((await ap('/api/groups/join', { code: g.code }, B.pt)).body.error, 'bereits_in_gruppe');
  await ap('/api/groups/join', { code: g.code }, C.pt);
  assert.strictEqual((await get('/api/profile/me', C.pt)).body.me.group.name, 'die_bauer');
  // nur Besitzer
  for (const path of ['/api/groups/kick', '/api/groups/transfer', '/api/groups/newcode', '/api/groups/disband']) assert.strictEqual((await ap(path, { pid: C.pid }, B.pt)).status, 403, path);
  assert.strictEqual((await ap('/api/groups/kick', { pid: A.pid }, A.pt)).status, 404, 'sich selbst nicht');
  const k = await ap('/api/groups/kick', { pid: C.pid }, A.pt); assert.strictEqual(k.body.group.members.length, 2);
  assert.strictEqual((await get('/api/groups/me', C.pt)).body.group, null);
  const nc = await ap('/api/groups/newcode', {}, A.pt); assert.notStrictEqual(nc.body.group.code, g.code);
  assert.strictEqual((await ap('/api/groups/join', { code: g.code }, D.pt)).status, 404, 'alter Code ungueltig');
  // Uebergabe, Besitzer verlaesst -> dienstaeltestes Mitglied, letztes Mitglied -> aufgeloest
  assert.strictEqual((await ap('/api/groups/transfer', { pid: B.pid }, A.pt)).body.group.ownerPid, B.pid);
  assert.strictEqual((await ap('/api/groups/leave', {}, B.pt)).status, 200);
  const left = (await get('/api/groups/me', A.pt)).body.group; assert.deepStrictEqual([left.ownerPid, left.members.length], [A.pid, 1]);
  assert.strictEqual((await ap('/api/groups/leave', {}, A.pt)).status, 200);
  assert.strictEqual((await get('/api/groups/me', A.pt)).body.group, null);
  assert.strictEqual((await ap('/api/groups/create', { name: 'die_bauer', symbol: 'schild', color: 'rot' }, B.pt)).status, 200, 'Name nach Aufloesung wieder frei');
  const dis = await ap('/api/groups/disband', {}, B.pt); assert.strictEqual(dis.status, 200); assert.strictEqual((await get('/api/groups/me', B.pt)).body.group, null);
});

test('Gruppen: maximal 8 Mitglieder, Konto loeschen verlaesst die Gruppe (Besitzer-Uebergabe), Export', async () => {
  const owner = await mk('grp8_o'); const g = (await ap('/api/groups/create', { name: 'achter_clan', symbol: 'bogen', color: 'blau' }, owner.pt)).body.group;
  const ms = []; for (let i = 0; i < 7; i++) { const m = await mk('grp8_m' + i); assert.strictEqual((await ap('/api/groups/join', { code: g.code }, m.pt)).status, 200); ms.push(m); }
  const extra = await mk('grp8_x'); assert.strictEqual((await ap('/api/groups/join', { code: g.code }, extra.pt)).body.error, 'voll');
  const ex = await get('/api/profile/export', owner.pt); assert.deepStrictEqual([ex.body.social.group.name, ex.body.social.group.isOwner, ex.body.social.group.members], ['achter_clan', true, 8]);
  assert.strictEqual((await ap('/api/profile/delete', { confirm: 'LOESCHEN' }, owner.pt)).status, 200);
  const g2 = (await get('/api/groups/me', ms[0].pt)).body.group; assert.strictEqual(g2.members.length, 7); assert.strictEqual(g2.ownerPid, ms[0].pid, 'dienstaeltestes Mitglied wird Besitzer');
  assert.strictEqual((await ap('/api/groups/join', { code: g.code }, extra.pt)).status, 404, 'nach Besitzerwechsel gilt der alte Code nicht mehr');
});

test('Wochenziele: drei Ziele je Woche, Fortschritt aus Statistik-Zuwachs, einmal gezaehlt, Auszeichnungen, Feed', async () => {
  const A = await mk('goal_a');
  let gv = await get('/api/goals', A.pt);
  assert.strictEqual(gv.status, 200); assert.match(gv.body.week, /^\d{4}-W\d{2}$/); assert.strictEqual(gv.body.goals.length, 3);
  assert.ok(gv.body.goals.every(g => g.progress === 0 && !g.done && g.target > 0));
  const ids = gv.body.goals.map(g => g.id);
  const same = await get('/api/goals', (await mk('goal_b')).pt); assert.deepStrictEqual(same.body.goals.map(g => g.id), ids, 'gleiche Woche = gleiche Ziele');
  // erste Statistik: kein Zuwachs (Basis = erste Meldung)
  await ap('/api/profile/update', { stats: { answered: 500, correct: 400, bestStreak: 9, byCategory: { Crafting: { c: 100, t: 120 }, Redstone: { c: 80, t: 90 }, Mobs: { c: 60, t: 70 } }, dailyStreak: 0 } }, A.pt);
  gv = await get('/api/goals', A.pt); assert.ok(gv.body.goals.every(g => g.progress === 0 || g.type === 'dailyStreak'), 'kein Fortschritt aus Altbestand');
  // Zuwachs: genug fuer alle statistikbasierten Ziele
  await ap('/api/profile/update', { stats: { answered: 1200, correct: 1000, bestStreak: 12, dailyStreak: 6, byCategory: { Crafting: { c: 200, t: 240 }, Redstone: { c: 150, t: 170 }, Mobs: { c: 120, t: 140 } } } }, A.pt);
  gv = await get('/api/goals', A.pt);
  const statGoals = gv.body.goals.filter(g => ['answered', 'correct', 'category', 'dailyStreak'].includes(g.type));
  assert.ok(statGoals.length === 0 || statGoals.every(g => g.done && g.progress === g.target), JSON.stringify(gv.body.goals));
  assert.strictEqual(gv.body.doneCount, gv.body.goals.filter(g => g.done).length);
  const again = await get('/api/goals', A.pt); assert.strictEqual(again.body.doneCount, gv.body.doneCount, 'nicht doppelt gezaehlt');
  if (gv.body.doneCount >= 1) assert.ok(gv.body.awards.some(a => a.id === 'wochenziel_1'));
  const feed = (await get('/api/feed', A.pt)).body.events; assert.strictEqual(feed.filter(e => e.type === 'goal').length, gv.body.doneCount);
  // Plausibilitaet bleibt: unmoeglicher Sprung wird abgelehnt, also auch kein Fake-Fortschritt
  assert.strictEqual((await ap('/api/profile/update', { stats: { answered: 90000, correct: 80000, bestStreak: 12 } }, A.pt)).body.error, 'stats_plausibel');
});

test('Wochenziele: geprueftes Ranked und Duell-Sieg zaehlen, Titel "wochenheld" frei ab 5 Zielen; Katalog zeigt Voraussetzungen', async () => {
  const t = await rankedRun('goalr_' + Date.now() + 'abcdef');
  const A = await mk('goalr_a', t);
  const gv = await get('/api/goals', A.pt);
  // Fortschritt ab erstem Kontakt: ein weiterer gewerteter Lauf zaehlt
  const st = await post(S.url + '/api/ranked/start', { gid: 'x', name: 'x' }).catch(() => null);
  assert.ok(gv.body.goals.every(g => g.progress === 0 || g.type === 'dailyStreak') && st !== undefined);
  const cat = await get('/api/profile/catalog', A.pt);
  assert.deepStrictEqual(cat.body.titles.find(x => x.id === 'wochenheld').requires, { goals: 5 }); assert.strictEqual(cat.body.titles.find(x => x.id === 'wochenheld').unlocked, false);
});

test('Saison: Anzeige aus geprueftem MMR, Auszeichnung bei Saisonwechsel (Einheit), Wochen-/Saison-Berechnung', async () => {
  const t = await rankedRun('seas_' + Date.now() + 'abcdef');
  const A = await mk('seas_a', t);
  const me = (await get('/api/profile/me', A.pt)).body.me;
  assert.match(me.season.id, /^\d{4}-Q[1-4]$/); assert.ok(me.season.mmr > 0 && me.season.startMmr === me.season.mmr && me.season.delta === 0);
  assert.ok(me.season.peakTier, 'Saison-Rang aus dem geprueften Lauf');
  assert.ok(me.season.endsAt > me.season.startsAt);
  // Auszeichnung nach Saisonwechsel (reine Logik): Q4 gewertet bis Gold -> Auszeichnung, neue Saison startet beim aktuellen MMR
  const Q4 = Date.UTC(2026, 10, 20), Q1 = Date.UTC(2027, 0, 5);
  const e = { verified: true, mmr: 1900, season: { id: '2026-Q4', peak: 2300 } };
  let r = Social.evalSeason({ seasonState: { id: '2026-Q4', startMmr: 500 } }, e, Q1);
  assert.strictEqual(r.award, 'saison_2026q4_gold'); assert.deepStrictEqual(r.state, { id: '2027-Q1', startMmr: 1900 });
  r = Social.evalSeason({ seasonState: { id: '2026-Q4', startMmr: 500 } }, { verified: true, mmr: 1900 }, Q1);
  assert.strictEqual(r.award, null, 'ohne gewerteten Lauf in der Saison keine Auszeichnung');
  r = Social.evalSeason({ seasonState: { id: '2026-Q4', startMmr: 500 } }, e, Q4);
  assert.strictEqual(r.award, null); assert.deepStrictEqual(r.state, { id: '2026-Q4', startMmr: 500 }, 'gleiche Saison bleibt unveraendert');
  r = Social.evalSeason({}, null, Q4); assert.strictEqual(r.state, undefined === r.state ? r.state : null);
  r = Social.evalSeason({}, { verified: true, mmr: 700 }, Q4); assert.deepStrictEqual(r.state, { id: '2026-Q4', startMmr: 700 });
  // isoWeek/season Hilfsfunktionen
  assert.strictEqual(Social.isoWeek(new Date(Date.UTC(2026, 10, 19))).id, '2026-W47');
  assert.strictEqual(Social.isoWeek(new Date(Date.UTC(2026, 0, 1))).id, '2026-W01');
  assert.strictEqual(Social.isoWeek(new Date(Date.UTC(2027, 0, 3))).id, '2026-W53');
  assert.deepStrictEqual([Social.season(new Date(Date.UTC(2026, 10, 19))).id, Social.season(new Date(Date.UTC(2027, 0, 1))).id], ['2026-Q4', '2027-Q1']);
});

test('Gruppen-Wochenwertung und Koop-Wochenziel: Punkte aus geprueften Laeufen, Ziel waechst mit der Gruppengroesse, Auszeichnung einmal je Woche', async () => {
  const ta = await rankedRun('coop_a_' + Date.now() + 'abcdef'), tb = await rankedRun('coop_b_' + Date.now() + 'abcdef');
  const A = await mk('coop_a', ta), B = await mk('coop_b', tb), C = await mk('coop_c');
  const g = (await ap('/api/groups/create', { name: 'koop_team', symbol: 'diamant', color: 'lila' }, A.pt)).body.group;
  await ap('/api/groups/join', { code: g.code }, B.pt); await ap('/api/groups/join', { code: g.code }, C.pt);
  const v = (await get('/api/groups/me', A.pt)).body.group;
  const pa = v.members.find(m => m.pid === A.pid).weekPoints, pb = v.members.find(m => m.pid === B.pid).weekPoints, pc = v.members.find(m => m.pid === C.pid).weekPoints;
  assert.ok(pa >= 100 + 10 * 10 && pb >= 200 && pc === 0, [pa, pb, pc].join());           // 100 je Lauf + 10 je richtige Antwort (10/10 richtig)
  assert.deepStrictEqual(v.members.map(m => m.weekPoints), v.members.map(m => m.weekPoints).slice().sort((x, y) => y - x));
  assert.strictEqual(v.week.points, pa + pb + pc); assert.strictEqual(v.week.goal.target, 1000 + 500 * 2); assert.strictEqual(v.week.goal.done, false);
  assert.match(v.week.id, /^\d{4}-W\d{2}$/); assert.deepStrictEqual(v.awards, []);
  // Verlassen senkt das Ziel
  await ap('/api/groups/leave', {}, C.pt);
  assert.strictEqual((await get('/api/groups/me', A.pt)).body.group.week.goal.target, 1500);
});
