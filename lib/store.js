/**
 * Persistenz-Adapter fuer JSON-Dokumente (Rangliste, Meldungen, Statistik).
 * Alle Daten liegen zur Laufzeit im Speicher; geschrieben wird verzoegert (Debounce) in das gewaehlte Backend:
 *   file      (Standard)  data/<name>.json            -- auf Render Free fluechtig (geht beim Neustart verloren)
 *   redis                 Upstash/Redis ueber REST     -- ENV UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN (oder REDIS_REST_URL/_TOKEN)
 *   firestore             Firebase Admin               -- ENV FIREBASE_SERVICE_ACCOUNT (JSON des Dienstkontos, einzeilig) + Paket firebase-admin (modulare API v12+),
 *                                                      Sammlung FIRESTORE_COLLECTION (Standard mg_server), grosse Dokumente werden geteilt
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

// Firestore speichert maximal ~1 MB je Dokument: grosse Dokumente (z. B. Profile) werden in Teile zerlegt (<name>__0, <name>__1, ...),
// das Hauptdokument <name> enthaelt {chunks, size, updatedAt}. Altformat {json} wird weiter gelesen.
const FS_CHUNK = 700000;
function firestoreBackendFor(col) {
  return {
    kind: 'firestore',
    async load(name) {
      const m = await col.doc(name).get();
      if (!m.exists) return undefined;
      const meta = m.data() || {};
      if (typeof meta.json === 'string') return JSON.parse(meta.json);
      let json = '';
      for (let i = 0; i < (meta.chunks | 0); i++) { const d = await col.doc(name + '__' + i).get(); json += (d.exists && d.data().json) || ''; }
      return json ? JSON.parse(json) : undefined;
    },
    async save(name, data) {
      const json = JSON.stringify(data), n = Math.max(1, Math.ceil(json.length / FS_CHUNK));
      const old = await col.doc(name).get();
      const oldN = old.exists ? ((old.data() || {}).chunks | 0) : 0;
      for (let i = 0; i < n; i++) await col.doc(name + '__' + i).set({ i, json: json.slice(i * FS_CHUNK, (i + 1) * FS_CHUNK) });
      await col.doc(name).set({ chunks: n, size: json.length, updatedAt: Date.now() });       // Hauptdokument zuletzt
      for (let i = n; i < oldN; i++) await col.doc(name + '__' + i).delete();
    },
  };
}
let firestoreFactory = null;      // nur Tests: () => Sammlung
function firestoreBackend() {
  if (firestoreFactory) return firestoreBackendFor(firestoreFactory());
  let app, fsm;
  try { app = require('firebase-admin/app'); fsm = require('firebase-admin/firestore'); } catch (e) { throw new Error('Paket firebase-admin fehlt (npm i firebase-admin)'); }
  let cred;
  try { cred = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT); } catch (e) { throw new Error('FIREBASE_SERVICE_ACCOUNT ist kein gueltiges JSON'); }
  // Admin-Zugang umgeht die Sicherheitsregeln; die Sammlung (Standard mg_server) ist fuer Clients ueber die Regeln gesperrt (siehe docs/team/PROFIL-SETUP.md)
  const fapp = app.getApps().length ? app.getApp() : app.initializeApp({ credential: app.cert(cred) });
  return firestoreBackendFor(fsm.getFirestore(fapp).collection(process.env.FIRESTORE_COLLECTION || 'mg_server'));
}

const cache = new Map();      // name -> { data, timer, dirty }
let backend = fileBackend;
let lastError = null;
let failCount = 0;       // Warnungen nur beim ersten Fehler (und dann selten), keine Logflut

/** Beim Start aufrufen: waehlt das Backend und laedt die genannten Dokumente. Gibt Backend-Name zurueck. */
async function init(names, defaults) {
  const cfg = pickBackend();
  if (cfg.kind === 'file') {                       // Schreibrechte pruefen (Render: Dateisystem kann schreibgeschuetzt sein)
    try { fs.mkdirSync(DIR, { recursive: true }); const p = path.join(DIR, '.probe'); fs.writeFileSync(p, '1'); fs.unlinkSync(p); }
    catch (e) { lastError = e.message; console.warn(JSON.stringify({ level: 'warn', event: 'persist_readonly', hint: 'data/ nicht beschreibbar: Rangliste/Meldungen nur im Speicher (siehe docs/team/PERSISTENZ.md)', error: String(e.message).slice(0, 100) })); }
  }
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
    try { await backend.save(name, c.data); lastError = null; } catch (e) { lastError = e.message; failCount++; if (failCount === 1 || failCount % 100 === 0) console.warn(JSON.stringify({ level: 'warn', event: 'persist_save_failed', doc: name, count: failCount, hint: 'Daten bleiben im Speicher, bis das Speichern wieder klappt', error: String(e.message).slice(0, 120) })); }
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

module.exports = { init, get, set, flush, info, pickBackend, firestoreBackendFor, FS_CHUNK, setFirestoreFactory: (f) => { firestoreFactory = f; } };
