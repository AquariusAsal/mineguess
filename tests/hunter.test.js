const test = require('node:test');
const assert = require('node:assert');
const { startServer, post } = require('./helpers.js');
const qs = require('../questions.json');

const TOKEN = 'ein-langes-admin-token-1234567890';
const wait = (ms) => new Promise(r => setTimeout(r, ms));
const A = { Authorization: 'Bearer ' + TOKEN };
const getJ = async (url, headers) => { const r = await fetch(url, { headers: headers || {} }); return { status: r.status, body: await r.json().catch(() => null) }; };

test('Fehlerjaeger: bestaetigte Meldung mit Profil-Token gibt Punkte (Stufen 1/5/10), nur einmal je Meldung, ohne Profil nichts, Admin sieht keine Freitexte', async () => {
  const S = await startServer({ ADMIN_TOKEN: TOKEN, REPORT_RATE_BURST: '200' });
  try {
    const st = await post(S.url + '/api/ranked/start', { gid: 'hj_' + Date.now() + 'abcdef', name: 'Jaeger' });
    const pr = await post(S.url + '/api/profile/create', { token: st.body.token, name: 'jaeger_x', age14: true });
    assert.ok(pr.body.ok); const pt = pr.body.pt;
    assert.deepStrictEqual(pr.body.me.hunter, { n: 0, level: 0 });
    // 5 verschiedene Meldungen mit Profil-Token, 1 ohne
    for (let i = 0; i < 5; i++) assert.strictEqual((await post(S.url + '/api/report', { category: 'frage', reason: 'falsch', questionId: qs[i].id, mode: 'endless', elapsed: 5000, text: 'privat-text-' + i, pt })).status, 200);
    await post(S.url + '/api/report', { category: 'bug', mode: 'menu', text: 'anonymer Bug mit Text', elapsed: 5000 });
    await wait(200);
    const list = await getJ(S.url + '/api/admin/reports?status=open', A);
    assert.strictEqual(list.status, 200); assert.strictEqual(list.body.reports.length, 6);
    const txt = JSON.stringify(list.body);
    for (const bad of ['privat-text', 'anonymer Bug mit Text', 'jaeger_x', pt]) assert.ok(!txt.includes(bad), 'Admin-Liste verraet: ' + bad);
    const mine = list.body.reports.filter(r => r.linked); assert.strictEqual(mine.length, 5);
    assert.strictEqual((await getJ(S.url + '/api/admin/reports')).status, 401);
    // Aktionen: ungueltig, bestaetigen, doppelt bestaetigen (kein zweiter Punkt), ablehnen
    assert.strictEqual((await post(S.url + '/api/admin/report-action', { id: mine[0].id, action: 'loeschen' }, A)).status, 400);
    assert.strictEqual((await post(S.url + '/api/admin/report-action', { id: 'aaaaaaaaaa', action: 'confirm' }, A)).status, 404);
    const c1 = await post(S.url + '/api/admin/report-action', { id: mine[0].id, action: 'confirm' }, A); assert.strictEqual(c1.body.rewarded, true);
    const c2 = await post(S.url + '/api/admin/report-action', { id: mine[0].id, action: 'confirm' }, A); assert.strictEqual(c2.body.rewarded, false);
    const me1 = await getJ(S.url + '/api/profile/me', { Authorization: 'Bearer ' + pt }); assert.deepStrictEqual(me1.body.me.hunter, { n: 1, level: 1 });
    const anon = list.body.reports.find(r => !r.linked && r.category === 'bug');
    assert.strictEqual((await post(S.url + '/api/admin/report-action', { id: anon.id, action: 'confirm' }, A)).body.rewarded, false);
    assert.strictEqual((await post(S.url + '/api/admin/report-action', { id: mine[1].id, action: 'reject' }, A)).body.status, 'rejected');
    for (const r of mine.slice(2)) await post(S.url + '/api/admin/report-action', { id: r.id, action: 'confirm' }, A);
    const me2 = await getJ(S.url + '/api/profile/me', { Authorization: 'Bearer ' + pt }); assert.deepStrictEqual(me2.body.me.hunter, { n: 4, level: 1 });
    // abgelehnte Meldung nach erneutem Oeffnen und Bestaetigen zaehlt nicht (Zuordnung wurde entfernt)
    await post(S.url + '/api/admin/report-action', { id: mine[1].id, action: 'reopen' }, A);
    assert.strictEqual((await post(S.url + '/api/admin/report-action', { id: mine[1].id, action: 'confirm' }, A)).body.rewarded, false);
    assert.strictEqual((await getJ(S.url + '/api/admin/reports?status=confirmed', A)).body.reports.length, 6);
  } finally { S.stop(); }
});

