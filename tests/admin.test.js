const test = require('node:test');
const assert = require('node:assert');
const { startServer, post } = require('./helpers.js');
const qs = require('../questions.json');

const TOKEN = 'ein-langes-admin-token-1234567890';
const wait = (ms) => new Promise(r => setTimeout(r, ms));
const get = (S, headers) => fetch(S.url + '/api/admin/overview', { headers: headers || {} }).then(async r => ({ status: r.status, headers: r.headers, body: await r.json().catch(() => null) }));

test('Admin-Uebersicht: ohne ENV ADMIN_TOKEN (oder zu kurz) nicht vorhanden (404)', async () => {
  const S = await startServer();
  try { assert.strictEqual((await get(S, { Authorization: 'Bearer irgendwas' })).status, 404); } finally { S.stop(); }
  const S2 = await startServer({ ADMIN_TOKEN: 'kurz' });
  try { assert.strictEqual((await get(S2, { Authorization: 'Bearer kurz' })).status, 404); } finally { S2.stop(); }
});

test('Admin-Uebersicht: Token noetig (Bearer oder X-Admin-Token), 401 bei falschem, Sperre nach 5 Fehlversuchen, noindex, keine personenbezogenen Daten', async () => {
  const S = await startServer({ ADMIN_TOKEN: TOKEN });
  try {
    // Daten erzeugen: Meldungen, Ranked-Eintrag, Profil, Raum
    await post(S.url + '/api/report', { category: 'cheat', mode: 'ranked', player: 'GeheimerSpielername', text: 'geheimer Text mit Kontakt me@mail.de', elapsed: 5000, email: 'privat@example.org', consent: true });
    await post(S.url + '/api/report', { category: 'frage', reason: 'falsch', questionId: qs[0].id, mode: 'endless', elapsed: 5000 });
    const st = await post(S.url + '/api/ranked/start', { gid: 'adm_' + Date.now() + 'abcdef', name: 'GeheimerRangName' });
    await post(S.url + '/api/profile/create', { token: st.body.token, name: 'geheim_profil', age14: true });
    await wait(300);
    const ok = await get(S, { Authorization: 'Bearer ' + TOKEN });
    assert.strictEqual(ok.status, 200); assert.match(ok.headers.get('x-robots-tag'), /noindex/); assert.match(ok.headers.get('cache-control'), /no-store/);
    const b = ok.body;
    assert.strictEqual(b.ok, true); assert.ok(b.health && b.health.questions > 1000 && 'mail' in b.health && 'mailErrors' in b.health);
    assert.strictEqual(b.reports.byCategory.cheat, 1); assert.strictEqual(b.reports.byCategory.frage, 1); assert.strictEqual(b.reports.byMode.ranked, 1);
    assert.strictEqual(b.reports.topQuestions[0].id, qs[0].id); assert.ok(Object.keys(b.reports.perDay).length >= 1);
    assert.ok(b.rooms.total >= 5 && b.rooms.public >= 5 && typeof b.rooms.byPhase === 'object');
    assert.ok(b.ranked.entries >= 0 && b.profiles.total === 1);
    const txt = JSON.stringify(b);
    for (const secret of ['GeheimerSpielername', 'geheimer Text', 'me@mail.de', 'privat@example.org', 'GeheimerRangName', 'geheim_profil', TOKEN]) assert.ok(!txt.includes(secret), 'personenbezogen/geheim in der Antwort: ' + secret);
    assert.strictEqual((await get(S, { 'X-Admin-Token': TOKEN })).status, 200);
    // falsche Tokens: 401, nach 5 Versuchen gesperrt (auch das richtige Token wird dann kurz abgelehnt)
    assert.strictEqual((await get(S)).status, 401);
    for (let i = 0; i < 4; i++) assert.strictEqual((await get(S, { Authorization: 'Bearer falsch' + i })).status, 401);
    assert.strictEqual((await get(S, { Authorization: 'Bearer ' + TOKEN })).status, 429, 'Sperre nach Fehlversuchen');
  } finally { S.stop(); }
});

test('Admin: admin.html wird nie indexiert und gehoert nicht in den Service-Worker-Cache; Route ist nicht in der Statik-Liste', async () => {
  const fs = require('fs'), path = require('path');
  const sw = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');
  assert.ok(!/admin/i.test(sw.slice(0, sw.indexOf('// ASSETS_END') > 0 ? sw.indexOf('// ASSETS_END') : sw.length)), 'admin im Service-Worker');
  const S = await startServer({ ADMIN_TOKEN: TOKEN });
  try {
    const r = await fetch(S.url + '/admin.html');
    assert.ok([200, 404].includes(r.status)); assert.match(r.headers.get('x-robots-tag') || '', /noindex/);
  } finally { S.stop(); }
});
