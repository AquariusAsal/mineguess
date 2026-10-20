/**
 * Persistenz-Adapter fuer JSON-Dokumente (Rangliste, Meldungen, Statistik).
 * Alle Daten liegen zur Laufzeit im Speicher; geschrieben wird verzoegert (Debounce) in das gewaehlte Backend:
 *   file      (Standard)  data/<name>.json            -- auf Render Free fluechtig (geht beim Neustart verloren)
 *   redis                 Upstash/Redis ueber REST     -- ENV UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN (oder REDIS_REST_URL/_TOKEN)
 *   firestore             Firebase Admin               -- ENV FIREBASE_SERVICE_ACCOUNT (JSON des Dienstkontos, einzeilig) + Paket firebase-admin
 * Auswahl: ENV PERSIST=file|redis|firestore, sonst automatisch nach vorhandenen ENV-Variablen (redis, firestore, file).
 * Es werden keine Zugangsdaten im Repo gespeichert; fehlt etwas oder schlaegt das Laden fehl, faellt der Adapter auf Dateien zurueck.
 */
const fs = require('fs');
const path = require('path');

const DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const PREFIX = process.env.PERSIST_PREFIX || 'mineguess:';

function pickBackend() {
  const want = (process.env.PERSIST || '').toLowerCase();
  const redisUrl = process.env.UPSTASH_REDIS_REST_URL || process.env.REDIS_REST_URL;
  const redisTok = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.REDIS_REST_TOKEN;
  if ((want === 'redis' || !want) && redisUrl && redisTok) return { kind: 'redis', url: redisUrl.replace(/\/$/, ''), token: redisTok };
  if ((want === 'firestore' || !want) && process.env.FIREBASE_SERVICE_ACCOUNT) return { kind: 'firestore' };
  return { kind: 'file' };
}

const fileBackend = {
  kind: 'file',
  async load(name) { try { return JSON.parse(fs.readFileSync(path.join(DIR, name + '.json'), 'utf8')); } catch (e) { return undefined; } },
  async save(name, data) {
    fs.mkdirSync(DIR, { recursive: true });
    const f = path.join(DIR, name + '.json'), tmp = f + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(data));
    fs.renameSync(tmp, f);
  },
};

function redisBackend(cfg) {
  const call = async (cmd) => {
    const r = await fetch(cfg.url, { method: 'POST', headers: { Authorization: 'Bearer ' + cfg.token, 'Content-Type': 'application/json' }, body: JSON.stringify(cmd) });
    if (!r.ok) throw new Error('redis http ' + r.status);
    return (await r.json()).result;
  };
  return {
    kind: 'redis',
    async load(name) { const v = await call(['GET', PREFIX + name]); return v == null ? undefined : JSON.parse(v); },
    async save(name, data) { await call(['SET', PREFIX + name, JSON.stringify(data)]); },
  };
}

function firestoreBackend() {
  let admin;
  try { admin = require('firebase-admin'); } catch (e) { throw new Error('Paket firebase-admin fehlt (npm i firebase-admin)'); }
  let cred;
  try { cred = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT); } catch (e) { throw new Error('FIREBASE_SERVICE_ACCOUNT ist kein gueltiges JSON'); }
  if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(cred) });
  const col = admin.firestore().collection('mg_server');
  return {
    kind: 'firestore',
    async load(name) { const d = await col.doc(name).get(); return d.exists ? JSON.parse(d.data().json) : undefined; },
    async save(name, data) { await col.doc(name).set({ json: JSON.stringify(data), updatedAt: Date.now() }); },
  };
}

const cache = new Map();      // name -> { data, timer, dirty }
let backend = fileBackend;
let lastError = null;

/** Beim Start aufrufen: waehlt das Backend und laedt die genannten Dokumente. Gibt Backend-Name zurueck. */
async function init(names, defaults) {
  const cfg = pickBackend();
  try {
    backend = cfg.kind === 'redis' ? redisBackend(cfg) : cfg.kind === 'firestore' ? firestoreBackend() : fileBackend;
    for (const n of names) {
      let v = await backend.load(n);
      if (v === undefined && backend !== fileBackend) v = await fileBackend.load(n);   // Erstumstellung: Dateistand uebernehmen
      cache.set(n, { data: v === undefined ? defaults[n] : v, timer: null, dirty: false });
    }
  } catch (e) {
    lastError = e.message;
    console.warn(JSON.stringify({ level: 'warn', event: 'persist_fallback', backend: cfg.kind, error: String(e.message).slice(0, 120) }));
    backend = fileBackend;
    for (const n of names) {
      const v = await fileBackend.load(n);
      cache.set(n, { data: v === undefined ? defaults[n] : v, timer: null, dirty: false });
    }
  }
  return backend.kind;
}
function get(name) { const c = cache.get(name); return c ? c.data : undefined; }
function set(name, data) { const c = cache.get(name) || { timer: null }; c.data = data; cache.set(name, c); schedule(name); }
function schedule(name, delay) {
  const c = cache.get(name); if (!c || c.timer) return;
  c.dirty = true;
  c.timer = setTimeout(async () => {
    c.timer = null; c.dirty = false;
    try { await backend.save(name, c.data); lastError = null; } catch (e) { lastError = e.message; console.warn(JSON.stringify({ level: 'warn', event: 'persist_save_failed', doc: name, error: String(e.message).slice(0, 120) })); }
  }, delay == null ? 2000 : delay);
  if (c.timer.unref) c.timer.unref();
}
/** Alle offenen Aenderungen sofort schreiben (z. B. beim Beenden). */
async function flush() {
  for (const [name, c] of cache) {
    if (c.timer) { clearTimeout(c.timer); c.timer = null; }
    if (c.dirty) { c.dirty = false; try { await backend.save(name, c.data); } catch (e) { lastError = e.message; } }
  }
}
function info() { return { backend: backend.kind, lastError }; }

module.exports = { init, get, set, flush, info, pickBackend };
