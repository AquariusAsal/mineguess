const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const http = require('http');

const net = require('net');
// freien Port vom Betriebssystem holen (keine Kollision mit laufenden Servern)
function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => { const p = srv.address().port; srv.close(() => resolve(p)); });
  });
}

async function startServer(env) {
  const port = await freePort();
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mg-test-'));
  const child = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
    env: Object.assign({}, process.env, { PORT: String(port), DATA_DIR: dataDir, RANKED_SECRET: 'test-secret', RANKED_STRICT: '0', RANKED_NEW_KEYS_HOUR: '5000', RANKED_NEW_KEYS_DAY: '50000', LOG_LEVEL: 'silent' }, env || {}),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let out = '';
  child.stdout.on('data', d => { out += d; });
  child.stderr.on('data', d => { out += d; });
  const url = 'http://127.0.0.1:' + port;
  for (let i = 0; i < 200; i++) {
    try { const r = await fetch(url + '/health'); if (r.ok) return { url, port, child, dataDir, stop: () => { child.kill(); } }; } catch (e) {}
    await new Promise(r => setTimeout(r, 150));
  }
  child.kill();
  throw new Error('Server startet nicht: ' + out.slice(-400));
}

async function post(url, body, headers) {
  const r = await fetch(url, { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, headers || {}), body: JSON.stringify(body) });
  let j = null; try { j = await r.json(); } catch (e) {}
  return { status: r.status, body: j };
}

// Rohe Anfrage ohne URL-Normalisierung (fuer Pfadtests)
function rawGet(port, rawPath) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path: rawPath, method: 'GET' }, res => { res.resume(); res.on('end', () => resolve(res.statusCode)); });
    req.on('error', reject); req.end();
  });
}

module.exports = { startServer, post, rawGet };