test('Fehlerjaeger: Stufe 2 bei 5 und Stufe 3 bei 10 bestaetigten Meldungen; Profil-Ansicht zeigt hunter nur im Abzeichen-Bereich', async () => {
  const S = await startServer({ ADMIN_TOKEN: TOKEN, REPORT_RATE_BURST: '200' });
  try {
    const st = await post(S.url + '/api/ranked/start', { gid: 'hj2_' + Date.now() + 'abcdef', name: 'Jaeger2' });
    const pt = (await post(S.url + '/api/profile/create', { token: st.body.token, name: 'jaeger_y', age14: true })).body.pt;
    for (let i = 0; i < 10; i++) await post(S.url + '/api/report', { category: 'frage', reason: 'unklar', questionId: qs[20 + i].id, mode: 'blitz', elapsed: 5000, pt });
    const ids = (await getJ(S.url + '/api/admin/reports?status=open&limit=50', A)).body.reports.map(r => r.id); assert.strictEqual(ids.length, 10);
    let lv = [];
    for (const id of ids) { await post(S.url + '/api/admin/report-action', { id, action: 'confirm' }, A); lv.push((await getJ(S.url + '/api/profile/me', { Authorization: 'Bearer ' + pt })).body.me.hunter.level); }
    assert.deepStrictEqual(lv, [1, 1, 1, 1, 2, 2, 2, 2, 2, 3]);
    // ungueltiges/fremdes Token: Meldung wird angenommen, aber nicht verknuepft
    await post(S.url + '/api/report', { category: 'frage', reason: 'falsch', questionId: qs[40].id, mode: 'endless', elapsed: 5000, pt: 'x'.repeat(60) });
    const l = (await getJ(S.url + '/api/admin/reports?status=open', A)).body.reports; assert.strictEqual(l.length, 1); assert.strictEqual(l[0].linked, false);
  } finally { S.stop(); }
});

test('Geprueft-Siegel: Admin markiert Fragen, oeffentliche ID-Liste; ohne Token nichts', async () => {
  const S = await startServer({ ADMIN_TOKEN: TOKEN });
  try {
    assert.deepStrictEqual((await getJ(S.url + '/api/verified-questions')).body, { ok: true, ids: [] });
    assert.strictEqual((await post(S.url + '/api/admin/question-review', { questionId: qs[3].id, verified: true })).status, 401);
    const r = await post(S.url + '/api/admin/question-review', { questionIds: [qs[3].id, qs[1].id, 999999, 'x'], verified: true }, A); assert.strictEqual(r.body.verified, 2);
    assert.deepStrictEqual((await getJ(S.url + '/api/verified-questions')).body.ids, [qs[3].id, qs[1].id].sort((a, b) => a - b));
    await post(S.url + '/api/admin/question-review', { questionId: qs[3].id, verified: false }, A);
    assert.deepStrictEqual((await getJ(S.url + '/api/verified-questions')).body.ids, [qs[1].id]);
    assert.strictEqual((await post(S.url + '/api/admin/question-review', { questionId: qs[3].id }, A)).status, 400);
  } finally { S.stop(); }
});
