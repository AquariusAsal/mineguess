const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const modPath = path.join(__dirname, '..', 'lib', 'clientip.js');

function withEnv(env, fn) {
  const old = {};
  Object.keys(env).forEach(k => { old[k] = process.env[k]; if (env[k] === null) delete process.env[k]; else process.env[k] = env[k]; });
  try { return fn(require(modPath)); } finally { Object.keys(old).forEach(k => { if (old[k] === undefined) delete process.env[k]; else process.env[k] = old[k]; }); }
}

test('Client-IP: ohne Proxy-Vertrauen werden Header ignoriert (kein Faelschen)', () => {
  withEnv({ RENDER: null, TRUST_PROXY_HEADERS: null }, ({ clientIp }) => {
    assert.strictEqual(clientIp({ 'x-forwarded-for': '6.6.6.6', 'cf-connecting-ip': '7.7.7.7' }, '::ffff:10.0.0.5'), '10.0.0.5');
  });
});
test('Client-IP: auf Render zaehlt CF-Connecting-IP, sonst X-Forwarded-For, sonst Socket', () => {
  withEnv({ RENDER: 'true' }, ({ clientIp }) => {
    assert.strictEqual(clientIp({ 'cf-connecting-ip': '203.0.113.5', 'x-forwarded-for': '1.1.1.1, 10.0.0.1' }, '10.0.0.9'), '203.0.113.5');
    assert.strictEqual(clientIp({ 'x-forwarded-for': '198.51.100.7, 10.0.0.1' }, '10.0.0.9'), '198.51.100.7');
    assert.strictEqual(clientIp({ 'cf-connecting-ip': 'kein<script>' }, '10.0.0.9'), '10.0.0.9');
    assert.strictEqual(clientIp({}, '10.0.0.9'), '10.0.0.9');
  });
});

test('Server: Rate-Limits gelten je echter Client-IP hinter Proxy (RENDER), und ohne Proxy-Vertrauen laesst sich die IP nicht faelschen', async () => {
  const { startServer } = require('./helpers.js');
  const hit = (S, headers) => fetch(S.url + '/api/report', { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, headers), body: JSON.stringify({ category: 'bug', mode: 'endless', text: 'x' + Math.random(), elapsed: 5000 }) }).then(r => r.status);
  const S = await startServer({ RENDER: 'true' });
  try {
    const a = []; for (let i = 0; i < 14; i++) a.push(await hit(S, { 'CF-Connecting-IP': '203.0.113.10' }));
    assert.ok(a.includes(429), 'Client A wird gebremst: ' + a.join());
    assert.strictEqual(await hit(S, { 'CF-Connecting-IP': '203.0.113.99' }), 200, 'Client B ist unabhaengig von A');
    assert.strictEqual(await hit(S, { 'X-Forwarded-For': '198.51.100.7, 10.0.0.1' }), 200, 'X-Forwarded-For ohne CF-Header: erste Adresse zaehlt');
  } finally { S.stop(); }
  const S2 = await startServer({ RENDER: '' });
  try {
    const b = []; for (let i = 0; i < 14; i++) b.push(await hit(S2, { 'X-Forwarded-For': '203.0.113.' + (10 + i), 'CF-Connecting-IP': '198.51.100.' + (10 + i) }));
    assert.ok(b.includes(429), 'ohne Proxy-Vertrauen zaehlen die Header nicht: ' + b.join());
  } finally { S2.stop(); }
});
