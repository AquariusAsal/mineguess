const test = require('node:test');
const assert = require('node:assert');
const http = require('http');
const fs = require('fs');
const { startServer, post } = require('./helpers.js');
const Mailer = require('../lib/mailer.js');
const Reports = require('../lib/reports.js');
const qs = require('../questions.json');

const TO = 'inhaber.test@example.org';
const wait = (ms) => new Promise(r => setTimeout(r, ms));

// kleiner Mock fuer die Resend-API: sammelt die Anfragen
function mockMailApi() {
  const got = [];
  const srv = http.createServer((req, res) => {
    let b = ''; req.on('data', d => { b += d; });
    req.on('end', () => { try { got.push({ headers: req.headers, body: JSON.parse(b) }); } catch (e) {} res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{"id":"x"}'); });
  });
  return new Promise(r => srv.listen(0, '127.0.0.1', () => r({ got, url: 'http://127.0.0.1:' + srv.address().port, close: () => srv.close() })));
}
const rep = (o) => Object.assign({ category: 'bug', mode: 'endless', text: 'Der Timer haengt', elapsed: 5000, context: { app: 'mineguess-v114', device: 'mobil', errors: ['TypeError: x is undefined (https://x.de/a.js?token=abc:3:4)', 'zweite Zeile'] } }, o);

test('Meldungen: Validierung (Kategorie, Modus, Format, Frage, Text, E-Mail nur mit Einwilligung)', async () => {
  const S = await startServer({ REPORT_RATE_BURST: '200' });
  try {
    const url = S.url + '/api/report';
    assert.strictEqual((await post(url, rep({ category: 'frage', reason: 'falsch', questionId: qs[0].id, mode: 'ranked', format: 'number' }))).body.ok, true);
    for (const bad of [rep({ category: 'unbekannt' }), rep({ mode: 'raum' }), rep({ format: 'x' }), rep({ category: 'frage', reason: 'x', questionId: qs[0].id }),
      rep({ category: 'frage', reason: 'falsch' }), rep({ category: 'frage', reason: 'falsch', questionId: -5 }), rep({ text: 5 }), rep({ text: '' }), rep({ round: -1 }),
      rep({ email: 'kein-mail', consent: true }), 'text', null]) {
      const r = await post(url, bad); assert.strictEqual(r.status, 400, JSON.stringify(bad).slice(0, 80));
    }
    // altes Format bleibt gueltig
    assert.strictEqual((await post(url, { questionId: qs[1].id, reason: 'unklar' })).body.ok, true);
    assert.strictEqual((await post(url, { questionId: qs[1].id, reason: 'boese' })).status, 400);
  } finally { S.stop(); }
});

test('Meldungen: gespeichert ohne IP/Nutzer-ID, Kontaktdaten geschwaerzt, Konsolenfehler bereinigt, Raum/Spieler nur wo sinnvoll, E-Mail nur mit Einwilligung', async () => {
  const S = await startServer({ REPORT_RATE_BURST: '200' });
  try {
    const url = S.url + '/api/report';
    assert.ok((await post(url, rep({ category: 'cheat', mode: 'multiplayer', room: 'wildepic16', player: 'Max Muster', text: 'ruf mich an 0170 1234567 oder a@b.de', email: 'ich@example.org', consent: true, uid: 'u-1', ip: '1.2.3.4' }))).body.ok);
    assert.ok((await post(url, rep({ category: 'bug', mode: 'endless', room: 'sollnichtrein', player: 'Soll Nicht', email: 'nein@example.org' }))).body.ok);   // ohne consent
    await wait(2600);
    const reports = JSON.parse(fs.readFileSync(S.dataDir + '/reports.json', 'utf8'));
    assert.strictEqual(reports.length, 2);
    const [c, b] = reports;
    assert.strictEqual(c.category, 'cheat'); assert.strictEqual(c.room, 'wildepic16'); assert.strictEqual(c.player, 'Max Muster'); assert.strictEqual(c.contact, 'ich@example.org');
    assert.ok(!/0170|a@b\.de/.test(c.text), c.text);
    assert.strictEqual(b.room, undefined); assert.strictEqual(b.player, undefined); assert.strictEqual(b.contact, undefined);
    assert.ok(c.errors.length === 2 && !/token=abc|https?:/.test(c.errors[0]), JSON.stringify(c.errors));
    assert.deepStrictEqual(Object.keys(c.ctx).sort(), ['app', 'browser', 'device', 'os']);
    assert.ok(!JSON.stringify(reports).includes('u-1') && !JSON.stringify(reports).includes('1.2.3.4'));
  } finally { S.stop(); }
});

test('Meldungen: Honeypot, zu schnell abgeschickt und Duplikate (nur Zaehler) werden ohne Fehlermeldung abgefangen', async () => {
  const S = await startServer();
  try {
    const url = S.url + '/api/report';
    assert.strictEqual((await post(url, rep({ website: 'http://spam.example' }))).body.ok, true);      // Honeypot
    assert.strictEqual((await post(url, rep({ elapsed: 300 }))).body.ok, true);                       // zu schnell
    for (let i = 0; i < 3; i++) assert.strictEqual((await post(url, rep({ text: 'Gleicher Fehler' }))).body.ok, true);
    await wait(2600);
    const reports = JSON.parse(fs.readFileSync(S.dataDir + '/reports.json', 'utf8'));
    assert.strictEqual(reports.length, 1, 'Honeypot/zu schnell/Duplikate duerfen nicht gespeichert werden');
    assert.strictEqual(reports[0].count, 3);
  } finally { S.stop(); }
});

test('Meldungen: Rate-Limit je IP (429), andere Meldungen davor gehen durch', async () => {
  const S = await startServer();
  try {
    let limited = 0;
    for (let i = 0; i < 16; i++) if ((await post(S.url + '/api/report', rep({ text: 'Fehler Nr ' + i }))).status === 429) limited++;
    assert.ok(limited >= 3, 'Limit greift nicht: ' + limited);
  } finally { S.stop(); }
});

test('Mailer: Sofortversand fuer Cheat/Bug, Empfaenger nur aus ENV, nie in der API-Antwort, /health nennt nur den Transport', async () => {
  const mock = await mockMailApi();
  const S = await startServer({ RESEND_API_KEY: 'test-key', RESEND_API_URL: mock.url, REPORT_MAIL_TO: TO, REPORT_MAIL_FROM: 'MineGuess <noreply@example.org>' });
  try {
    const r = await post(S.url + '/api/report', rep({ category: 'cheat', mode: 'ranked', player: 'Betrueger\r\nBcc: boese@example.com', text: 'Zu schnelle Antworten' }));
    assert.strictEqual(r.body.ok, true);
    assert.ok(!JSON.stringify(r.body).includes('example.org'), 'Empfaenger in der Antwort');
    for (let i = 0; i < 30 && !mock.got.length; i++) await wait(100);
    assert.strictEqual(mock.got.length, 1);
    const m = mock.got[0];
    assert.strictEqual(m.headers.authorization, 'Bearer test-key');
    assert.deepStrictEqual(m.body.to, [TO]);
    assert.ok(/Cheat/.test(m.body.subject) && /ranked/.test(m.body.subject));
    assert.ok(!/[\r\n]/.test(m.body.subject) && !/[\r\n]/.test(m.body.from), 'Header-Injection');
    assert.ok(!/Bcc: boese/.test(m.body.subject), 'Injection im Betreff');
    assert.ok(m.body.text.includes('Zu schnelle Antworten') && m.body.text.includes('ranked'));
    assert.ok(!/1\.2\.3|127\.0\.0\.1/.test(m.body.text), 'IP in der Mail');
    const h = await (await fetch(S.url + '/health')).json();
    assert.strictEqual(h.mail, 'resend'); assert.ok(!JSON.stringify(h).includes('example.org'));
  } finally { S.stop(); mock.close(); }
});

test('Mailer: Fragen-Meldungen gebuendelt (Digest), nicht sofort', async () => {
  const mock = await mockMailApi();
  const S = await startServer({ RESEND_API_KEY: 'k', RESEND_API_URL: mock.url, REPORT_MAIL_TO: TO, REPORT_DIGEST_MS: '1200' });
  try {
    for (let i = 0; i < 3; i++) await post(S.url + '/api/report', rep({ category: 'frage', reason: 'falsch', questionId: qs[i].id, mode: 'endless', text: 'Falsch ' + i }));
    await wait(500);
    assert.strictEqual(mock.got.length, 0, 'Fragen duerfen nicht sofort gesendet werden');
    for (let i = 0; i < 40 && !mock.got.length; i++) await wait(100);
    assert.strictEqual(mock.got.length, 1, 'ein Digest');
    assert.ok(/3 Meldungen/.test(mock.got[0].body.subject));
    assert.strictEqual((mock.got[0].body.text.match(/Meldung \d von 3/g) || []).length, 3);
  } finally { S.stop(); mock.close(); }
});

test('Mailer: ohne Schluessel wird nur gespeichert (kein Fehler), Brevo-Transport nutzt api-key', async () => {
  const S = await startServer();
  try {
    assert.strictEqual((await post(S.url + '/api/report', rep({}))).body.ok, true);
    assert.strictEqual((await (await fetch(S.url + '/health')).json()).mail, 'off');
  } finally { S.stop(); }
  const mock = await mockMailApi();
  const S2 = await startServer({ BREVO_API_KEY: 'brevo-k', BREVO_API_URL: mock.url, REPORT_MAIL_TO: TO, REPORT_MAIL_FROM: 'MineGuess <noreply@example.org>' });
  try {
    await post(S2.url + '/api/report', rep({ category: 'bug' }));
    for (let i = 0; i < 30 && !mock.got.length; i++) await wait(100);
    assert.strictEqual(mock.got[0].headers['api-key'], 'brevo-k');
    assert.deepStrictEqual(mock.got[0].body.to, [{ email: TO }]);
    assert.strictEqual(mock.got[0].body.sender.email, 'noreply@example.org');
  } finally { S2.stop(); mock.close(); }
});

test('Mailer-Einheiten: Header-Bereinigung, Betreff/Text, Standard-Empfaenger', () => {
  assert.strictEqual(Mailer.sanitizeHeader('a\r\nBcc: x\u0000y'), 'a Bcc: x y');
  assert.ok(Mailer.sanitizeHeader('x'.repeat(500)).length <= 150);
  const mail = Mailer.buildMail([{ category: 'bug', mode: 'hl', text: 'T', ts: 0, ctx: { app: 'v1', browser: 'chrome', os: 'windows', device: 'desktop' } }]);
  assert.ok(/Fehler\/Bug \(hl\)/.test(mail.subject) && /Technik: App v1, chrome, windows, desktop/.test(mail.text));
  assert.strictEqual(Mailer.DEFAULT_TO, 'admin.mineguess@gmail.com');
  const m = Mailer.create({ env: {} });
  assert.strictEqual(m.configured(), false); assert.strictEqual(m.enqueue({ category: 'bug' }), false);
  assert.ok(Reports.coarseUA('Mozilla/5.0 (Linux; Android 13) Chrome/120 Mobile Safari/537.36').device === 'mobil');
});

test('Moderations-Skript: Uebersicht nach Kategorie/Modus/Spieler, Filter, JSON, ohne Rueckfrage-Adressen', () => {
  const { execFileSync } = require('child_process');
  const os = require('os'), path = require('path');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mg-rs-')), file = path.join(dir, 'reports.json'), now = Date.now();
  fs.writeFileSync(file, JSON.stringify([
    { category: 'cheat', mode: 'ranked', player: 'Bot1', text: 'zu schnell', ts: now, count: 3 },
    { category: 'name', mode: 'profile', player: 'bot1', text: 'Name', ts: now - 1000, contact: 'geheim@example.org' },
    { category: 'frage', reason: 'falsch', questionId: qs[0].id, text: 'x', ts: now - 5000 },
    { category: 'bug', mode: 'hl', text: 'haengt', ts: now - 86400000 * 40 }]));
  const run = (...a) => execFileSync(process.execPath, [path.join(__dirname, '..', 'tools', 'report-summary.js'), file, ...a], { encoding: 'utf8' });
  const all = run();
  assert.match(all, /6 Meldungen/); assert.match(all, /cheat 3/); assert.match(all, /bot1 \(4x\)/); assert.ok(!all.includes('geheim@example.org') && /Rueckfrage-Adresse vorhanden/.test(all));
  const j = JSON.parse(run('--json', '--category', 'cheat')); assert.deepStrictEqual([j.total, j.reports], [3, 1]);
  assert.match(run('--since', '7', '--player', 'BOT1'), /4 Meldungen \(2 Eintraege von 4\)/);
  assert.match(run('--mode', 'hl'), /1 Meldungen/);
  assert.match(run('--purge', String(qs[0].id)), /1 Meldungen geloescht/);
});
