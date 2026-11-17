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
