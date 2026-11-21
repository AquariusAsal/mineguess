/**
 * MineGuess – Multiplayer Server (Buzzer Edition)
 * Node.js + Express + Socket.io
 *
 * Fragen: ausschliesslich questions.json (gleiche Datei wie im Solo-Spiel).
 * Antwortpruefung: answer-check.js (gleiche Logik wie im Browser).
 */

const express    = require('express');
const http       = require('http');
const { Server } = require('socket.io');
const path       = require('path');
const fs         = require('fs');
const crypto     = require('crypto');
const zlib       = require('zlib');
const MGAnswer   = require('./answer-check.js');
const MGRanked   = require('./ranked.js');
const store      = require('./lib/store.js');
const { clientIp } = require('./lib/clientip.js');
const CraftCheck = require('./craft-check.js');
const { badText } = require('./lib/profiles.js');
const { redactText, purgeReports } = require('./lib/privacy.js');
const PKG        = (() => { try { return require('./package.json'); } catch (e) { return {}; } })();

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, { cors: { origin: '*' }, maxHttpBufferSize: 96 * 1024 });

// ── Sicherheits-Header, CSP (zunaechst nur Report-Only), robots.txt, sitemap.xml ─────────────────────────
// CSP_MODE: 'report' (Standard, blockiert nichts, meldet nur), 'enforce' (blockiert) oder 'off'.
const CSP_MODE = ['enforce', 'off'].includes(process.env.CSP_MODE) ? process.env.CSP_MODE : 'report';
const CSP_VALUE = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://www.gstatic.com https://apis.google.com https://open.spotify.com https://embed-cdn.spotifycdn.com",     // Inline-Skripte der Seiten, Firebase (gstatic), Google-Login, Spotify iFrame-API
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.googleusercontent.com https://i.scdn.co https://www.gstatic.com https://embed-cdn.spotifycdn.com",
  "font-src 'self' data:",
  "media-src 'self' blob:",
  "connect-src 'self' ws: wss: https://*.googleapis.com https://*.firebaseio.com wss://*.firebaseio.com https://open.spotify.com https://embed-cdn.spotifycdn.com https://*.spotify.com",   // socket.io, Firebase Auth/Firestore
  "frame-src https://open.spotify.com https://embed-cdn.spotifycdn.com https://accounts.google.com https://*.firebaseapp.com https://apis.google.com",
  "worker-src 'self' blob:", "manifest-src 'self'",
  "object-src 'none'", "base-uri 'self'", "form-action 'self'", "frame-ancestors 'self'",
  'report-uri /api/csp-report',
].join('; ');
let cspTotal = 0; const cspMap = new Map();      // "direktive|host" -> Anzahl (ohne Pfade, Queries, IPs)
const cspTop = () => [...cspMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20).map(([k, n]) => ({ what: k, n }));
app.use((req, res, next) => {
  res.set({ 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin', 'X-Frame-Options': 'SAMEORIGIN',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()' });
  const https = req.headers['x-forwarded-proto'] === 'https' || req.secure;
  if (https && process.env.RENDER) res.set('Strict-Transport-Security', 'max-age=15552000');        // nur ueber https (Render), kein includeSubDomains/preload
  if (CSP_MODE !== 'off' && !req.path.startsWith('/api/') && !req.path.startsWith('/socket.io/') && req.path !== '/health') res.set(CSP_MODE === 'enforce' ? 'Content-Security-Policy' : 'Content-Security-Policy-Report-Only', CSP_VALUE);
  next();
});
app.post('/api/csp-report', express.json({ type: ['application/json', 'application/csp-report', 'application/reports+json'], limit: '8kb' }), (req, res) => {
  res.status(204).end();
  if (!apiAllowed('csp', req.ip, 20, 3000)) return;
  try {
    const b = req.body; const list = Array.isArray(b) ? b : [b];
    list.slice(0, 5).forEach(x => {
      const r = (x && (x['csp-report'] || x.body)) || {};
      const dir = String(r['effective-directive'] || r['violated-directive'] || r.effectiveDirective || '?').split(' ')[0].slice(0, 40);
      let blocked = String(r['blocked-uri'] || r.blockedURL || r.blockedUri || '?');
      try { blocked = blocked.includes('://') ? new URL(blocked).host : blocked.split(/[?#]/)[0].slice(0, 20); } catch (e) { blocked = '?'; }
      const k = dir + '|' + blocked.slice(0, 60); cspTotal++; cspMap.set(k, (cspMap.get(k) || 0) + 1);
      if (cspMap.size > 300) cspMap.clear();
    });
  } catch (e) { /* ignorieren */ }
});
const siteBase = (req) => (process.env.SITE_URL || ((req.headers['x-forwarded-proto'] === 'https' || req.secure ? 'https' : 'http') + '://' + (req.headers.host || 'localhost'))).replace(/\/+$/, '');
app.get('/robots.txt', (req, res) => {
  res.type('text/plain').set('Cache-Control', 'public, max-age=3600').send(['User-agent: *', 'Disallow: /api/', 'Disallow: /admin.html', 'Disallow: /health', 'Disallow: /socket.io/', 'Allow: /', '', 'Sitemap: ' + siteBase(req) + '/sitemap.xml', ''].join('\n'));
});
app.get('/sitemap.xml', (req, res) => {
  const b = siteBase(req), day = new Date().toISOString().slice(0, 10);
  const urls = [['/', '1.0'], ['/game.html', '0.9'], ['/multiplayer.html', '0.8'], ['/datenschutz.html', '0.2'], ['/impressum.html', '0.2']];
  res.type('application/xml').set('Cache-Control', 'public, max-age=3600').send('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + urls.map(([u, p]) => `  <url><loc>${b}${u}</loc><lastmod>${day}</lastmod><priority>${p}</priority></url>`).join('\n') + '\n</urlset>\n');
});
// Fakt des Tages: deterministisch nach Datum (Europe/Berlin) aus den vorhandenen Funfacts, ohne Personenbezug
app.get('/api/fact-of-the-day', (req, res) => {
  res.set('Cache-Control', 'public, max-age=600');
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(new Date());
  const pool = (Array.isArray(allQuestions) ? allQuestions : []).filter(q => q.funFact && String(q.funFact).length >= 25 && String(q.funFact).length <= 240 && q.type !== 'crafting');
  if (!pool.length) return res.status(503).json({ ok: false });
  let h = 2166136261; for (const c of day) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  const q = pool[h % pool.length];
  res.json({ ok: true, date: day, fact: String(q.funFact), category: q.category, id: q.id });
});
// Admin-Seite (falls vorhanden): nie indexieren, nie im Service-Worker-Cache (tools/gen-sw-assets.js kennt sie nicht)
app.use((req, res, next) => { if (req.path === '/admin.html') res.set('X-Robots-Tag', 'noindex, nofollow, noarchive'); next(); });
// ── Statische Dateien: nur Whitelist (keine Server-, Config-, Daten- oder Doku-Dateien) ──────────
// Der Pfad wird zuerst dekodiert und auf kanonische Form geprueft ('./', '//', '..', '%', Backslash, NUL werden abgelehnt),
// erst danach gegen die Whitelist geprueft. So greifen Umgehungen wie /./server.js oder //server.js nicht.
const ROOT_FILE = /^\/[A-Za-z0-9_-]+\.(html|js|css|json|png|jpg|jpeg|svg|webp|gif|ico|mp3|ogg|wav|woff2?|webmanifest)$/i;
const ROOT_DENY = /^\/(server|package|package-lock|google-services|fetch-wiki)\.(js|json)$/i;
const ALLOWED_DIRS = /^\/(assets|fonts|sounds)\/[A-Za-z0-9_./-]+$/;
app.use((req, res, next) => {
  let p = req.path;
  try { p = decodeURIComponent(p); } catch (e) { return res.status(400).end(); }
  if (/[\\\0%]|\/\/|(^|\/)\.{1,2}(\/|$)/.test(p) || path.posix.normalize(p) !== p) return res.status(404).end();   // nicht kanonisch
  if (p === '/' || p === '/health' || p === '/premium.html' || p.startsWith('/api/') || p.startsWith('/socket.io/')) return next();
  if (ROOT_FILE.test(p) && !ROOT_DENY.test(p)) return next();
  if (ALLOWED_DIRS.test(p) && !/(^|\/)\./.test(p)) return next();
  return res.status(404).end();
});
// ── Strukturierte Logs (ohne personenbezogene Daten: keine Namen, IDs, IPs) und Zaehler ───────
const counters = { errors: 0, rateLimited: 0, rankedRuns: 0, rankedAnswers: 0, reports: 0 };
const BOOT = Date.now();
function log(level, event, fields) {
  if (level === 'error') counters.errors++;
  if (event === 'ranked_start') counters.rankedRuns++;
  if (event === 'ranked_answer') counters.rankedAnswers++;
  if (process.env.LOG_LEVEL === 'silent') return;
  console.log(JSON.stringify(Object.assign({ t: new Date().toISOString(), level, event }, fields || {})));
}
function healthData() {
  const st = store.info();
  return { ok: true, version: PKG.version || null, uptimeSec: Math.round((Date.now() - BOOT) / 1000), rooms: Object.keys(rooms).length,
    players: Object.values(rooms).reduce((n, r) => n + Object.values(r.players).filter(p => p.connected).length, 0),
    questions: Array.isArray(allQuestions) ? allQuestions.length : 0, persist: st.backend, persistError: !!st.lastError, mail: mailer.kind(), mailErrors: mailer.stats().failed, mailSent: mailer.stats().sent, idCheck: require('./lib/idtoken.js').available() ? 'on' : 'off', counters };
}
app.get('/health', (req, res) => { res.set('Cache-Control', 'no-store'); res.json(healthData()); });

// ── Rankliste: serverseitiger Fallback (oeffentlich lesbar, ohne Firestore-Regeln) ───────────
// Speicher: RAM + data/ranked.json. Auf Hosts mit fluechtigem Dateisystem (z. B. Render) geht die Datei beim Neustart verloren.
app.set('trust proxy', 1);
// req.ip = echte Client-IP (hinter Render/Cloudflare ueber CF-Connecting-IP bzw. X-Forwarded-For), damit Rate-Limits je Client statt je Proxy gelten
Object.defineProperty(app.request, 'ip', { configurable: true, get() { return clientIp(this.headers, this.socket && this.socket.remoteAddress); } });
const RANKED_MAX_ENTRIES = 5000;
const rankedStore = new Map();            // key -> Eintrag
function hydrateRanked() {
  const arr = store.get('ranked');
  if (Array.isArray(arr)) arr.forEach(e => { if (e && typeof e.key === 'string' && Number.isInteger(e.mmr)) rankedStore.set(e.key, e); });
}
function saveRankedSoon() { store.set('ranked', [...rankedStore.values()]); }
const ipBuckets = new Map();
function ipAllowed(ip) {
  const now = Date.now();
  let b = ipBuckets.get(ip);
  if (!b) { b = { tokens: 10, ts: now }; ipBuckets.set(ip, b); }
  b.tokens = Math.min(10, b.tokens + (now - b.ts) / 6000);   // 10 Burst, 1 je 6 s
  b.ts = now;
  if (b.tokens < 1) return false;
  b.tokens -= 1;
  if (ipBuckets.size > 5000) ipBuckets.clear();
  return true;
}
const keyHash = (k) => crypto.createHash('sha1').update(k).digest('hex').slice(0, 10);
const ID_RE = /^[A-Za-z0-9_-]{6,64}$/;

app.get('/api/ranked', (req, res) => {
  res.set('Cache-Control', 'no-store');
  const list = [...rankedStore.values()]
    .filter(e => e.verified && e.games >= 1)
    .sort((a, b) => b.mmr - a.mmr)
    .slice(0, 100)
    .map(e => ({ key: keyHash(e.key), uid: e.uid || null, name: e.name, tier: e.tier, division: e.division,
                 mmr: e.mmr, lastPlayedDay: e.lastPlayedDay || '', mmrToday: e.mmrToday || 0 }));
  res.json(list);
});

app.post('/api/ranked', express.json({ limit: '2kb' }), (req, res) => {
  try {
    if (!ipAllowed(req.ip)) return res.status(429).json({ ok: false });
    if (process.env.RANKED_LEGACY !== '1') return res.json({ ok: true, legacy: true });   // Anti-Cheat: Client-Werte haben keine Wirkung auf die Rangliste (nur /api/ranked/*)
    const b = req.body || {};
    const mmr = b.mmr;                      // nur echte Zahlen (kein null, String, Objekt)
    if (typeof mmr !== 'number') return res.status(400).json({ ok: false });
    if (!Number.isInteger(mmr) || mmr < 0 || mmr > 20000) return res.status(400).json({ ok: false });
    if (typeof b.name !== 'string' && typeof b.name !== 'number') return res.status(400).json({ ok: false });   // kein Objekt/Array/fehlend
    const name = cleanText(b.name, 20);
    if (!name) return res.status(400).json({ ok: false });
    let key;
    if (typeof b.uid === 'string' && ID_RE.test(b.uid)) key = 'u:' + b.uid;
    else if (typeof b.gid === 'string' && ID_RE.test(b.gid)) key = 'g:' + b.gid;
    else key = 'n:' + name.toLowerCase();
    const now = Date.now();
    const prev = rankedStore.get(key);
    if (!prev && mmr > 5000) return res.status(400).json({ ok: false });
    let hourStart = prev ? prev.hourStart : now, hourMmr = prev ? prev.hourMmr : mmr;
    if (prev) {
      if (mmr > prev.mmr + 500) return res.status(400).json({ ok: false });        // unplausibler Sprung je Meldung
      if (now - hourStart > 3600000) { hourStart = now; hourMmr = prev.mmr; }
      if (mmr > hourMmr + 1500) return res.status(400).json({ ok: false });        // und je Stunde
    }
    const rd = MGRanked.rankData(mmr);
    const day = typeof b.lastPlayedDay === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(b.lastPlayedDay) ? b.lastPlayedDay : '';
    const mmrToday = Math.max(-1500, Math.min(1500, Math.round(Number(b.mmrToday) || 0)));
    rankedStore.set(key, {
      key, uid: key.startsWith('u:') ? key.slice(2) : null, name, mmr, tier: rd.tier, division: rd.division,
      lastPlayedDay: day, mmrToday, updatedAt: now, hourStart, hourMmr,
    });
    if (rankedStore.size > RANKED_MAX_ENTRIES) {
      const drop = [...rankedStore.values()].sort((a, b2) => a.mmr - b2.mmr || a.updatedAt - b2.updatedAt)[0];
      if (drop) rankedStore.delete(drop.key);
    }
    saveRankedSoon();
    res.json({ ok: true, key: keyHash(key) });
  } catch (e) {
    res.status(400).json({ ok: false });
  }
});

// ── Block 2: Fragen melden und anonyme Statistik (data/ wird nicht ausgeliefert) ───────────
const REPORT_REASONS = new Set(['falsch', 'unklar', 'doppelt', 'beleidigend', 'sonstiges']);
const knownQuestionId = (id) => Number.isInteger(id) && Array.isArray(allQuestions) && allQuestions.some(q => q.id === id);
// eigener, engerer Bucket je IP und Zweck (Meldungen: 1 je 30 s, Burst 3)
const apiBuckets = new Map();
function apiAllowed(kind, ip, burst, refillMs) {
  const k = kind + '|' + ip, now = Date.now();
  let b = apiBuckets.get(k);
  if (!b) { b = { tokens: burst, ts: now }; apiBuckets.set(k, b); }
  b.tokens = Math.min(burst, b.tokens + (now - b.ts) / refillMs);
  b.ts = now;
  if (apiBuckets.size > 10000) apiBuckets.clear();
  if (b.tokens < 1) return false;
  b.tokens -= 1;
  return true;
}
// Meldungen aus allen Modi (lib/reports.js): Validierung, Honeypot, Duplikate, Speicherung (12 Monate) und Mail an REPORT_MAIL_TO (nur ENV, nie im Client)
const REPORT_BURST = Number(process.env.REPORT_RATE_BURST) > 0 ? Number(process.env.REPORT_RATE_BURST) : 10;   // Burst je IP (Tests erhoehen ihn)
const mailer = require('./lib/mailer.js').create({ log });
const reportsApi = require('./lib/reports.js').create({
  store, cleanText, redactText, mailer, log,
  profileOfToken: (t) => (profilesApi ? profilesApi.pidOfToken(t) : null),
  onConfirm: (pid) => (profilesApi ? profilesApi.addHunter(pid) : false),
  knownQuestion: (id) => { const q = Array.isArray(allQuestions) ? allQuestions.find(x => x.id === id) : null; return q ? String(q.question || 'Frage') : ''; },
});
app.post('/api/report', express.json({ limit: '6kb' }), (req, res) => {
  try {
    if (!apiAllowed('report', req.ip, REPORT_BURST, 12000) || !apiAllowed('report-h', req.ip, 40, 90000)) return res.status(429).json({ ok: false });
    const r = reportsApi.process(req.body, req.headers);
    res.status(r.status).json(r.body);
  } catch (e) { res.status(400).json({ ok: false }); }
});

// ── Admin-Uebersicht (nur mit ENV ADMIN_TOKEN, sonst 404): Zahlen ohne personenbezogene Daten, nie in der Statik-Liste ─────────
const ADMIN_TOKEN = String(process.env.ADMIN_TOKEN || '');
const adminOn = ADMIN_TOKEN.length >= 12;
if (process.env.ADMIN_TOKEN && !adminOn) log('warn', 'admin_token_short', { hint: 'ADMIN_TOKEN muss mindestens 12 Zeichen haben, die Admin-Uebersicht bleibt aus' });
const adminHash = adminOn ? crypto.createHash('sha256').update(ADMIN_TOKEN).digest() : null;
const adminFails = new Map();      // IP -> { n, until }
function adminSummary() {
  const reports = Array.isArray(store.get('reports')) ? store.get('reports') : [];
  const tally = (fn) => { const m = {}; reports.forEach(r => { const k = fn(r); if (k != null) m[k] = (m[k] || 0) + (r.count || 1); }); return m; };
  const byQ = tally(r => (r.questionId != null ? r.questionId : null));
  const day = (t) => new Date(t).toISOString().slice(0, 10), now = Date.now(), perDay = {};
  reports.forEach(r => { if (r.ts && now - r.ts < 14 * 86400000) perDay[day(r.ts)] = (perDay[day(r.ts)] || 0) + (r.count || 1); });
  const rs = Object.values(rooms), byPhase = {};
  rs.forEach(r => { byPhase[r.phase] = (byPhase[r.phase] || 0) + 1; });
  const soc = profilesApi && profilesApi.social ? profilesApi.social.soc() : null;
  return {
    ok: true, generatedAt: new Date().toISOString(), health: healthData(),
    reports: { total: reports.reduce((n, r) => n + (r.count || 1), 0), entries: reports.length, byCategory: tally(r => r.category || 'frage'), byMode: tally(r => r.mode || 'altes Format'), byReason: tally(r => (!r.category || r.category === 'frage' ? r.reason : null)),
      topQuestions: Object.entries(byQ).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([id, n]) => { const q = allQuestions.find(x => x.id === Number(id)); return { id: Number(id), n, question: q ? String(q.question).slice(0, 100) : null }; }), perDay },
    rooms: { total: rs.length, public: rs.filter(r => r.isPublic).length, private: rs.filter(r => !r.isPublic).length, byPhase, playersConnected: rs.reduce((n, r) => n + Object.values(r.players).filter(p => p.connected).length, 0) },
    ranked: { entries: rankedStore.size, activeRuns: rankedApi.runs.size },
    profiles: profilesApi ? { total: Object.keys(profilesApi.profiles()).length, groups: soc ? Object.keys(soc.groups || {}).length : 0, duels: soc ? Object.keys(soc.duels || {}).length : 0 } : null,
    errors: counters, csp: { total: cspTotal, byDirective: cspTop() },
  };
}
// gemeinsame Pruefung aller Admin-Routen: ohne ENV 404, zeitkonstanter Tokenvergleich, 5 Fehlversuche = 10 min Sperre
function adminGuard(req, res) {
  res.set({ 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow, noarchive' });
  if (!adminOn) { res.status(404).end(); return false; }                        // ohne ENV nicht vorhanden
  const ip = req.ip, f = adminFails.get(ip);
  if (f && f.until > Date.now()) { res.status(429).json({ ok: false }); return false; }
  if (!apiAllowed('admin', ip, 30, 2000)) { res.status(429).json({ ok: false }); return false; }
  const h = String(req.headers.authorization || ''), given = h.startsWith('Bearer ') ? h.slice(7) : String(req.headers['x-admin-token'] || '');
  const ok = crypto.timingSafeEqual(crypto.createHash('sha256').update(given).digest(), adminHash);          // zeitkonstanter Vergleich
  if (!ok) {
    const e = f && !(f.until > 0 && f.until <= Date.now()) ? f : { n: 0, until: 0 };
    e.n++; if (e.n >= 5) { e.until = Date.now() + 10 * 60 * 1000; e.n = 0; }                               // 5 Fehlversuche: 10 min Sperre
    adminFails.set(ip, e); if (adminFails.size > 5000) adminFails.clear();
    res.status(401).json({ ok: false }); return false;
  }
  adminFails.delete(ip);
  return true;
}
app.get('/api/admin/overview', (req, res) => { if (adminGuard(req, res)) res.json(adminSummary()); });
// Meldungen pruefen (ohne Freitext/Kontakt/Spieler): Liste und Aktion confirm|reject|reopen; confirm vergibt Fehlerjaeger-Punkte an verknuepfte Profile
app.get('/api/admin/reports', (req, res) => { if (adminGuard(req, res)) res.json({ ok: true, reports: reportsApi.list({ status: req.query.status, limit: req.query.limit }) }); });
app.post('/api/admin/report-action', express.json({ limit: '1kb' }), (req, res) => {
  if (!adminGuard(req, res)) return;
  const b = req.body || {}; const r = reportsApi.act(b.id, b.action); res.status(r.status).json(r.body);
});
// Geprueft-Siegel: Admin markiert Fragen als geprueft (Store 'qreview'), oeffentlich nur die Liste der IDs
app.post('/api/admin/question-review', express.json({ limit: '2kb' }), (req, res) => {
  if (!adminGuard(req, res)) return;
  const b = req.body || {};
  const ids = (Array.isArray(b.questionIds) ? b.questionIds : [b.questionId]).filter((x) => Number.isInteger(x) && knownQuestionId(x)).slice(0, 500);
  if (!ids.length || typeof b.verified !== 'boolean') return res.status(400).json({ ok: false });
  let rv = store.get('qreview'); if (!rv || typeof rv !== 'object' || Array.isArray(rv)) rv = {};
  ids.forEach((id) => { if (b.verified) rv[id] = Date.now(); else delete rv[id]; });
  store.set('qreview', rv); res.json({ ok: true, verified: Object.keys(rv).length });
});
app.get('/api/verified-questions', (req, res) => {
  res.set('Cache-Control', 'public, max-age=300');
  const rv = store.get('qreview');
  res.json({ ok: true, ids: rv && typeof rv === 'object' ? Object.keys(rv).map(Number).sort((a, b) => a - b) : [] });
});

app.post('/api/stats', express.json({ limit: '1kb' }), (req, res) => {
  try {
    if (!apiAllowed('stats', req.ip, 300, 100)) return res.json({ ok: true, dropped: true });   // nie 429 (Konsolenfehler im Client): ueberzaehlige Zaehler werden still verworfen
    const b = req.body || {};
    if (!knownQuestionId(b.questionId)) return res.status(400).json({ ok: false });
    if (typeof b.correct !== 'boolean') return res.status(400).json({ ok: false });
    const att = b.attempts;
    if (!Number.isInteger(att) || att < 1 || att > 10) return res.status(400).json({ ok: false });
    let statsCache = store.get('qstats');
    if (!statsCache || typeof statsCache !== 'object' || Array.isArray(statsCache)) statsCache = {};
    const s = statsCache[b.questionId] || (statsCache[b.questionId] = { n: 0, correct: 0, attempts: 0 });
    s.n++; if (b.correct) s.correct++; s.attempts += att;     // nur Zaehler, keine Personendaten
    store.set('qstats', statsCache);
    res.json({ ok: true });
  } catch (e) { res.status(400).json({ ok: false }); }
});

let profilesApi = null;       // Profile/Soziales (wird nach dem Laden des Speichers eingehaengt)
const rankedApi = require('./lib/ranked-api.js').create({ app, express, getQuestions: () => allQuestions, rankedStore, saveRankedSoon, cleanText, apiAllowed, log, keyHash });

// Premium wurde abgeschafft: alte Links auf die Startseite
app.get('/premium.html', (req, res) => res.redirect(301, '/'));
// Text-Dateien gzip-komprimiert ausliefern (im Speicher gecacht, nach Aenderungszeit); Pfad ist durch die Whitelist oben schon kanonisch
const GZ_EXT = new Set(['.html', '.js', '.css', '.json']);
const gzCache = new Map();
app.use((req, res, next) => {
  const ext = path.extname(req.path).toLowerCase();
  if (req.method !== 'GET' || !GZ_EXT.has(ext) || !String(req.headers['accept-encoding'] || '').includes('gzip')) return next();
  const file = path.join(__dirname, decodeURIComponent(req.path));
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) return next();
    const send = (c) => {
      res.set({ 'Content-Type': ext === '.json' ? 'application/json; charset=utf-8' : ext === '.html' ? 'text/html; charset=utf-8' : ext === '.css' ? 'text/css; charset=utf-8' : 'application/javascript; charset=utf-8',
                'Content-Encoding': 'gzip', 'Vary': 'Accept-Encoding', 'Cache-Control': 'no-cache' });
      res.end(c.buf);
    };
    const c = gzCache.get(file);
    if (c && c.mtime === st.mtimeMs) return send(c);
    fs.readFile(file, (e, data) => {
      if (e) return next();
      zlib.gzip(data, { level: 6 }, (e2, buf) => {
        if (e2) return next();
        const entry = { mtime: st.mtimeMs, buf };
        gzCache.set(file, entry);
        send(entry);
      });
    });
  });
});
app.use(express.static(path.join(__dirname), {
  dotfiles: 'ignore',
  setHeaders(res, file) {
    if (/\.(html|json|js|css)$/i.test(file)) res.setHeader('Cache-Control', 'no-cache');
    else if (/[\\/]assets[\\/]/.test(file)) res.setHeader('Cache-Control', 'public, max-age=86400');   // Videos, Poster, Texturen (Range: express.static)
  },
}));

// ── Fragen laden (questions.json ist die einzige Quelle) ─────────────────────
function loadQuestions() {
  const raw = JSON.parse(fs.readFileSync(path.join(__dirname, 'questions.json'), 'utf8'));
  if (!Array.isArray(raw)) throw new Error('questions.json ist kein Array');
  const ok = [];
  raw.forEach((q, i) => {
    const bad = (m) => console.warn(`Frage #${i} (id ${q && q.id}) uebersprungen: ${m}`);
    if (!q || typeof q.question !== 'string' || typeof q.category !== 'string') return bad('Felder fehlen');
    if (q.type === 'number') {
      if (typeof q.answer !== 'number' || !isFinite(q.answer)) return bad('answer keine Zahl');
    } else if (q.type === 'entity') {
      if (typeof q.answer !== 'string' || !Array.isArray(q.acceptedAnswers) || !q.acceptedAnswers.length) return bad('acceptedAnswers fehlt');
    } else if (q.type === 'crafting') {
      if (typeof q.answer !== 'string' || !Array.isArray(q.acceptedAnswers) || !q.acceptedAnswers.length) return bad('acceptedAnswers fehlt');
      if (!Array.isArray(q.grid) || q.grid.length !== 3 || q.grid.some(r => !Array.isArray(r) || r.length !== 3)) return bad('grid ungueltig');
    } else return bad('type unbekannt');
    ok.push(q);
  });
  return ok;
}
let allQuestions = [];
try {
  allQuestions = loadQuestions();
  log('info', 'questions_loaded', { count: allQuestions.length });
} catch (e) { console.error('Fragen laden fehlgeschlagen:', e.message); }
if (!allQuestions.length) { console.error('Keine Fragen – Abbruch.'); process.exit(1); }
const KNOWN_CATEGORIES = new Set(allQuestions.map(q => q.category));

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; }
  return a;
}

