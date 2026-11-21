const test = require('node:test');
const assert = require('node:assert');
const { startServer } = require('./helpers.js');

test('Header: Sicherheits-Header und CSP (Report-Only) auf allen Seiten, nicht auf API', async () => {
  const S = await startServer();
  try {
    for (const p of ['/', '/game.html', '/multiplayer.html', '/index.html']) {
      const r = await fetch(S.url + p);
      assert.strictEqual(r.status, 200, p);
      assert.strictEqual(r.headers.get('x-content-type-options'), 'nosniff');
      assert.strictEqual(r.headers.get('x-frame-options'), 'SAMEORIGIN');
      assert.match(r.headers.get('referrer-policy'), /strict-origin/);
      assert.match(r.headers.get('permissions-policy'), /camera=\(\)/);
      assert.strictEqual(r.headers.get('content-security-policy'), null, 'Standard ist Report-Only');
      const csp = r.headers.get('content-security-policy-report-only');
      assert.ok(csp, p + ' ohne CSP');
      // Drittanbieter muessen erlaubt sein, sonst wuerde Enforce sie blockieren
      for (const need of ["script-src 'self' 'unsafe-inline'", 'https://www.gstatic.com', 'https://open.spotify.com', 'https://embed-cdn.spotifycdn.com', 'https://accounts.google.com', 'https://*.googleapis.com', 'https://*.firebaseio.com', 'wss:', "frame-ancestors 'self'", "object-src 'none'", 'report-uri /api/csp-report']) assert.ok(csp.includes(need), 'CSP ohne ' + need);
      assert.ok(!r.headers.get('strict-transport-security'), 'HSTS nur ueber https');
    }
    assert.strictEqual((await fetch(S.url + '/health')).headers.get('content-security-policy-report-only'), null);
  } finally { S.stop(); }
});

test('Header: HSTS nur hinter https-Proxy auf Render; CSP_MODE=enforce und off', async () => {
  const S = await startServer({ RENDER: '1' });
  try { const r = await fetch(S.url + '/', { headers: { 'x-forwarded-proto': 'https' } }); assert.match(r.headers.get('strict-transport-security') || '', /max-age=\d+/); const h = await fetch(S.url + '/'); assert.ok(!h.headers.get('strict-transport-security')); } finally { S.stop(); }
  const E = await startServer({ CSP_MODE: 'enforce' });
  try { const r = await fetch(E.url + '/'); assert.ok(r.headers.get('content-security-policy')); assert.strictEqual(r.headers.get('content-security-policy-report-only'), null); } finally { E.stop(); }
  const O = await startServer({ CSP_MODE: 'off' });
  try { const r = await fetch(O.url + '/'); assert.strictEqual(r.headers.get('content-security-policy'), null); assert.strictEqual(r.headers.get('content-security-policy-report-only'), null); } finally { O.stop(); }
});

test('CSP-Report-Endpunkt: 204, zaehlt nur Direktive und Host (keine Pfade/Queries)', async () => {
  const S = await startServer({ ADMIN_TOKEN: 'ein-langes-admin-token-1234567890' });
  try {
    const r = await fetch(S.url + '/api/csp-report', { method: 'POST', headers: { 'Content-Type': 'application/csp-report' }, body: JSON.stringify({ 'csp-report': { 'effective-directive': 'script-src-elem', 'blocked-uri': 'https://evil.example/pfad/x.js?token=geheim' } }) });
    assert.strictEqual(r.status, 204);
    await new Promise(r => setTimeout(r, 100));
    const a = await (await fetch(S.url + '/api/admin/overview', { headers: { Authorization: 'Bearer ein-langes-admin-token-1234567890' } })).json();
    assert.strictEqual(a.csp.total, 1); assert.deepStrictEqual(a.csp.byDirective[0], { what: 'script-src-elem|evil.example', n: 1 });
    assert.ok(!JSON.stringify(a).includes('geheim'));
    assert.strictEqual((await fetch(S.url + '/api/csp-report', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{kaputt' })).status, 400);   // kaputter Body: 400, kein 5xx
  } finally { S.stop(); }
});

test('SEO: robots.txt (admin/api gesperrt, Sitemap), sitemap.xml, Fakt des Tages deterministisch', async () => {
  const S = await startServer();
  try {
    const rb = await (await fetch(S.url + '/robots.txt')).text();
    assert.match(rb, /Disallow: \/api\//); assert.match(rb, /Disallow: \/admin\.html/); assert.match(rb, /Sitemap: http:\/\/.+\/sitemap\.xml/);
    const sm = await fetch(S.url + '/sitemap.xml'); assert.match(sm.headers.get('content-type'), /xml/);
    const t = await sm.text(); assert.match(t, /<loc>[^<]+\/game\.html<\/loc>/); assert.ok(!/admin/.test(t));
    const f1 = await (await fetch(S.url + '/api/fact-of-the-day')).json(), f2 = await (await fetch(S.url + '/api/fact-of-the-day')).json();
    assert.ok(f1.ok && f1.fact.length >= 25 && /^\d{4}-\d{2}-\d{2}$/.test(f1.date)); assert.deepStrictEqual(f1, f2);
  } finally { S.stop(); }
});