// ── Konstanten ────────────────────────────────────────────────────────────────
const BUZZER_TIME  = 30;
const ANSWER_TIME  = 10;          // Antwortphase fuer ALLE nach dem Laeuten (GeoGuessr-Stil)
const FAST_TEST = process.env.MP_TEST_FAST === '1';          // nur Tests: kurze Pausen und 2-Runden-Spiele
const RESULT_TIME  = FAST_TEST ? 1 : 6;
const MAX_PLAYERS  = 8;
// Klassenraum (Lehrkraft + Schueler ohne Konto): feste Namensliste, kein Freitext, keine Speicherung, Auto-Loeschung nach Inaktivitaet
const CLASS_NAMES = require('./lib/classnames.js').NAMES;
const CLASS_MAX = 30;                                                                      // Schueler je Klassenraum
const CLASS_IDLE_MS = Number(process.env.CLASS_IDLE_MS) > 0 ? Number(process.env.CLASS_IDLE_MS) : 4 * 3600 * 1000;   // Inaktivitaet bis zur Loeschung (Tests verkuerzen)
const CLASS_SWEEP_MS = Number(process.env.CLASS_SWEEP_MS) > 0 ? Number(process.env.CLASS_SWEEP_MS) : 60 * 1000;
const MAX_CLASSES = 200;
const CLASS_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';                              // ohne I, O, 0, 1
const newClassCode = () => { for (let i = 0; i < 60; i++) { let c = ''; for (let k = 0; k < 6; k++) c += CLASS_CODE_CHARS[crypto.randomInt(CLASS_CODE_CHARS.length)]; if (!rooms[c.toLowerCase()]) return c; } return null; };
const DEFAULT_ROUNDS = 10;
const ROUND_CHOICES  = FAST_TEST ? [2, 10, 25, 50, 100] : [10, 25, 50, 100];
const ANSWER_CHOICES = [8, 10, 15];
const BUILD_CHOICES = ['off', 'mix', 'only'];
const TF_CHOICES = ['mix', 'only', 'off'];      // Wahr oder Mythos im Raum: mix (Standard) | only (nur tf) | off (keine tf)
const BUILD_SECONDS = [45, 60];
const BUILD_FACTORS = [1, 0.8, 0.65, 0.5, 0.4, 0.3, 0.25, 0.2];     // Punkte nach Zeitrang der richtigen Loesung
const BUILD_CHECKS = 3;
const TEAM_SYMBOLS = ['schwert', 'spitzhacke', 'schild', 'bogen', 'apfel', 'diamant', 'smaragd', 'totem', 'creeper', 'tnt', 'fackel', 'herz'];
const TEAM_COLORS = ['rot', 'blau', 'gruen', 'gelb', 'lila', 'orange', 'tuerkis', 'pink'];
const TEAM_DEFAULTS = [
  { id: 't1', name: 'Team Rot', symbol: 'schwert', color: 'rot' }, { id: 't2', name: 'Team Blau', symbol: 'schild', color: 'blau' },
  { id: 't3', name: 'Team Gruen', symbol: 'bogen', color: 'gruen' }, { id: 't4', name: 'Team Gelb', symbol: 'fackel', color: 'gelb' },
];
const DIFFICULTIES   = { mixed: null, easy: [1, 2], medium: [2, 3], hard: [3, 4] };
const MIN_PLAYERS_SETTING = 2;
const atime = (room) => room.answerTime || ANSWER_TIME;
const PTS_CORRECT  = 150;
const PTS_SPEED    = 50;
const PTS_WRONG    = 50;
const BELL_BONUS     = 50;        // Zusatz fuer den Laeutenden (exakt oder angenaehert im Band)
const PTS_BELL_WRONG = 100;       // Laeutender komplett daneben / ohne Antwort
const TOTEM_STREAK   = 3;         // Runden in Folge mit Punkten bis zum Totem
const TOTEM_DECISION_MS = 5000;   // Bedenkzeit 'Abzug oder Totem einloesen?'
const APPROACH_LIMIT = 0.35;       // relative Abweichung, bis zu der eine Zahl als 'Annaeherung' zaehlt
const REVEAL_DELAY = FAST_TEST ? 200 : 2500;         // ms zwischen answers_revealed und result           // Abzug bei falscher Antwort / Timeout nach Buzz (Score faellt nicht unter 0)
const BUZZ_WINDOW  = 120;          // ms: gleichzeitige Buzzes werden latenzbereinigt verglichen
const GRACE_MS     = 30000;        // Reconnect-Fenster
const MAX_NAME_LEN = 16;
const MAX_ANSWER_LEN = 100;
const MAX_ROOMS    = 300;
const MAX_SKIN_LEN = 24000;      // data-URL-Laenge; dekodiert max. 16 KB
const MAX_SKIN_BYTES = 16384;
const OPTION_COUNT = 8;

// ── Eingabe-Hilfen ────────────────────────────────────────────────────────────
function cleanText(v, max) {
  if (typeof v !== 'string' && typeof v !== 'number') return '';
  return String(v).replace(/[\u0000-\u001f\u007f<>"`&​-‏‪-‮⁦-⁩﻿]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
}

// Skin: PNG als data-URL (ganzer Skin 64x64/64x32 oder 8x8-Kopf). Nur validieren, nie speichern, nie als HTML ausgeben.
function validCharacter(c) { return c === 'alex' ? 'alex' : 'steve'; }
function skinIdOf(s) { return s ? crypto.createHash('sha1').update(s).digest('hex').slice(0, 10) : null; }
function validSkin(s) {
  const PRE = 'data:image/png;base64,';
  if (typeof s !== 'string' || s.length > MAX_SKIN_LEN || !s.startsWith(PRE)) return null;
  const b64 = s.slice(PRE.length);
  if (!b64 || !/^[A-Za-z0-9+/]+={0,2}$/.test(b64)) return null;
  let buf;
  try { buf = Buffer.from(b64, 'base64'); } catch (e) { return null; }
  if (buf.length < 33 || buf.length > MAX_SKIN_BYTES) return null;
  if (buf.readUInt32BE(0) !== 0x89504e47 || buf.readUInt32BE(4) !== 0x0d0a1a0a) return null;
  if (buf.toString('ascii', 12, 16) !== 'IHDR') return null;
  const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20);
  const okFull = w === 64 && (h === 64 || h === 32);
  const okHead = w === 8 && h === 8;
  if (!okFull && !okHead) return null;
  return s;
}

// Rate-Limit (Token Bucket) pro Socket
function makeLimiter(cap, perSec) {
  let tokens = cap, ts = Date.now();
  return () => {
    const now = Date.now();
    tokens = Math.min(cap, tokens + (now - ts) / 1000 * perSec);
    ts = now;
    if (tokens < 1) return false;
    tokens -= 1;
    return true;
  };
}

// ── Raum-Verwaltung ───────────────────────────────────────────────────────────
const rooms = {};

function buildPool(categories, difficulty, build, tf) {
  let pool = allQuestions.map((q, i) => i);
  if (categories && categories.length) {
    const set = new Set(categories);
    const filtered = allQuestions.map((q, i) => set.has(q.category) ? i : -1).filter(i => i !== -1);
    if (filtered.length >= 5) pool = filtered;
  }
  if (tf === 'only') {                         // Raumtyp "Wahr oder Mythos": nur tf-Fragen
    const t = pool.filter(i => allQuestions[i].fmt === 'tf');
    if (t.length >= 20) pool = t;
  } else if (tf === 'off') {
    const t = pool.filter(i => allQuestions[i].fmt !== 'tf');
    if (t.length >= 20) pool = t;
  }
  if (build === 'only') {                      // Raumtyp "Bauen": nur baubare Crafting-Raetsel
    const b = pool.filter(i => allQuestions[i].type === 'crafting' && allQuestions[i].buildable && allQuestions[i].solution);
    if (b.length >= 20) return b;
  }
  const tiers = DIFFICULTIES[difficulty];
  if (tiers) {
    const t = pool.filter(i => tiers.includes(allQuestions[i].tier));
    if (t.length >= 20) pool = t;           // zu kleine Auswahl: Schwierigkeit ignorieren
  }
  return pool;
}

function makeRoom({ id, displayName, isPublic, password, categories, permanent, rounds, answerTime, difficulty, maxPlayers, hostId }) {
  return {
    hostId:        hostId || null,
    answerTime:    ANSWER_CHOICES.includes(answerTime) ? answerTime : ANSWER_TIME,
    difficulty:    Object.prototype.hasOwnProperty.call(DIFFICULTIES, difficulty) ? difficulty : 'mixed',
    maxPlayers:    Number.isInteger(maxPlayers) && maxPlayers >= 2 && maxPlayers <= MAX_PLAYERS ? maxPlayers : MAX_PLAYERS,
    history:       [],          // Rundenuebersicht (Verlaufseintraege)
    teams:         null,        // { list:[{id,name,symbol,color}] } wenn Teams aktiv
    teamCarry:     {},          // Punkte ausgeschiedener Spieler je Team
    build:         'off',       // Bau-Runden: off | mix | only
    tf:            'mix',       // Wahr oder Mythos: mix | only | off
    buildSeconds:  60,
    buildRound:    false,
    builds:        null,        // Map playerId -> { attempts, done, ms, order, timeLeft }
    buildSeq:      0,
    qStart:        0,
    vote:          null,        // laufende Votekick-Abstimmung
    voteCooldown:  new Map(),   // Initiator-Token/ID -> frueheste naechste Abstimmung
    targetCooldown: new Map(),  // Zielname -> frueheste naechste Abstimmung
    kickBan:       new Map(),   // IP -> Ablauf der Sperre
    rematch:       new Set(),
    rematchTimer:  null,
    id,
    displayName:   displayName || id,
    isPublic:      !!isPublic,
    password:      password || null,
    categories:    categories && categories.length ? categories : null,
    permanent:     !!permanent,
    rounds:        ROUND_CHOICES.includes(rounds) ? rounds : DEFAULT_ROUNDS,
    players:       {},          // socketId → { id, name, score, skin, token, connected, dcTimer }
    ready:         new Set(),
    questionOrder: [],
    currentIndex:  0,
    question:      null,
    options:       null,
    phase:         'waiting',   // waiting | buzzer | answering | result | game_over
    timerLeft:     BUZZER_TIME,
    currentBuzzer: null,
    lockedOut:     new Set(),
    timerIv:       null,
    pending:       new Set(),   // alle setTimeouts des Raums
    buzzQueue:     null,
    answered:      false,
    firstBuzzer:   null,        // Socket-ID des ersten Laeutenden dieser Frage
    answers:       new Map(),   // socketId -> Antworteintrag (verdeckt bis zur Aufloesung)
    answerSeq:     0,
    resolving:     false,
    lastReveal:    null,
    deciding:      false,       // Totem-Entscheidung vor der Aufloesung
    decisionDone:  false,
    offers:        null,
    decisionTimer: null,
    lastAnswer:    null,        // { playerId, text, correct, timeout, delta } fuer Snapshot/Sprechblase
    typingId:      null,
    starting:      false,
    roundNum:      0,
    lastResult:    null,
    lastGameOver:  null,
    dead:          false,
  };
}

function later(room, fn, ms) {
  const t = setTimeout(() => {
    room.pending.delete(t);
    if (room.dead) return;
    try { fn(); } catch (e) { log('error', 'timer_error', { error: String(e && e.message).slice(0, 120) }); }
  }, ms);
  room.pending.add(t);
  return t;
}
function clearPending(room) {
  room.pending.forEach(t => clearTimeout(t));
  room.pending.clear();
  room.buzzQueue = null;
  room.starting = false;
}
function stopTimers(room) { clearInterval(room.timerIv); room.timerIv = null; clearPending(room); }

function destroyRoom(room) {
  room.dead = true;
  stopTimers(room);
  if (room.vote) clearTimeout(room.vote.timer); clearTimeout(room.rematchTimer);
  Object.values(room.players).forEach(p => clearTimeout(p.dcTimer));
  if (rooms[room.id] === room) delete rooms[room.id];
  broadcastPublicRooms();
}

// Klassenraeume ohne Aktivitaet werden geloescht (kein Weiterleben von Schueler-Namen, nichts wird gespeichert)
function sweepClasses() {
  const now = Date.now();
  Object.values(rooms).forEach((r) => {
    if (r.isClass && !r.dead && now - (r.lastActivity || r.created || 0) > CLASS_IDLE_MS) {
      io.to(r.id).emit('class_closed', { reason: 'idle' });
      destroyRoom(r); log('info', 'class_expired', {});
    }
  });
}
setInterval(sweepClasses, CLASS_SWEEP_MS).unref();
// Export ohne Personenbezug: nur feste Tiernamen, Antworten und Trefferquoten (kein Zeitstempel, keine IDs)
function classExport(room) {
  const rep2 = hostReport(room), pct = (c, n) => (n ? Math.round(c / n * 1000) / 10 : 0);
  const csvCell = (v) => { v = String(v == null ? '' : v).replace(/[\r\n;"]+/g, ' ').trim(); return /^[=+\-@]/.test(v) ? "'" + v : v; };
  const dec = (n) => String(n).replace('.', ',');
  const students = rep2.players.map((p) => ({ name: p.name, answered: p.answered, correct: p.correct, hitPct: pct(p.correct, p.answered), points: p.points }));
  const questions = rep2.questions.map((q) => ({ n: q.n, qid: q.qid, question: q.question, format: q.format, answered: q.answered, correct: q.correct, hitPct: Math.round(q.hitRate * 1000) / 10 }));
  const csv = ['Name;Antworten;Richtig;Trefferquote %;Punkte'].concat(students.map((x) => [csvCell(x.name), x.answered, x.correct, dec(x.hitPct), x.points].join(';')))
    .concat(['', 'Runde;Frage;Format;Antworten;Richtig;Trefferquote %']).concat(questions.map((x) => [x.n, csvCell(x.question), x.format, x.answered, x.correct, dec(x.hitPct)].join(';'))).join('\r\n');
  return { ok: true, rounds: rep2.rounds, avgHitPct: Math.round(rep2.totals.avgHitRate * 1000) / 10, students, questions, csv };
}

function connectedIds(room) { return Object.values(room.players).filter(p => p.connected).map(p => p.id); }
function playerCount(room)  { return Object.keys(room.players).length; }

function newRoomId() {
  const words = ['epic','cool','wild','dark','fire','iron','diamond','golden','creeper','zombie','blaze','wither','steve','alex'];
  for (let i = 0; i < 50; i++) {
    const id = words[Math.floor(Math.random()*words.length)] + words[Math.floor(Math.random()*words.length)] + Math.floor(Math.random()*100);
    if (!rooms[id]) return id;
  }
  return 'room' + crypto.randomBytes(4).toString('hex');
}

function uniqueName(room, base) {
  const taken = new Set(Object.values(room.players).map(p => p.name.toLowerCase()));
  let name = base, n = 2;
  while (taken.has(name.toLowerCase())) {
    const suffix = ' ' + n++;
    name = base.slice(0, MAX_NAME_LEN - suffix.length) + suffix;
  }
  return name;
}

function publicPlayer(p, room) {
  return { id: p.id, name: p.name, score: p.score, skinId: p.skinId || null, character: p.character, connected: p.connected, totem: !!p.hasTotem, streak: p.streak || 0, ready: room ? room.ready.has(p.id) : false, teamId: p.teamId || null };
}
// Voller Datensatz inkl. Skin: nur einmalig (joined-Roster, player_joined, player_updated)
function fullPlayer(p) {
  return { id: p.id, name: p.name, score: p.score, skin: p.skin || null, skinId: p.skinId || null, character: p.character, connected: p.connected, totem: !!p.hasTotem, streak: p.streak || 0, teamId: p.teamId || null };
}
function scoreList(room) {
  return Object.values(room.players)
    .map(p => ({ id: p.id, name: p.name, score: p.score, skinId: p.skinId || null, character: p.character, connected: p.connected }))
    .sort((a, b) => b.score - a.score);
}

function getPublicRooms() {
  return Object.values(rooms)
    .filter(r => r.isPublic)
    .map(r => ({ id: r.id, displayName: r.displayName, playerCount: playerCount(r), hasPassword: !!r.password, maxPlayers: r.maxPlayers, phase: r.phase, roundNum: r.roundNum }))
    .sort((a, b) => b.playerCount - a.playerCount);
}
let pubTimer = null;
function broadcastPublicRooms() {
  if (pubTimer) return;
  pubTimer = setTimeout(() => { pubTimer = null; io.emit('public_rooms_update', getPublicRooms()); }, 250);
}

function settingsOf(room) {
  return { rounds: room.rounds, answerTime: room.answerTime, categories: room.categories, difficulty: room.difficulty,
           maxPlayers: room.maxPlayers, isPublic: room.isPublic, hasPassword: !!room.password, teams: teamsOf(room), build: room.build, buildSeconds: room.buildSeconds, tf: room.tf, isClass: !!room.isClass };
}

// ── Teams ─────────────────────────────────────────────────────────────────────
function teamsOf(room) { return room.teams ? { enabled: true, list: room.teams.list.map(t => ({ id: t.id, name: t.name, symbol: t.symbol, color: t.color })) } : null; }
function teamScoresOf(room) {
  if (!room.teams) return null;
  const rows = room.teams.list.map(t => {
    const members = Object.values(room.players).filter(p => p.teamId === t.id);
    return { id: t.id, name: t.name, symbol: t.symbol, color: t.color, score: members.reduce((n, p) => n + p.score, 0) + (room.teamCarry[t.id] || 0), members: members.map(p => p.id) };
  }).sort((a, b) => b.score - a.score);
  rows.forEach((r, i) => { r.rank = i > 0 && rows[i - 1].score === r.score ? rows[i - 1].rank : i + 1; });
  return rows;
}
function smallestTeam(room) {
  const counts = {}; room.teams.list.forEach(t => { counts[t.id] = 0; });
  Object.values(room.players).forEach(p => { if (counts[p.teamId] !== undefined) counts[p.teamId]++; });
  return room.teams.list.slice().sort((a, b) => counts[a.id] - counts[b.id])[0].id;
}
function assignTeam(room, p) {
  if (!room.teams) { p.teamId = null; return; }
  if (!p.teamId || !room.teams.list.some(t => t.id === p.teamId)) p.teamId = smallestTeam(room);
}
function balanceTeams(room) {
  const ids = shuffle(Object.values(room.players).map(p => p.id));
  ids.forEach((id, i) => { room.players[id].teamId = room.teams.list[i % room.teams.list.length].id; });
}

// Host-Uebergabe: naechster verbundener Spieler (nach Beitrittsreihenfolge)
function passHost(room) {
  if (room.permanent || room.isClass) return;       // Klassenraum: nur die Lehrkraft ist Host
  const cur = room.players[room.hostId];
  if (cur && cur.connected) return;
  const next = Object.values(room.players).find(p => p.connected);
  room.hostId = next ? next.id : null;
  if (next) io.to(room.id).emit('host_changed', { hostId: next.id, name: next.name });
}

function broadcastLobby(room) {
  io.to(room.id).emit('room_state', {
    players: Object.values(room.players).map(p => publicPlayer(p, room)),
    phase: room.phase,
    lockedOut: [...room.lockedOut],
    currentBuzzer: room.currentBuzzer,
    firstBuzzer: room.firstBuzzer,
    maxRounds: room.rounds,
    hostId: room.hostId,
    settings: settingsOf(room),
    answered: room.buildRound && room.builds ? [...room.builds.entries()].filter(([, b]) => b.done || b.attempts >= BUILD_CHECKS).map(([id]) => id) : [...room.answers.keys()],
    teams: teamsOf(room), teamScores: teamScoresOf(room),
    readyCount: room.ready.size,
    totalCount: connectedIds(room).length,
  });
  broadcastPublicRooms();
}

// ── Antwort-Optionen (Entity-Fragen): richtige Antwort + Ablenker ────────────
// Crafting-Raetsel: 8 Optionen, Distraktoren bevorzugt aus aehnlichen Rezepten (gemeinsame Zutaten, aehnliche Feldzahl)
function buildCraftingOptions(q) {
  const ing = g => new Set(g.flat().filter(Boolean));
  const mine = ing(q.grid), slots = q.grid.flat().filter(Boolean).length;
  const scored = [];
  for (const o of allQuestions) {
    if (o === q || o.type !== 'crafting' || MGAnswer.normText(o.answer) === MGAnswer.normText(q.answer)) continue;
    const theirs = ing(o.grid);
    let inter = 0; mine.forEach(k => { if (theirs.has(k)) inter++; });
    const jac = inter / (mine.size + theirs.size - inter || 1);
    const sl = o.grid.flat().filter(Boolean).length;
    scored.push({ a: o.answer, s: jac * 2 + (sl === slots ? 0.5 : 0) + Math.random() * 0.6 });
  }
  scored.sort((x, y) => y.s - x.s);
  const pool = shuffle(scored.slice(0, 24)).slice(0, OPTION_COUNT - 1).map(x => x.a);
  return shuffle([q.answer, ...pool]);
}

function buildOptions(q) {
  if (q.type === 'crafting') return buildCraftingOptions(q);
  // Zwei-Optionen-Fragen: genau diese zwei Antworten, pro Runde zufaellig gemischt, nie Zusatzoptionen
  if (q.fmt === 'tf') return [...q.choices];                                   // Wahr links, Mythos rechts: feste Reihenfolge
  if (Array.isArray(q.choices) && q.choices.length === 2) return shuffle([...q.choices]);
  const own = new Set(q.acceptedAnswers.map(MGAnswer.normText));
  own.add(MGAnswer.normText(q.answer));
  const sameCat = [], other = [];
  for (const o of allQuestions) {
    if (o === q || o.type !== 'entity') continue;
    const n = MGAnswer.normText(o.answer);
    if (!n || own.has(n)) continue;
    (o.category === q.category ? sameCat : other).push(o.answer);
  }
  const seen = new Set(), picks = [];
  for (const a of [...shuffle(sameCat), ...shuffle(other)]) {
    const n = MGAnswer.normText(a);
    if (seen.has(n)) continue;
    seen.add(n); picks.push(a);
    if (picks.length >= OPTION_COUNT - 1) break;
  }
  return shuffle([q.answer, ...picks]);
}

function questionPayload(room) {
  const q = room.question;
  if (room.buildRound) {                      // Bau-Runde: Ergebnisname ja, Raster/Loesung nie
    return { id: q.id, type: 'crafting', mode: 'build', question: q.question, category: q.category, answer: q.answer, resultKey: q.resultKey, resultCount: q.resultCount || 1,
             buildSeconds: room.buildSeconds, checks: BUILD_CHECKS, roundNum: room.roundNum, maxRounds: room.rounds };
  }
  return {
    id: q.id, type: q.type, question: q.question, category: q.category,
    unit: q.unit || null, options: room.options || null, ...(q.fmt === 'tf' ? { fmt: 'tf' } : {}),
    ...(q.type === 'crafting' ? { grid: q.grid, shapeless: !!q.shapeless } : {}),
    choiceOnly: !!(Array.isArray(q.choices) && q.choices.length === 2),   // nur diese zwei Optionen, kein freies Tippen
    roundNum: room.roundNum,
    maxRounds: room.rounds,
  };
}

// ── Frage starten ─────────────────────────────────────────────────────────────
function nextQuestion(room) {
  stopTimers(room);
  room.lockedOut     = new Set();
  room.currentBuzzer = null;
  room.answered      = false;
  room.lastAnswer    = null;
  room.typingId      = null;
  room.firstBuzzer   = null;
  room.answers       = new Map();
  room.answerSeq     = 0;
  room.resolving     = false;
  room.lastReveal    = null;
  room.skippedRound  = false;
  room.deciding      = false;
  room.decisionDone  = false;
  room.offers        = null;

  if (!room.questionOrder.length || room.currentIndex >= room.questionOrder.length) {
    const lastIdx = room.questionOrder.length ? room.questionOrder[room.questionOrder.length - 1] : -1;
    room.questionOrder = shuffle(buildPool(room.categories, room.difficulty, room.build, room.tf));
    if (room.questionOrder.length > 1 && room.questionOrder[0] === lastIdx) {
      const t = room.questionOrder[0]; room.questionOrder[0] = room.questionOrder[1]; room.questionOrder[1] = t;
    }
    room.currentIndex  = 0;
  }
  room.question = allQuestions[room.questionOrder[room.currentIndex++]];
  room.options  = (room.question.type === 'entity' || room.question.type === 'crafting') ? buildOptions(room.question) : null;
  room.roundNum++;
  const bq = room.question;
  room.buildRound = !!(bq.type === 'crafting' && bq.buildable && bq.solution && (room.build === 'only' || (room.build === 'mix' && Math.random() < 0.5)));
  if (room.buildRound) {                      // alle bauen gleichzeitig, keine Glocke
    room.options = null; room.builds = new Map(); room.buildSeq = 0; room.qStart = Date.now();
    room.phase = 'building'; room.timerLeft = room.buildSeconds;
    io.to(room.id).emit('question', questionPayload(room));
    startBuildCountdown(room);
    broadcastLobby(room);
    return;
  }
  room.builds = null;
  room.phase     = 'buzzer';
  room.timerLeft = BUZZER_TIME;

  io.to(room.id).emit('question', questionPayload(room));
  startBuzzerCountdown(room);
  broadcastLobby(room);
}

// ── Timer ─────────────────────────────────────────────────────────────────────
function startBuzzerCountdown(room) {
  clearInterval(room.timerIv);
  room.timerLeft = BUZZER_TIME;
  room.timerIv = setInterval(() => {
    if (room.dead) return clearInterval(room.timerIv);
    room.timerLeft--;
    io.to(room.id).emit('timer', { left: room.timerLeft, max: BUZZER_TIME, phase: 'buzzer' });
    if (room.timerLeft <= 0) {
      clearInterval(room.timerIv);
      room.skippedRound = true;   // niemand hat gebuzzert: Runde uebersprungen, kein Abzug, Serie/Totem unveraendert
      revealResult(room, null);
    }
  }, 1000);
}

function startAnswerCountdown(room) {
  clearInterval(room.timerIv);
  room.timerLeft = atime(room);
  room.timerIv = setInterval(() => {
    if (room.dead) return clearInterval(room.timerIv);
    room.timerLeft--;
    io.to(room.id).emit('timer', { left: room.timerLeft, max: atime(room), phase: 'answering' });
    if (room.timerLeft <= 0) {
      clearInterval(room.timerIv);
      finishAnswerPhase(room, 'timeout');
    }
  }, 1000);
}

// ── Antwortphase: alle antworten (10 s), Aufloesung am Ende oder wenn alle abgegeben haben ───
//  Punkte je Spieler (MAX = PTS_CORRECT + Speedbonus 0..PTS_SPEED der eigenen Abgabe):
//   Laeutender  exakt: MAX + BELL_BONUS | angenaehert (im Band, keine exakte Antwort): round(MAX/2) + BELL_BONUS
//               komplett daneben / keine Antwort: -PTS_BELL_WRONG
//   Andere      exakt: MAX | angenaehert UND am naechsten (keine exakte Antwort): round(MAX/2)
//               komplett daneben / keine Antwort: -PTS_WRONG
//   Wer im Band liegt, aber nicht gewinnt: 0 (kein Abzug). Totem ueberspringt die Frage ohne Abzug.
function takePenalty(p, amount) {
  const before = p.score;
  p.score = Math.max(0, before - amount);
  return p.score - before;
}
function penaltyFor(room, id) { return id === room.firstBuzzer ? PTS_BELL_WRONG : PTS_WRONG; }

function answerDone(room) {
  const ids = connectedIds(room);
  return ids.length === 0 || ids.every(id => room.answers.has(id));
}
function checkAnswerPhaseDone(room) {
  if (room.phase === 'answering' && !room.resolving && !room.deciding && room.question && answerDone(room)) finishAnswerPhase(room, 'all');
}

// Ende der Antwortzeit: zuerst Totem-Angebot an Spieler ohne Antwort, dann Auswertung
function finishAnswerPhase(room, reason) {
  if (room.dead || room.phase !== 'answering' || room.resolving || room.deciding || !room.question) return;
  clearInterval(room.timerIv); room.timerIv = null;
  if (!room.decisionDone) {
    const pending = connectedIds(room).filter(id => !room.answers.has(id) && room.players[id] && room.players[id].hasTotem);
    if (pending.length) {
      room.deciding = true;
      room.offers = new Set(pending);
      pending.forEach(id => io.to(id).emit('totem_offer', { penalty: penaltyFor(room, id), seconds: TOTEM_DECISION_MS / 1000 }));
      room.decisionTimer = later(room, () => proceedAfterDecision(room), TOTEM_DECISION_MS);
      return;
    }
  }
  resolveAnswers(room);
}
function proceedAfterDecision(room) {
  if (room.dead || !room.deciding) return;
  clearTimeout(room.decisionTimer);
  room.deciding = false;
  room.decisionDone = true;
  room.offers = null;
  finishAnswerPhase(room, 'decided');
}
function skipWithTotem(room, p) {
  p.hasTotem = false;                                   // Serie bleibt unveraendert
  room.answers.set(p.id, { playerId: p.id, playerName: p.name, text: '', correct: false, rel: null, skipped: true,
                           order: ++room.answerSeq, timeLeft: room.timerLeft });
  io.to(room.id).emit('totem_used', { playerId: p.id, playerName: p.name, skipped: true });
  io.to(p.id).emit('totem_result', { kind: 'skip' });
}

function resolveAnswers(room) {
  room.resolving = true;
  room.answered = true;
  const q = room.question;
  const entries = [...room.answers.values()].sort((a, b) => a.order - b.order);
  const playing = entries.filter(e => !e.skipped);
  const exact = playing.filter(e => e.correct);
  const inBand = (e) => q.type === 'number' && e.rel != null && e.rel <= APPROACH_LIMIT;

  let mode = exact.length ? 'exact' : 'none';
  let closest = null;
  if (!exact.length && q.type === 'number') {
    for (const e of playing) {
      if (!inBand(e)) continue;
      if (!closest || e.rel < closest.rel - 1e-12 || (Math.abs(e.rel - closest.rel) <= 1e-12 && e.order < closest.order)) closest = e;
    }
    if (closest) mode = 'closest';
  }

  const outcome = new Map();   // playerId -> { points, penalty }
  const answers = [];
  for (const e of entries) {
    const p = room.players[e.playerId];
    let points = 0, penalty = 0;
    if (!e.skipped && p) {
      const isBell = e.playerId === room.firstBuzzer;
      const max = PTS_CORRECT + Math.round(e.timeLeft / atime(room) * PTS_SPEED);
      if (e.correct) points = max + (isBell ? BELL_BONUS : 0);
      else if (mode === 'closest' && inBand(e)) {
        if (isBell) points = Math.round(max / 2) + BELL_BONUS;
        else if (closest && e.playerId === closest.playerId) points = Math.round(max / 2);
      } else if (!inBand(e)) {
        penalty = takePenalty(p, isBell ? PTS_BELL_WRONG : PTS_WRONG);      // komplett daneben
      }
      if (points) p.score += points;
    }
    outcome.set(e.playerId, { points, penalty, skipped: !!e.skipped });
    answers.push({
      playerId: e.playerId, playerName: e.playerName, text: (e.text || '').slice(0, 40), correct: !!e.correct,
      deviationPct: e.rel == null ? null : Math.round(e.rel * 1000) / 10,
      ms: e.skipped ? null : Math.max(0, Math.round((atime(room) - e.timeLeft) * 1000)),
      points, delta: points + penalty, winner: points > 0, skipped: !!e.skipped,
      firstBuzzer: e.playerId === room.firstBuzzer,
    });
  }
  // Spieler ohne Antwort: -50 (Laeutender -100), nur verbundene bzw. der Laeutende
  for (const p of Object.values(room.players)) {
    if (room.answers.has(p.id)) continue;
    if (!p.connected && p.id !== room.firstBuzzer) continue;
    const isBell = p.id === room.firstBuzzer;
    const penalty = takePenalty(p, isBell ? PTS_BELL_WRONG : PTS_WRONG);
    outcome.set(p.id, { points: 0, penalty, skipped: false });
    answers.push({
      playerId: p.id, playerName: p.name, text: '', correct: false, deviationPct: null,
      points: 0, delta: penalty, winner: false, skipped: false, firstBuzzer: isBell, noAnswer: true, ms: null,
    });
    if (isBell) io.to(room.id).emit('answer_timeout', { playerId: p.id, playerName: p.name, delta: penalty, penalty: PTS_BELL_WRONG, score: p.score });
  }

  // Totem-Serie: Punkte -> Serie +1, sonst Serie 0 (Totem-Einsatz aendert nichts)
  for (const [id, o] of outcome) {
    const p = room.players[id];
    if (!p || o.skipped) continue;
    if (o.points > 0) {
      p.streak = Math.min(TOTEM_STREAK, (p.streak || 0) + 1);
      if (p.streak >= TOTEM_STREAK && !p.hasTotem) {
        p.hasTotem = true; p.streak = 0;
        io.to(room.id).emit('totem_earned', { playerId: p.id, playerName: p.name });
      }
    } else {
      p.streak = 0;
    }
  }

  const top = answers.filter(a => a.winner).sort((a, b) => b.points - a.points)[0] || null;
  const winnerId = top ? top.playerId : null;
  room.lastReveal = {
    mode, winnerId, winnerIds: answers.filter(a => a.winner).map(a => a.playerId),
    firstBuzzerId: room.firstBuzzer || null, answers,
    ...(q.type === 'crafting' ? { resultCount: q.resultCount || 1 } : {}),
    correctAnswer: q.type === 'number' ? `${q.answer}${q.unit ? ' ' + q.unit : ''}` : q.answer,
  };
  io.to(room.id).emit('answers_revealed', room.lastReveal);
  if (top && room.players[top.playerId]) {
    const w = room.players[top.playerId];
    io.to(room.id).emit('answer_broadcast', {
      playerId: w.id, playerName: w.name, correct: !!top.correct, submitted: top.text, score: w.score, speedBonus: 0, delta: top.points,
    });
    io.to(room.id).emit('answer_given', {
      playerId: w.id, playerName: w.name, text: top.text, correct: !!top.correct, delta: top.points, score: w.score, unit: q.unit || null,
    });
    room.lastAnswer = { playerId: w.id, text: top.text, correct: !!top.correct, timeout: false, delta: top.points };
  }
  broadcastLobby(room);
  later(room, () => revealResult(room, winnerId), REVEAL_DELAY);
}

// ── Rundenuebersicht und Host-Report ─────────────────────────────────────────
function formatOfQ(q, build) { return q.type === 'crafting' ? (build ? 'craft-build' : 'craft-guess') : (q.fmt === 'tf' ? 'tf' : Array.isArray(q.choices) && q.choices.length === 2 ? 'choice' : (q.type === 'number' ? 'number' : 'entity')); }
function pushHistory(room) {
  const q = room.question, rv = room.lastReveal;
  if (!q) return;
  const entry = {
    n: room.roundNum, qid: q.id, format: formatOfQ(q, room.buildRound), question: String(q.question).slice(0, 160),
    answer: room.lastResult ? room.lastResult.answer : '', mode: room.skippedRound ? 'skipped' : (rv ? rv.mode : 'none'), skipped: !!room.skippedRound,
    winnerId: room.lastResult ? room.lastResult.winnerId : null, firstBuzzerId: room.firstBuzzer || null,
    answers: (rv ? rv.answers : []).map(a => ({ playerId: a.playerId, name: a.playerName, text: a.text || '', correct: !!a.correct, points: a.points || 0, delta: a.delta || 0,
      ms: a.ms == null ? null : a.ms, noAnswer: !!a.noAnswer, skipped: !!a.skipped, ...(a.rank ? { rank: a.rank } : {}) })),
  };
  room.history.push(entry);
  if (room.history.length > 100) room.history.shift();
}
function hostReport(room) {
  const per = new Map(), questions = [];
  let hitSum = 0, hitN = 0, msSum = 0, msN = 0, fastest = null;
  for (const h of room.history) {
    const played = h.answers.filter(a => !a.skipped && !a.noAnswer);
    const correct = played.filter(a => a.correct);
    const msList = correct.map(a => a.ms).filter(m => m != null);
    let fq = null;
    correct.forEach(a => { if (a.ms != null && (!fq || a.ms < fq.ms)) fq = { name: a.name, ms: a.ms }; });
    const everyone = h.answers.filter(a => !a.skipped);
    questions.push({ n: h.n, qid: h.qid, question: h.question, answer: h.answer, format: h.format, answered: played.length, correct: correct.length,
      hitRate: everyone.length ? Math.round(correct.length / everyone.length * 1000) / 1000 : 0, avgMs: msList.length ? Math.round(msList.reduce((a, b) => a + b, 0) / msList.length) : null, fastest: fq });
    if (everyone.length) { hitSum += correct.length / everyone.length; hitN++; }
    if (fq && (!fastest || fq.ms < fastest.ms)) fastest = { name: fq.name, ms: fq.ms, n: h.n };
    for (const a of h.answers) {
      const p = per.get(a.name) || { name: a.name, answered: 0, correct: 0, points: 0, msSum: 0, msN: 0, fastestMs: null, noAnswers: 0 };
      if (a.noAnswer) p.noAnswers++; else if (!a.skipped) { p.answered++; if (a.correct) { p.correct++; if (a.ms != null) { p.msSum += a.ms; p.msN++; msSum += a.ms; msN++; p.fastestMs = p.fastestMs == null ? a.ms : Math.min(p.fastestMs, a.ms); } } }
      p.points += a.delta || 0;
      per.set(a.name, p);
    }
  }
  const rated = questions.filter(x => x.answered + 0 >= 0);
  const hardest = rated.length ? rated.slice().sort((a, b) => a.hitRate - b.hitRate)[0] : null;
  const easiest = rated.length ? rated.slice().sort((a, b) => b.hitRate - a.hitRate)[0] : null;
  return { rounds: room.history.length, totals: { avgHitRate: hitN ? Math.round(hitSum / hitN * 1000) / 1000 : 0, avgMs: msN ? Math.round(msSum / msN) : null },
    players: [...per.values()].map(p => ({ name: p.name, answered: p.answered, correct: p.correct, points: p.points, avgMs: p.msN ? Math.round(p.msSum / p.msN) : null, fastestMs: p.fastestMs, noAnswers: p.noAnswers })).sort((a, b) => b.points - a.points),
    questions, hardest: hardest ? { n: hardest.n, qid: hardest.qid, hitRate: hardest.hitRate } : null, easiest: easiest ? { n: easiest.n, qid: easiest.qid, hitRate: easiest.hitRate } : null, fastest };
}
function sendHostReport(room) { if (room.hostId && (room.players[room.hostId] || room.isClass)) io.to(room.hostId).emit('host_report', hostReport(room)); }

// ── Bau-Runde (alle bauen gleichzeitig) ──────────────────────────────────────
function startBuildCountdown(room) {
  clearInterval(room.timerIv);
  room.timerLeft = room.buildSeconds;
  room.timerIv = setInterval(() => {
    if (room.dead) return clearInterval(room.timerIv);
    room.timerLeft--;
    io.to(room.id).emit('timer', { left: room.timerLeft, max: room.buildSeconds, phase: 'building' });
    if (room.timerLeft <= 0) { clearInterval(room.timerIv); resolveBuild(room); }
  }, 1000);
}
function checkBuildDone(room) {
  if (!room || room.dead || room.phase !== 'building' || room.resolving || !room.builds) return;
  const ids = connectedIds(room);
  if (ids.length && ids.every(id => { const b = room.builds.get(id); return b && (b.done || b.attempts >= BUILD_CHECKS); })) resolveBuild(room);
}
function cleanBuildGrid(g) {
  if (!Array.isArray(g) || g.length !== 3) return null;
  const out = [];
  for (const row of g) {
    if (!Array.isArray(row) || row.length !== 3) return null;
    const cells = [];
    for (const k of row) {
      if (k == null || k === '') cells.push(null);
      else if (typeof k === 'string' && /^[a-z0-9_]{1,60}$/.test(k)) cells.push(k);
      else return null;
    }
    out.push(cells);
  }
  return out;
}
function resolveBuild(room) {
  if (room.dead || room.phase !== 'building' || room.resolving || !room.question) return;
  room.resolving = true; room.answered = true;
  clearInterval(room.timerIv); room.timerIv = null;
  const q = room.question, bt = room.buildSeconds;
  const solved = [...room.builds.entries()].filter(([id, b]) => b.done && room.players[id]).sort((a, b) => a[1].order - b[1].order);
  const answers = [], points = new Map();
  solved.forEach(([id, b], i) => {
    const p = room.players[id];
    const base = PTS_CORRECT + Math.round(Math.max(0, b.timeLeft) / bt * PTS_SPEED);
    const pts = Math.round(base * BUILD_FACTORS[Math.min(i, BUILD_FACTORS.length - 1)]);
    p.score += pts; points.set(id, pts);
    answers.push({ playerId: id, playerName: p.name, text: '', correct: true, deviationPct: null, ms: b.ms, points: pts, delta: pts, winner: true, skipped: false, firstBuzzer: false, rank: i + 1 });
  });
  for (const p of Object.values(room.players)) {
    if (points.has(p.id) || !p.connected) continue;
    answers.push({ playerId: p.id, playerName: p.name, text: '', correct: false, deviationPct: null, ms: null, points: 0, delta: 0, winner: false, skipped: false, firstBuzzer: false, noAnswer: true });
  }
  for (const p of Object.values(room.players)) {
    if (!p.connected) continue;
    if ((points.get(p.id) || 0) > 0) {
      p.streak = Math.min(TOTEM_STREAK, (p.streak || 0) + 1);
      if (p.streak >= TOTEM_STREAK && !p.hasTotem) { p.hasTotem = true; p.streak = 0; io.to(room.id).emit('totem_earned', { playerId: p.id, playerName: p.name }); }
    } else p.streak = 0;
  }
  const winnerId = solved.length ? solved[0][0] : null;
  room.lastReveal = { mode: 'build', winnerId, winnerIds: solved.map(([id]) => id), firstBuzzerId: null, answers, resultCount: q.resultCount || 1, correctAnswer: q.answer, solutionGrid: q.grid };
  io.to(room.id).emit('answers_revealed', room.lastReveal);
  broadcastLobby(room);
  later(room, () => revealResult(room, winnerId), REVEAL_DELAY);
}

// ── Aufloesung ────────────────────────────────────────────────────────────────
function revealResult(room, winnerId) {
  if (room.dead || room.phase === 'result' || room.phase === 'game_over' || !room.question) return;
  stopTimers(room);
  room.phase = 'result';

  const q      = room.question;
  const answer = q.type === 'number' ? `${q.answer}${q.unit ? ' ' + q.unit : ''}` : q.answer;
  room.lastResult = { answer, ...(q.type === 'crafting' ? { resultCount: q.resultCount || 1, grid: q.grid, shapeless: !!q.shapeless } : {}), funFact: q.funFact, winnerId, scores: scoreList(room), nextIn: RESULT_TIME,
    mode: room.skippedRound ? 'skipped' : (room.lastReveal ? room.lastReveal.mode : 'none'), skipped: !!room.skippedRound,
    answers: room.lastReveal ? room.lastReveal.answers : [] };
  room.lastResult.teamScores = teamScoresOf(room);
  pushHistory(room);
  io.to(room.id).emit('result', room.lastResult);
  broadcastLobby(room);

  if (room.roundNum >= room.rounds) {
    later(room, () => {
      room.phase = 'game_over';
      const ts = teamScoresOf(room);
      room.lastGameOver = { scores: scoreList(room), rounds: room.roundNum, history: room.history, ...(ts ? { teamScores: ts, winnerTeamId: ts[0] ? ts[0].id : null } : {}) };
      io.to(room.id).emit('game_over', room.lastGameOver);
      sendHostReport(room);
      broadcastLobby(room);
    }, RESULT_TIME * 1000);
  } else {
    later(room, () => { if (connectedIds(room).length > 0) nextQuestion(room); else resetRoom(room); }, RESULT_TIME * 1000);
  }
}

// Raum zurueck in die Lobby (z. B. wenn alle weg sind)
function resetRoom(room) {
  stopTimers(room);
  room.history = []; room.teamCarry = {}; room.buildRound = false; room.builds = null;
  room.phase = 'waiting'; room.roundNum = 0; room.question = null; room.options = null;
  room.lockedOut = new Set(); room.currentBuzzer = null; room.answered = false;
  room.ready.clear(); room.lastResult = null; room.lastGameOver = null;
  room.rematch = new Set(); clearTimeout(room.rematchTimer); room.rematchTimer = null;
  Object.values(room.players).forEach(p => { p.score = 0; });
  broadcastLobby(room);
}

// Wenn kein Spieler mehr buzzern kann (alle gesperrt/weg) → aufloesen
function checkBuzzerDeadlock(room) {
  if (room.phase !== 'buzzer') return;
  const ids = connectedIds(room);
  if (ids.length > 0 && ids.every(id => room.lockedOut.has(id))) revealResult(room, null);
}

function maybeAutoStart(room) {
  if (room.phase !== 'waiting' || room.starting || room.isClass) return;      // Klassenraum: nur die Lehrkraft startet (class_start)
  const ids = connectedIds(room);
  if (ids.length > 0 && ids.every(id => room.ready.has(id))) {
    room.ready.clear();
    room.starting = true;
    broadcastLobby(room);
    later(room, () => {
      room.starting = false;
      if (room.phase === 'waiting' && connectedIds(room).length > 0) nextQuestion(room);
    }, 1500);
  }
}

// ── Buzzer: latenzbereinigte Entscheidung ────────────────────────────────────
function resolveBuzz(room) {
  const queue = room.buzzQueue || [];
  room.buzzQueue = null;
  if (room.phase !== 'buzzer') return;
  const valid = queue.filter(b => room.players[b.id] && room.players[b.id].connected && !room.lockedOut.has(b.id));
  if (!valid.length) return;
  valid.sort((a, b) => a.t - b.t);
  const winner = room.players[valid[0].id];

  clearInterval(room.timerIv);
  room.phase         = 'answering';
  room.currentBuzzer = winner.id;
  room.firstBuzzer   = winner.id;
  room.answers       = new Map();
  room.answerSeq     = 0;
  room.resolving     = false;
  room.answered      = false;
  room.timerLeft     = atime(room);

  room.typingId = null;
  io.to(room.id).emit('buzzer_won', { playerId: winner.id, playerName: winner.name });
  io.to(room.id).emit('buzzed', { playerId: winner.id, playerName: winner.name });
  io.to(room.id).emit('answer_phase', { firstBuzzerId: winner.id, endsIn: atime(room), answered: [] });
  broadcastLobby(room);
  startAnswerCountdown(room);
}

// ── Snapshot fuer Spaetbeitritt / Reconnect ──────────────────────────────────
function sceneState(room) {
  return {
    phase: room.phase,
    buzzedId: room.phase === 'answering' ? room.currentBuzzer : null,
    typingId: room.typingId || null,
    lockedOut: [...room.lockedOut],
    firstBuzzerId: room.firstBuzzer || null,
    answered: [...room.answers.keys()],
    speech: room.lastAnswer || null,
    timerLeft: room.timerLeft,
    roundNum: room.roundNum,
  };
}

function sendSnapshot(socket, room) {
  broadcastLobby(room);
  if (room.phase === 'building') {
    socket.emit('question', questionPayload(room));
    socket.emit('timer', { left: room.timerLeft, max: room.buildSeconds, phase: 'building' });
    const mine = room.builds && room.builds.get(socket.id);
    socket.emit('build_state', { done: [...(room.builds || new Map()).entries()].filter(([, b]) => b.done).map(([id]) => id), attemptsLeft: BUILD_CHECKS - (mine ? mine.attempts : 0), finished: !!(mine && (mine.done || mine.attempts >= BUILD_CHECKS)) });
  } else if (room.phase === 'buzzer' || room.phase === 'answering') {
    socket.emit('question', questionPayload(room));
    socket.emit('timer', { left: room.timerLeft, max: room.phase === 'buzzer' ? BUZZER_TIME : atime(room), phase: room.phase === 'buzzer' ? 'buzzer' : 'answering' });
    if (room.phase === 'answering' && room.currentBuzzer && room.players[room.currentBuzzer]) {
      socket.emit('buzzer_won', { playerId: room.currentBuzzer, playerName: room.players[room.currentBuzzer].name });
    }
    if (room.phase === 'answering') socket.emit('answer_phase', { firstBuzzerId: room.firstBuzzer, endsIn: room.timerLeft, answered: [...room.answers.keys()] });
  } else if (room.phase === 'result' && room.lastResult) {
    socket.emit('result', { ...room.lastResult, scores: scoreList(room), teamScores: teamScoresOf(room) });
  } else if (room.phase === 'game_over' && room.lastGameOver) {
    socket.emit('game_over', { ...room.lastGameOver, scores: scoreList(room), ...(room.teams ? { teamScores: teamScoresOf(room) } : {}) });
  }
  socket.emit('scene', sceneState(room));
}

// ── Host-Einstellungen, Votekick, Revanche ───────────────────────────────────
const KICK_BAN_MS = 5 * 60 * 1000;
const VOTE_WINDOW_MS = 15000;
const VOTE_MIN_PLAYERS = 3;
const VOTE_COOLDOWN_MS = 60000;      // je Initiator
const TARGET_COOLDOWN_MS = 120000;   // je Ziel nach gescheiterter Abstimmung
function ipOf(socket) { return clientIp(socket.handshake.headers, socket.handshake.address); }
function kickPlayer(room, targetId, reason) {
  const t = io.sockets.sockets.get(targetId);
  const p = room.players[targetId];
  if (!p) return false;
  if (t) {
    if (!room.isClass) room.kickBan.set(ipOf(t), Date.now() + KICK_BAN_MS);
    t.emit('kicked', { reason: reason || 'host' });
    if (typeof t.data.leaveRoom === 'function') t.data.leaveRoom();
  } else {
    clearTimeout(p.dcTimer); delete room.players[targetId];
    io.to(room.id).emit('player_left', { id: targetId });
    broadcastLobby(room);
  }
  return true;
}
function voteStatus(v) { return { voteId: v.id, targetId: v.targetId, targetName: v.targetName, initiatorId: v.initiatorId, yes: v.yes.size, no: v.no.size, needed: v.needed, endsIn: Math.max(0, Math.ceil((v.endsAt - Date.now()) / 1000)) }; }
function voters(room, v) { return connectedIds(room).filter(id => id !== v.targetId); }
function endVote(room, kicked, why) {
  const v = room.vote; if (!v) return;
  clearTimeout(v.timer); room.vote = null;
  io.to(room.id).emit('votekick_end', { voteId: v.id, targetId: v.targetId, targetName: v.targetName, kicked: !!kicked, reason: why });
  if (kicked) kickPlayer(room, v.targetId, 'vote');
  else room.targetCooldown.set(String(v.targetName).toLowerCase(), Date.now() + TARGET_COOLDOWN_MS);
}
function voteEval(room) {
  const v = room.vote; if (!v) return;
  const n = voters(room, v).length;
  v.needed = Math.floor(n / 2) + 1;
  if (v.yes.size >= v.needed) return endVote(room, true, 'mehrheit');
  if (v.no.size > n - v.needed || n < 2) return endVote(room, false, 'abgelehnt');
  io.to(room.id).emit('votekick_update', voteStatus(v));
}
function voteCheckTarget(room, leftId) {
  const v = room.vote; if (!v) return;
  if (v.targetId === leftId) { clearTimeout(v.timer); room.vote = null; io.to(room.id).emit('votekick_end', { voteId: v.id, targetId: v.targetId, targetName: v.targetName, kicked: false, reason: 'verlassen' }); }
  else { v.yes.delete(leftId); v.no.delete(leftId); voteEval(room); }
}
function startRematch(room) {
  clearTimeout(room.rematchTimer); room.rematchTimer = null;
  const ready = [...room.rematch].filter(id => room.players[id] && room.players[id].connected);
  room.rematch = new Set();
  resetRoom(room);
  ready.forEach(id => room.ready.add(id));
  io.to(room.id).emit('rematch_start', { confirmed: ready });
  broadcastLobby(room);
  maybeAutoStart(room);
}
function rematchCheck(room) {
  if (room.phase !== 'game_over') return;
  const ids = connectedIds(room);
  const conf = [...room.rematch].filter(id => ids.includes(id));
  io.to(room.id).emit('rematch_state', { confirmed: conf, total: ids.length, needed: Math.min(2, ids.length) });
  if (ids.length && conf.length === ids.length) return startRematch(room);
  if (conf.length >= Math.min(2, ids.length) && !room.rematchTimer) {
    room.rematchTimer = setTimeout(() => { room.rematchTimer = null; if (!room.dead && room.phase === 'game_over') startRematch(room); }, 5000);
  }
}

// ── Raum-Einladungen von Freunden (Sockets) ─────────────────────────────────────
const INVITE_TTL = Number(process.env.INVITE_TTL_MS) > 0 ? Number(process.env.INVITE_TTL_MS) : 5 * 60 * 1000;   // ENV nur fuer Tests
const onlinePids = new Map();     // pid -> Set(socketId)  (nur im Speicher, nur fuer angemeldete Profile)
const invites = new Map();        // inviteId -> { id, from, to, roomId, createdAt, accepted }
const inviteRate = new Map();     // pid -> Zeitstempel der letzten Einladungen
function socketsOf(pid) { return [...(onlinePids.get(pid) || [])]; }
function inviteAllowed(pid) {
  const now = Date.now(), a = (inviteRate.get(pid) || []).filter(t => now - t < 600000);
  if (a.length >= 10) return false;
  a.push(now); inviteRate.set(pid, a); return true;
}
function dropInvite(inv, notifyTarget) {
  invites.delete(inv.id);
  if (notifyTarget) socketsOf(inv.to).forEach(sid => io.to(sid).emit('invite_expired', { inviteId: inv.id }));
}
setInterval(() => {
  const now = Date.now();
  for (const inv of [...invites.values()]) {
    const room = rooms[inv.roomId];
    if (now - inv.createdAt > INVITE_TTL || !room || room.dead) dropInvite(inv, true);
  }
}, 15000).unref();

// ── Socket.io ─────────────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  let currentRoom = null;           // Raum-ID
  const limiter  = makeLimiter(20, 8);
  let lastCreate = 0;
  let joinFails  = 0, joinBlockUntil = 0;
  socket.data.rtt = 0;
  socket.data.leaveRoom = () => leaveCurrent(true);

  // Latenz messen (Client antwortet per Ack auf 'sync_ping')
  const measure = () => {
    const t0 = Date.now();
    socket.timeout(3000).emit('sync_ping', (err) => {
      if (err) return;
      const rtt = Date.now() - t0;
      socket.data.rtt = socket.data.rtt ? socket.data.rtt * 0.6 + rtt * 0.4 : rtt;
    });
  };
  const pingIv = setInterval(measure, 8000);
  setTimeout(measure, 500);

  const on = (ev, fn) => socket.on(ev, (...args) => {
    if (!limiter()) return;
    if (currentRoom && rooms[currentRoom]) rooms[currentRoom].lastActivity = Date.now();
    try { fn(...args); } catch (e) { log('error', 'socket_handler_error', { ev, error: String(e && e.message).slice(0, 120) }); }
  });

  function getRoom() {
    if (!currentRoom) return null;
    const r = rooms[currentRoom];
    return r && !r.dead ? r : null;
  }

  function joinRoomAs(room, name, skin, rejoinPlayer, character) {
    let p = rejoinPlayer;
    if (!p) {
      p = { id: socket.id, name: uniqueName(room, name), score: 0, skin: skin || null, skinId: skinIdOf(skin),
            character: validCharacter(character), hasTotem: false, streak: 0,
            token: crypto.randomBytes(16).toString('hex'), connected: true, dcTimer: null };
      room.players[socket.id] = p;
    }
    assignTeam(room, p);
    currentRoom = room.id;
    socket.join(room.id);
    socket.emit('joined', {
      playerId: p.id, roomId: room.id, displayName: room.displayName, playerName: p.name,
      isPublic: room.isPublic, categories: room.categories, rounds: room.rounds, skin: p.skin || null,
      hostId: room.hostId, settings: settingsOf(room),
      token: p.token, rejoined: !!rejoinPlayer,
      character: p.character,
      teams: teamsOf(room),
      players: Object.values(room.players).map(fullPlayer),
    });
    if (!rejoinPlayer) socket.to(room.id).emit('player_joined', { player: fullPlayer(p) });
    sendSnapshot(socket, room);
    maybeAutoStart(room);
  }

  function leaveCurrent(immediate) {
    const room = getRoom();
    const id = socket.id;
    currentRoom = null;
    if (!room) return;
    socket.leave(room.id);
    const p = room.players[id];
    if (!p) return;

    room.ready.delete(id);

    const finalize = () => {
      clearTimeout(p.dcTimer);
      if (room.teams && p.teamId) room.teamCarry[p.teamId] = (room.teamCarry[p.teamId] || 0) + p.score;
      delete room.players[p.id];
      if (room.builds) room.builds.delete(p.id);
      io.to(room.id).emit('player_left', { id: p.id });
      room.lockedOut.delete(p.id);
      room.ready.delete(p.id);
      if (room.currentBuzzer === p.id) room.currentBuzzer = null;
      if (room.dead) return;
      room.rematch.delete(p.id);
      if (room.hostId === p.id) { room.hostId = null; passHost(room); }
      voteCheckTarget(room, p.id);
      if (playerCount(room) === 0) {
        if (room.permanent || room.isClass) resetRoom(room); else destroyRoom(room);
        return;
      }
      if (connectedIds(room).length === 0) resetRoom(room);
      else { broadcastLobby(room); checkBuzzerDeadlock(room); maybeAutoStart(room); checkAnswerPhaseDone(room); checkBuildDone(room); }
    };

    if (immediate) { finalize(); return; }

    p.connected = false;
    p.dcTimer = setTimeout(finalize, GRACE_MS);
    passHost(room);
    if (connectedIds(room).length === 0 && room.phase !== 'waiting') stopTimers(room);   // niemand da → pausieren
    broadcastLobby(room);
    checkBuzzerDeadlock(room);
    maybeAutoStart(room);
    checkAnswerPhaseDone(room);
    checkBuildDone(room);
  }

  // Raum erstellen ─────────────────────────────────────────────────────────────
  on('create_room', (d) => {
    d = d || {};
    const now = Date.now();
    if (now - lastCreate < 2000) return socket.emit('join_error', { message: 'Bitte kurz warten.' });
    if (Object.keys(rooms).length >= MAX_ROOMS) return socket.emit('join_error', { message: 'Server ausgelastet, bitte spaeter erneut versuchen.' });
    lastCreate = now;
    if (currentRoom) leaveCurrent(true);

    const rid  = newRoomId();
    const cats = Array.isArray(d.categories)
      ? d.categories.filter(c => typeof c === 'string' && KNOWN_CATEGORIES.has(c)).slice(0, 30)
      : [];
    const pw   = typeof d.password === 'string' ? d.password.slice(0, 40) : '';
    const rounds = ROUND_CHOICES.includes(d.rounds) ? d.rounds : DEFAULT_ROUNDS;   // nur die Zahlen 10/25/50/100, Strings gelten nicht
    const room = makeRoom({
      rounds,
      id: rid,
      displayName: cleanText(d.displayName, 30) || rid,
      isPublic: !!d.isPublic,
      password: pw || null,
      categories: cats,
      answerTime: d.answerTime, difficulty: d.difficulty, maxPlayers: d.maxPlayers,
      hostId: socket.id,
    });
    room.questionOrder = shuffle(buildPool(room.categories, room.difficulty, room.build, room.tf));
    rooms[rid] = room;
    joinRoomAs(room, cleanText(d.playerName, MAX_NAME_LEN) || 'Host', validSkin(d.skin), null, d.character);
    log('info', 'room_created', { rooms: Object.keys(rooms).length });
  });

  // Raum beitreten ─────────────────────────────────────────────────────────────
  on('join_room', (d) => {
    d = d || {};
    if (Date.now() < joinBlockUntil) return socket.emit('join_error', { message: 'Zu viele Versuche – kurz warten.' });
    const rid  = typeof d.roomId === 'string' ? d.roomId.toLowerCase().trim().slice(0, 40) : '';
    const room = rooms[rid];
    const fail = (message) => {
      if (++joinFails >= 6) { joinBlockUntil = Date.now() + 30000; joinFails = 0; }
      socket.emit('join_error', { message });
    };
    if (!room || room.dead || room.isClass) return fail(`Raum "${cleanText(rid, 40)}" nicht gefunden.`);      // Klassenraeume nur ueber join_class
    if (currentRoom === rid && room.players[socket.id]) return;     // schon drin
    if (playerCount(room) >= room.maxPlayers) return fail('Raum voll.');
    const ban = room.kickBan.get(ipOf(socket));
    if (ban && ban > Date.now()) return fail('Du wurdest aus diesem Raum entfernt.');
    const inv = typeof d.inviteId === 'string' ? invites.get(d.inviteId) : null;
    const invited = !!(inv && inv.to === socket.data.pid && inv.roomId === room.id && inv.accepted && Date.now() - inv.createdAt <= INVITE_TTL);
    if (room.password && room.password !== d.password && !invited) return fail('Falsches Passwort.');
    joinFails = 0;
    if (invited) invites.delete(inv.id);
    if (currentRoom) leaveCurrent(true);
    const name = cleanText(d.playerName, MAX_NAME_LEN) || `Spieler ${playerCount(room) + 1}`;
    joinRoomAs(room, name, validSkin(d.skin), null, d.character);
    log('info', 'player_joined', { players: playerCount(room) });
  });

  // Klassenraum ─────────────────────────────────────────────────────────────────
  const classIpOk = (cost) => apiAllowed('class-join', ipOf(socket), 120, 500) && (cost ? apiAllowed('class-fail', ipOf(socket), 12, 30000) : true);
  const classOf = (code) => { const c = typeof code === 'string' ? code.toUpperCase().replace(/[^A-Z0-9]/g, '') : ''; const r = c.length === 6 ? rooms[c.toLowerCase()] : null; if (r && r.isClass && !r.dead) { r.lastActivity = Date.now(); return r; } return null; };
  const classTeacher = () => { const room = getRoom(); return room && room.isClass && room.hostId === socket.id ? room : null; };
  on('create_class', (d) => {
    d = d || {};
    const now = Date.now();
    if (now - lastCreate < 2000 || !apiAllowed('class-create', ipOf(socket), 6, 600000)) return socket.emit('class_denied', { reason: 'rate' });
    if (Object.values(rooms).filter((r) => r.isClass).length >= MAX_CLASSES || Object.keys(rooms).length >= MAX_ROOMS + MAX_CLASSES) return socket.emit('class_denied', { reason: 'busy' });
    lastCreate = now;
    if (currentRoom) leaveCurrent(true);
    const code = newClassCode(); if (!code) return socket.emit('class_denied', { reason: 'busy' });
    const cats = Array.isArray(d.categories) ? d.categories.filter((c) => typeof c === 'string' && KNOWN_CATEGORIES.has(c)).slice(0, 30) : [];
    const room = makeRoom({ rounds: ROUND_CHOICES.includes(d.rounds) ? d.rounds : DEFAULT_ROUNDS, id: code.toLowerCase(), displayName: 'Klasse ' + code, isPublic: false, password: null, categories: cats,
      answerTime: d.answerTime, difficulty: d.difficulty, maxPlayers: MAX_PLAYERS, hostId: socket.id });
    room.isClass = true; room.maxPlayers = CLASS_MAX; room.teacherToken = crypto.randomBytes(16).toString('hex'); room.lastActivity = now;
    if (TF_CHOICES.includes(d.tf)) room.tf = d.tf;
    if (BUILD_CHOICES.includes(d.build)) room.build = d.build;
    room.questionOrder = shuffle(buildPool(room.categories, room.difficulty, room.build, room.tf));
    rooms[room.id] = room;
    currentRoom = room.id; socket.join(room.id);
    socket.emit('class_created', { code, token: room.teacherToken, settings: settingsOf(room), max: CLASS_MAX, idleMinutes: Math.round(CLASS_IDLE_MS / 60000), names: CLASS_NAMES });
    log('info', 'class_created', { classes: Object.values(rooms).filter((r) => r.isClass).length });
  });
  // Schueler: freie Namen anzeigen (ohne Anmeldung, nur mit Code)
  on('class_info', (d) => {
    const room = classOf(d && d.code);
    if (!room) { if (!classIpOk(true)) joinBlockUntil = Date.now() + 60000; return socket.emit('class_info', { ok: false }); }
    if (!classIpOk(false)) return socket.emit('class_info', { ok: false });
    const taken = new Set(Object.values(room.players).map((p) => p.name));
    socket.emit('class_info', { ok: true, free: CLASS_NAMES.filter((n) => !taken.has(n)), count: playerCount(room), max: CLASS_MAX, phase: room.phase });
  });
  on('join_class', (d) => {
    d = d || {};
    const deny = (reason, code) => { socket.emit('join_error', { message: reason, code: code || 'class' }); };
    if (Date.now() < joinBlockUntil) return deny('Zu viele Versuche – kurz warten.', 'rate');
    const room = classOf(d.code);
    if (!room) { if (!classIpOk(true)) joinBlockUntil = Date.now() + 60000; return deny('Klassenraum nicht gefunden.', 'notfound'); }
    if (!classIpOk(false)) return deny('Zu viele Versuche – kurz warten.', 'rate');
    if (currentRoom === room.id && room.players[socket.id]) return;
    if (playerCount(room) >= CLASS_MAX) return deny('Klassenraum voll.', 'full');
    if (room.phase !== 'waiting') return deny('Das Spiel läuft schon.', 'running');
    const taken = new Set(Object.values(room.players).map((p) => p.name));
    const free = CLASS_NAMES.filter((n) => !taken.has(n));
    if (!free.length) return deny('Klassenraum voll.', 'full');
    let name;
    if (d.name !== undefined && d.name !== null && d.name !== '') {
      if (typeof d.name !== 'string' || !CLASS_NAMES.includes(d.name)) return deny('Bitte einen Namen aus der Liste wählen.', 'name');
      if (taken.has(d.name)) return deny('Dieser Name ist schon vergeben.', 'name_taken');
      name = d.name;
    } else name = free[crypto.randomInt(free.length)];
    if (currentRoom) leaveCurrent(true);
    joinRoomAs(room, name, null, null, 'steve');
    log('info', 'class_joined', { students: playerCount(room) });
  });
  on('class_start', () => {
    const room = classTeacher(); if (!room) return;
    if (room.phase !== 'waiting' || room.starting) return socket.emit('class_denied', { reason: 'phase' });
    if (connectedIds(room).length < 1) return socket.emit('class_denied', { reason: 'students' });
    room.ready.clear(); room.starting = true; broadcastLobby(room);
    later(room, () => { room.starting = false; if (room.phase === 'waiting' && connectedIds(room).length > 0) nextQuestion(room); }, 1500);
  });
  on('class_rejoin', (d) => {
    d = d || {};
    const room = classOf(d.code);
    if (!room || typeof d.token !== 'string' || d.token.length !== 32 || room.teacherToken !== d.token) { if (!classIpOk(true)) joinBlockUntil = Date.now() + 60000; return socket.emit('class_denied', { reason: 'notfound' }); }
    if (currentRoom && currentRoom !== room.id) leaveCurrent(true);
    room.hostId = socket.id; room.lastActivity = Date.now(); currentRoom = room.id; socket.join(room.id);
    socket.emit('class_created', { code: room.id.toUpperCase(), token: room.teacherToken, settings: settingsOf(room), max: CLASS_MAX, idleMinutes: Math.round(CLASS_IDLE_MS / 60000), names: CLASS_NAMES, rejoined: true });
    broadcastLobby(room); sendSnapshot(socket, room);
  });
  on('class_export', () => { const room = classTeacher(); if (room) socket.emit('class_export', classExport(room)); });
  on('class_close', () => {
    const room = classTeacher(); if (!room) return;
    io.to(room.id).emit('class_closed', { reason: 'teacher' }); destroyRoom(room); currentRoom = null;
  });

  // Reconnect (Token aus 'joined') ─────────────────────────────────────────────
  on('rejoin_room', (d) => {
    d = d || {};
    const rid   = typeof d.roomId === 'string' ? d.roomId.toLowerCase().trim() : '';
    const room  = rooms[rid];
    const token = typeof d.token === 'string' ? d.token : '';
    if (!room || room.dead || !token) return socket.emit('rejoin_failed', { message: 'Raum nicht mehr vorhanden.' });
    const old = Object.values(room.players).find(p => !p.connected && p.token === token);
    if (!old) return socket.emit('rejoin_failed', { message: 'Sitzung abgelaufen.' });
    if (currentRoom) leaveCurrent(true);
    clearTimeout(old.dcTimer); old.dcTimer = null;
    delete room.players[old.id];
    const oldId = old.id;
    old.id = socket.id; old.connected = true;
    room.players[socket.id] = old;
    if (room.lockedOut.has(oldId)) { room.lockedOut.delete(oldId); room.lockedOut.add(socket.id); }
    io.to(room.id).emit('player_id_changed', { oldId, newId: socket.id });
    if (room.currentBuzzer === oldId) room.currentBuzzer = socket.id;
    if (room.hostId === oldId) room.hostId = socket.id;
    if (room.rematch.delete(oldId)) room.rematch.add(socket.id);
    joinRoomAs(room, old.name, null, old);
  });

  // Profil (Skin/Charakter) nachtraeglich setzen -> einmalig an alle als player_updated
  on('set_profile', (d) => {
    d = d || {};
    const room = getRoom();
    if (!room) return;
    const p = room.players[socket.id];
    if (!p) return;
    if (room.isClass) return;
    if (typeof d.character === 'string') p.character = validCharacter(d.character);
    if (Object.prototype.hasOwnProperty.call(d, 'skin')) { p.skin = validSkin(d.skin); p.skinId = skinIdOf(p.skin); }
    io.to(room.id).emit('player_updated', { player: fullPlayer(p) });
  });

  // Tipp-Signal (ohne Inhalt) fuer die Nachdenk-Animation
  let lastTyping = 0;
  on('typing', () => {
    const room = getRoom();
    if (!room || room.phase !== 'answering' || room.resolving || room.answers.has(socket.id)) return;
    const now = Date.now();
    if (now - lastTyping < 700) return;
    lastTyping = now;
    room.typingId = socket.id;
    socket.to(room.id).emit('typing', { playerId: socket.id });
  });

  on('leave_room', () => leaveCurrent(true));

  // Oeffentliche Raeume ────────────────────────────────────────────────────────
  on('get_public_rooms', () => socket.emit('public_rooms_update', getPublicRooms()));

  // READY ──────────────────────────────────────────────────────────────────────
  on('player_ready', () => {
    const room = getRoom();
    if (!room || room.phase !== 'waiting' || room.starting) return;
    if (!room.players[socket.id]) return;
    if (room.ready.has(socket.id)) room.ready.delete(socket.id); else room.ready.add(socket.id);
    broadcastLobby(room);
    maybeAutoStart(room);
  });

  // BUZZER ─────────────────────────────────────────────────────────────────────
  on('buzz', () => {
    const room = getRoom();
    if (!room || room.phase !== 'buzzer') return;
    const player = room.players[socket.id];
    if (!player || !player.connected || room.lockedOut.has(socket.id)) return;
    const rtt = Math.min(Math.max(socket.data.rtt || 0, 0), 600);
    const entry = { id: socket.id, t: Date.now() - rtt / 2 };
    if (!room.buzzQueue) {
      room.buzzQueue = [entry];
      later(room, () => resolveBuzz(room), BUZZ_WINDOW);
    } else if (!room.buzzQueue.some(b => b.id === socket.id)) {
      room.buzzQueue.push(entry);
    }
  });

  // ANTWORT (alle in der Antwortphase, einmal je Frage) ───────────────────────
  on('submit_answer', (d) => {
    const room = getRoom();
    if (!room || room.phase !== 'answering' || room.resolving || !room.question) return;
    const player = room.players[socket.id];
    if (!player || !player.connected || room.answers.has(socket.id)) return;
    const raw = d && (typeof d.answer === 'string' || typeof d.answer === 'number') ? String(d.answer).slice(0, MAX_ANSWER_LEN) : '';
    const q = room.question;
    if (Array.isArray(q.choices) && q.choices.length === 2 && !q.choices.some(c => MGAnswer.normText(c) === MGAnswer.normText(raw))) {
      socket.emit('answer_invalid', { message: 'Bitte eine der beiden Optionen wählen.' });   // nur die zwei Optionen gelten
      return;
    }
    const result = MGAnswer.check(q, raw);
    if (!result.valid) {                         // leer / keine Zahl → keine Strafe, Timer unveraendert
      socket.emit('answer_invalid', { message: q.type === 'number' ? 'Bitte eine Zahl eingeben.' : 'Bitte eine Antwort eingeben.' });
      return;
    }
    let rel = null;
    if (q.type === 'number') rel = Math.max(0, result.diff - MGAnswer.tolerance(q)) / Math.max(Math.abs(q.answer), 5);
    const entry = {
      playerId: socket.id, playerName: player.name, text: cleanText(raw, 60),
      correct: !!result.correct, rel, order: ++room.answerSeq, timeLeft: room.timerLeft,
    };
    room.answers.set(socket.id, entry);
    room.typingId = null;
    // Antworten bleiben verdeckt; Punkte/Abzug erst bei der Aufloesung (alle abgegeben oder Zeit um)
    io.to(room.id).emit('answer_submitted', { playerId: socket.id, playerName: player.name });
    broadcastLobby(room);
    checkAnswerPhaseDone(room);
  });

  // TOTEM: 3er-Gewinnserie ergibt eines (max. 1 gehalten). Einsatz = Frage ueberspringen, kein Abzug ─────
  on('use_totem', () => {
    const room = getRoom();
    if (!room || !room.question) return socket.emit('totem_denied', { reason: 'phase' });
    const p = room.players[socket.id];
    if (!p || !p.connected) return;
    if (!p.hasTotem) return socket.emit('totem_denied', { reason: 'none' });
    if (room.phase !== 'answering' || room.resolving) return socket.emit('totem_denied', { reason: 'phase' });
    if (room.deciding) {                                    // Angebot statt Abzug einloesen
      if (!room.offers || !room.offers.has(p.id)) return socket.emit('totem_denied', { reason: 'answered' });
      room.offers.delete(p.id);
      skipWithTotem(room, p);
      broadcastLobby(room);
      if (!room.offers.size) proceedAfterDecision(room);
      return;
    }
    if (room.answers.has(p.id)) return socket.emit('totem_denied', { reason: 'answered' });
    skipWithTotem(room, p);                                 // vorab ueberspringen, keine Eingabe noetig
    io.to(room.id).emit('answer_submitted', { playerId: p.id, playerName: p.name, skipped: true });
    broadcastLobby(room);
    checkAnswerPhaseDone(room);
  });
  on('totem_decline', () => {
    const room = getRoom();
    if (!room || !room.deciding || !room.offers) return;
    room.offers.delete(socket.id);
    if (!room.offers.size) proceedAfterDecision(room);
  });

  // Host-Einstellungen (nur Host, nur in der Lobby), serverseitig validiert ─────────────
  on('update_settings', (d) => {
    const room = getRoom();
    if (!room || !d || typeof d !== 'object') return;
    if (room.permanent || room.hostId !== socket.id) return socket.emit('settings_denied', { reason: 'host' });
    if (room.phase !== 'waiting' || room.starting) return socket.emit('settings_denied', { reason: 'phase' });
    const deny = (reason) => socket.emit('settings_denied', { reason });
    // erst alles pruefen, dann uebernehmen
    if (d.rounds !== undefined && !ROUND_CHOICES.includes(d.rounds)) return deny('rounds');
    if (d.answerTime !== undefined && !ANSWER_CHOICES.includes(d.answerTime)) return deny('answerTime');
    if (d.difficulty !== undefined && (typeof d.difficulty !== 'string' || !Object.prototype.hasOwnProperty.call(DIFFICULTIES, d.difficulty))) return deny('difficulty');
    if (d.maxPlayers !== undefined && (room.isClass || !Number.isInteger(d.maxPlayers) || d.maxPlayers < MIN_PLAYERS_SETTING || d.maxPlayers > MAX_PLAYERS || d.maxPlayers < playerCount(room))) return deny('maxPlayers');
    if (d.categories !== undefined && !Array.isArray(d.categories)) return deny('categories');
    if (d.password !== undefined && (typeof d.password !== 'string' || d.password.length > 40)) return deny('password');
    if (d.build !== undefined && !BUILD_CHOICES.includes(d.build)) return deny('build');
    if (d.buildSeconds !== undefined && !BUILD_SECONDS.includes(d.buildSeconds)) return deny('buildSeconds');
    if (d.tf !== undefined && !TF_CHOICES.includes(d.tf)) return deny('tf');
    if (d.rounds !== undefined) room.rounds = d.rounds;
    if (d.answerTime !== undefined) room.answerTime = d.answerTime;
    if (d.difficulty !== undefined) room.difficulty = d.difficulty;
    if (d.maxPlayers !== undefined) room.maxPlayers = d.maxPlayers;
    if (d.build !== undefined) room.build = d.build;
    if (d.tf !== undefined) room.tf = d.tf;
    if (d.buildSeconds !== undefined) room.buildSeconds = d.buildSeconds;
    if (d.categories !== undefined) {
      const cats = d.categories.filter(c => typeof c === 'string' && KNOWN_CATEGORIES.has(c)).slice(0, 30);
      room.categories = cats.length ? cats : null;
    }
    if (d.isPublic !== undefined) room.isPublic = !!d.isPublic;
    if (d.password !== undefined) room.password = d.password.slice(0, 40) || null;
    room.questionOrder = shuffle(buildPool(room.categories, room.difficulty, room.build, room.tf)); room.currentIndex = 0;
    io.to(room.id).emit('settings_updated', settingsOf(room));
    broadcastLobby(room);
  });

  // Host entfernt direkt ──────────────────────────────────────────────────────────
  on('kick_player', (d) => {
    const room = getRoom();
    if (!room || !d || typeof d.id !== 'string') return;
    if (room.permanent || room.hostId !== socket.id || d.id === socket.id) return;
    const t = room.players[d.id];
    if (!t || !t.connected) return;
    kickPlayer(room, d.id, 'host');
  });

  // Votekick: ab 3 verbundenen Spielern, 15 s, Mehrheit der uebrigen Spieler ──────────────
  on('votekick_start', (d) => {
    const room = getRoom();
    if (!room || !d || typeof d.id !== 'string') return;
    const me = room.players[socket.id], t = room.players[d.id];
    if (!me || !t || !t.connected || d.id === socket.id) return socket.emit('votekick_denied', { reason: 'target' });
    if (room.isClass || connectedIds(room).length < VOTE_MIN_PLAYERS) return socket.emit('votekick_denied', { reason: 'players' });
    if (room.vote) return socket.emit('votekick_denied', { reason: 'running' });
    if (d.id === room.hostId) return socket.emit('votekick_denied', { reason: 'host' });
    const now = Date.now();
    if ((room.voteCooldown.get(me.token) || 0) > now) return socket.emit('votekick_denied', { reason: 'cooldown' });
    if ((room.targetCooldown.get(t.name.toLowerCase()) || 0) > now) return socket.emit('votekick_denied', { reason: 'target_cooldown' });
    room.voteCooldown.set(me.token, now + VOTE_COOLDOWN_MS);
    const v = { id: crypto.randomBytes(4).toString('hex'), targetId: d.id, targetName: t.name, initiatorId: socket.id,
                yes: new Set([socket.id]), no: new Set(), needed: 0, endsAt: now + VOTE_WINDOW_MS, timer: null };
    v.timer = setTimeout(() => { if (room.vote === v) endVote(room, false, 'zeit'); }, VOTE_WINDOW_MS);
    room.vote = v;
    v.needed = Math.floor(voters(room, v).length / 2) + 1;
    io.to(room.id).emit('votekick_started', voteStatus(v));
    voteEval(room);
  });
  on('votekick_vote', (d) => {
    const room = getRoom();
    if (!room || !room.vote || !d || typeof d.yes !== 'boolean') return;
    const v = room.vote;
    if (socket.id === v.targetId || !room.players[socket.id] || !room.players[socket.id].connected) return;
    v.yes.delete(socket.id); v.no.delete(socket.id);
    (d.yes ? v.yes : v.no).add(socket.id);
    voteEval(room);
  });

  // Revanche nach dem Spielende (alle bestaetigen, oder mindestens 2 und nach 5 s) ──────────
  on('rematch', () => {
    const room = getRoom();
    if (!room || room.phase !== 'game_over' || !room.players[socket.id]) return;
    if (room.rematch.has(socket.id)) room.rematch.delete(socket.id); else room.rematch.add(socket.id);
    rematchCheck(room);
  });

  // Bau-Runde: Raster pruefen (3 Pruefungen je Spieler, Loesung nie ausgeliefert) ──────────
  on('build_check', (d) => {
    const room = getRoom();
    if (!room || room.phase !== 'building' || room.resolving || !room.question || !room.builds) return;
    const p = room.players[socket.id];
    if (!p || !p.connected) return;
    const st = room.builds.get(socket.id) || { attempts: 0, done: false, ms: null, order: 0, timeLeft: 0 };
    if (st.done || st.attempts >= BUILD_CHECKS) return socket.emit('build_result', { valid: true, correct: !!st.done, final: true, attemptsLeft: 0 });
    const grid = cleanBuildGrid(d && d.grid);
    if (!grid || !grid.flat().some(Boolean)) return socket.emit('build_result', { valid: false, correct: false, final: false, attemptsLeft: BUILD_CHECKS - st.attempts });
    const diff = CraftCheck.diff(room.question, grid);
    st.attempts++;
    if (diff.ok) {
      st.done = true; st.ms = Date.now() - room.qStart; st.order = ++room.buildSeq; st.timeLeft = room.timerLeft;
      room.builds.set(socket.id, st);
      socket.emit('build_result', { valid: true, correct: true, final: true, attemptsLeft: BUILD_CHECKS - st.attempts });
      io.to(room.id).emit('player_built', { playerId: p.id, playerName: p.name, order: st.order });
    } else {
      room.builds.set(socket.id, st);
      socket.emit('build_result', { valid: true, correct: false, final: st.attempts >= BUILD_CHECKS, attemptsLeft: BUILD_CHECKS - st.attempts, diff: { correct: diff.correct, total: diff.total, cells: diff.cells } });
    }
    broadcastLobby(room);
    checkBuildDone(room);
  });

  // Rundenuebersicht und Host-Report ────────────────────────────────────────────
  on('get_round_overview', () => {
    const room = getRoom(); if (!room) return;
    socket.emit('round_overview', { history: room.history, players: scoreList(room).map(x => ({ name: x.name, score: x.score })) });
  });
  on('get_host_report', () => {
    const room = getRoom();
    if (!room || room.hostId !== socket.id || !['game_over', 'result'].includes(room.phase)) return;
    socket.emit('host_report', hostReport(room));
  });

  // Teams (nur Host, nur Lobby) ────────────────────────────────────────────────
  const teamsDeny = (reason) => socket.emit('teams_denied', { reason });
  on('update_teams', (d) => {
    const room = getRoom(); if (!room || !d || typeof d !== 'object') return;
    if (room.permanent || room.hostId !== socket.id) return teamsDeny('host');
    if (room.phase !== 'waiting' || room.starting) return teamsDeny('phase');
    if (d.enabled === false) { room.teams = null; room.teamCarry = {}; Object.values(room.players).forEach(p => { p.teamId = null; }); broadcastLobby(room); io.to(room.id).emit('teams_updated', null); return; }
    if (d.enabled !== true && !room.teams) return teamsDeny('phase');
    const count = d.count === undefined ? (room.teams ? room.teams.list.length : 2) : d.count;
    if (!Number.isInteger(count) || count < 2 || count > 4) return teamsDeny('count');
    let list = (room.teams ? room.teams.list : TEAM_DEFAULTS).slice(0, count).map(t => Object.assign({}, t));
    while (list.length < count) list.push(Object.assign({}, TEAM_DEFAULTS[list.length]));
    if (d.teams !== undefined) {
      if (!Array.isArray(d.teams) || d.teams.length > 4) return teamsDeny('count');
      for (const u of d.teams) {
        const t = u && list.find(x => x.id === u.id);
        if (!t) return teamsDeny('count');
        if (u.name !== undefined) { const n = typeof u.name === 'string' ? cleanText(u.name, 16) : ''; if (!n || badText(n)) return teamsDeny('name'); t.name = n; }
        if (u.symbol !== undefined) { if (!TEAM_SYMBOLS.includes(u.symbol)) return teamsDeny('symbol'); t.symbol = u.symbol; }
        if (u.color !== undefined) { if (!TEAM_COLORS.includes(u.color)) return teamsDeny('color'); t.color = u.color; }
      }
    }
    const uniq = (k) => new Set(list.map(t => String(t[k]).toLowerCase())).size === list.length;
    if (!uniq('name') || !uniq('symbol') || !uniq('color')) return teamsDeny('duplicate');
    const wasOff = !room.teams;
    room.teams = { list };
    if (wasOff) { Object.values(room.players).forEach(p => { p.teamId = null; }); balanceTeams(room); }
    else Object.values(room.players).forEach(p => assignTeam(room, p));
    io.to(room.id).emit('teams_updated', teamsOf(room));
    broadcastLobby(room);
  });
  on('balance_teams', () => {
    const room = getRoom(); if (!room) return;
    if (room.permanent || room.hostId !== socket.id) return teamsDeny('host');
    if (!room.teams || room.phase !== 'waiting') return teamsDeny('phase');
    balanceTeams(room); broadcastLobby(room);
  });
  on('move_player', (d) => {
    const room = getRoom(); if (!room || !d || typeof d.id !== 'string' || typeof d.teamId !== 'string') return;
    if (!room.teams || room.phase !== 'waiting' || room.starting) return teamsDeny('phase');
    if (d.id !== socket.id && room.hostId !== socket.id) return teamsDeny('host');
    const p = room.players[d.id];
    if (!p || !room.teams.list.some(t => t.id === d.teamId)) return teamsDeny('count');
    p.teamId = d.teamId; broadcastLobby(room);
  });

  // Raum-Einladungen: Profil-Anmeldung des Sockets, Freund einladen, annehmen/ablehnen ────────
  const meProfile = () => (socket.data.pid && profilesApi ? profilesApi.profiles()[socket.data.pid] || null : null);
  const unlinkPid = () => { const set = onlinePids.get(socket.data.pid); if (set) { set.delete(socket.id); if (!set.size) onlinePids.delete(socket.data.pid); } };
  socket.on('disconnect', () => { if (socket.data.pid) unlinkPid(); });
  on('profile_auth', (d) => {
    const p = profilesApi ? profilesApi.authToken(d && d.pt) : null;
    if (!p) return socket.emit('profile_auth_failed', {});
    if (socket.data.pid && socket.data.pid !== p.pid) unlinkPid();
    socket.data.pid = p.pid;
    if (!onlinePids.has(p.pid)) onlinePids.set(p.pid, new Set());
    onlinePids.get(p.pid).add(socket.id);
    socket.emit('profile_auth_ok', { pid: p.pid, name: p.name });
  });
  on('invite_friend', (d) => {
    const deny = (reason) => socket.emit('invite_denied', { reason });
    const me = meProfile(); if (!me) return deny('auth');
    const room = getRoom();
    if (!room || !room.players[socket.id] || playerCount(room) >= room.maxPlayers) return deny('room');
    const target = d && typeof d.pid === 'string' ? profilesApi.profiles()[d.pid] : null;
    if (!target || !profilesApi.social.friends(me, target) || profilesApi.social.blockedEither(me, target)) return deny('friend');
    const tsock = socketsOf(target.pid);
    if (!tsock.length) return deny('offline');
    if (tsock.some(sid => room.players[sid])) return deny('room');                    // schon im Raum
    const pend = [...invites.values()].filter(i => i.to === target.pid);
    if (pend.filter(i => i.from === me.pid).length >= 3 || pend.length >= 10) return deny('limit');
    if (!inviteAllowed(me.pid)) return deny('rate');
    const id = crypto.randomBytes(6).toString('hex');
    invites.set(id, { id, from: me.pid, to: target.pid, roomId: room.id, createdAt: Date.now(), accepted: false });
    tsock.forEach(sid => io.to(sid).emit('room_invite', { inviteId: id, from: { pid: me.pid, name: me.name }, roomId: room.id, roomName: room.displayName, hasPassword: !!room.password, expiresIn: Math.round(INVITE_TTL / 1000) }));
    socket.emit('invite_sent', { inviteId: id });
  });
  on('invite_respond', (d) => {
    const me = meProfile(); const inv = me && d && typeof d.inviteId === 'string' ? invites.get(d.inviteId) : null;
    if (!inv || inv.to !== me.pid || typeof d.accept !== 'boolean') return;
    const room = rooms[inv.roomId];
    if (Date.now() - inv.createdAt > INVITE_TTL || !room || room.dead) { dropInvite(inv, false); return socket.emit('invite_expired', { inviteId: inv.id }); }
    if (d.accept) {
      inv.accepted = true;
      socket.emit('invite_accepted', { roomId: inv.roomId, inviteId: inv.id });
      socketsOf(inv.from).forEach(sid => io.to(sid).emit('invite_accepted_by', { pid: me.pid, name: me.name }));
    } else {
      dropInvite(inv, false);
      socketsOf(inv.from).forEach(sid => io.to(sid).emit('invite_declined', { pid: me.pid, name: me.name }));
    }
  });
  on('get_invites', () => {
    const me = meProfile(); if (!me) return;
    const list = [...invites.values()].filter(i => i.to === me.pid && rooms[i.roomId] && !rooms[i.roomId].dead).map(i => {
      const r = rooms[i.roomId], f = profilesApi.profiles()[i.from];
      return { inviteId: i.id, from: f ? { pid: f.pid, name: f.name } : null, roomId: i.roomId, roomName: r.displayName, hasPassword: !!r.password, accepted: i.accepted, expiresIn: Math.max(0, Math.round((INVITE_TTL - (Date.now() - i.createdAt)) / 1000)) };
    });
    socket.emit('invites', { list });
  });

  // Weiterspielen ──────────────────────────────────────────────────────────────
  on('continue_game', () => {
    const room = getRoom();
    if (!room || room.phase !== 'game_over') return;
    resetRoom(room);
  });

  // Disconnect ─────────────────────────────────────────────────────────────────
  socket.on('disconnect', () => {
    clearInterval(pingIv);
    try { leaveCurrent(false); } catch (e) { log('error', 'disconnect_error', { error: String(e && e.message).slice(0, 120) }); }
    broadcastPublicRooms();
  });
});

// ── 5 permanente oeffentliche Raeume ─────────────────────────────────────────
function makePermanentRoom(i) {
  const id = 'public-' + i;
  const r = makeRoom({ id, displayName: 'Raum #' + i, isPublic: true, permanent: true });
  r.questionOrder = shuffle(buildPool(null));
  rooms[id] = r;
}
for (let i = 1; i <= 5; i++) makePermanentRoom(i);
log('info', 'permanent_rooms', { count: 5 });

process.on('uncaughtException', (e) => log('error', 'uncaught_exception', { error: String(e && e.message).slice(0, 160) }));
process.on('unhandledRejection', (e) => log('error', 'unhandled_rejection', { error: String(e && e.message).slice(0, 160) }));

const PORT = process.env.PORT || 3000;
store.init(['ranked', 'reports', 'qstats', 'runs', 'profiles', 'skins', 'social', 'qreview'], { ranked: [], reports: [], qstats: {}, runs: {}, profiles: {}, skins: {}, social: {}, qreview: {} }).then((kind) => {
  hydrateRanked();
  // Profile und Freunde (lib/profiles.js): nach dem Laden des Speichers einhaengen; nutzt die signierten Ranked-Tokens zur Anmeldung
  profilesApi = require('./lib/profiles.js').create({ app, express, store, rankedStore, saveRankedSoon, sign: rankedApi.sign, verify: rankedApi.verify, apiAllowed, log, getQuestions: () => allQuestions, categories: { has: (k) => KNOWN_CATEGORIES.has(k) } });
  rankedApi.hooks.onRankUp = (key, d) => profilesApi.social.onRankUp(key, d);
  rankedApi.hooks.onCommit = (key) => profilesApi.social.onRankedCommit(key);
  // Datenschutz: Meldungen hoechstens 12 Monate speichern (beim Start und taeglich); Altbestand ohne Zeitstempel bekommt das Startdatum
  const purge = () => { const before = store.get('reports'); const after = purgeReports(before); if (!Array.isArray(before) || after.length !== before.length || before.some(r => !Number.isFinite(r && r.ts))) store.set('reports', after); };
  purge();
  setInterval(purge, 24 * 3600 * 1000).unref();
  server.listen(PORT, () => console.log(JSON.stringify({ level: 'info', event: 'listening', port: Number(PORT), persist: kind })));
});
// Sauberes Beenden (Render sendet SIGTERM bei Deploy/Neustart): keine neuen Verbindungen, Daten speichern, nach spaetestens 8 s beenden
let shuttingDown = false;
function shutdown(sig) {
  if (shuttingDown) return;
  shuttingDown = true;
  log('info', 'shutdown', { signal: sig });
  const force = setTimeout(() => process.exit(0), 8000); force.unref();
  try { io.emit('server_restart', {}); } catch (e) {}
  try { server.close(); } catch (e) {}
  store.flush().catch(() => {}).finally(() => process.exit(0));
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
