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
const PKG        = (() => { try { return require('./package.json'); } catch (e) { return {}; } })();

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, { cors: { origin: '*' }, maxHttpBufferSize: 96 * 1024 });

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
app.get('/health', (req, res) => {
  res.set('Cache-Control', 'no-store');
  const st = store.info();
  res.json({ ok: true, version: PKG.version || null, uptimeSec: Math.round((Date.now() - BOOT) / 1000), rooms: Object.keys(rooms).length,
    players: Object.values(rooms).reduce((n, r) => n + Object.values(r.players).filter(p => p.connected).length, 0),
    questions: Array.isArray(allQuestions) ? allQuestions.length : 0, persist: st.backend, persistError: !!st.lastError, counters });
});

// ── Rankliste: serverseitiger Fallback (oeffentlich lesbar, ohne Firestore-Regeln) ───────────
// Speicher: RAM + data/ranked.json. Auf Hosts mit fluechtigem Dateisystem (z. B. Render) geht die Datei beim Neustart verloren.
app.set('trust proxy', 1);
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
    .filter(e => e.verified)
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
app.post('/api/report', express.json({ limit: '2kb' }), (req, res) => {
  try {
    if (!apiAllowed('report', req.ip, 3, 30000)) return res.status(429).json({ ok: false });
    const b = req.body || {};
    if (!knownQuestionId(b.questionId)) return res.status(400).json({ ok: false });
    if (typeof b.reason !== 'string' || !REPORT_REASONS.has(b.reason)) return res.status(400).json({ ok: false });
    if (b.text != null && typeof b.text !== 'string') return res.status(400).json({ ok: false });
    const text = cleanText(b.text || '', 300);
    let reports = store.get('reports');
    if (!Array.isArray(reports)) reports = [];
    if (reports.length >= 5000) reports.shift();
    reports.push({ questionId: b.questionId, reason: b.reason, text, ts: Date.now() });
    store.set('reports', reports);
    res.json({ ok: true });
  } catch (e) { res.status(400).json({ ok: false }); }
});

app.post('/api/stats', express.json({ limit: '1kb' }), (req, res) => {
  try {
    if (!apiAllowed('stats', req.ip, 30, 2000)) return res.status(429).json({ ok: false });
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

require('./lib/ranked-api.js').create({ app, express, getQuestions: () => allQuestions, rankedStore, saveRankedSoon, cleanText, apiAllowed, log });

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
const RESULT_TIME  = 6;
const MAX_PLAYERS  = 8;
const DEFAULT_ROUNDS = 10;
const ROUND_CHOICES  = [10, 25, 50, 100];
const ANSWER_CHOICES = [8, 10, 15];
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
const REVEAL_DELAY = 2500;         // ms zwischen answers_revealed und result           // Abzug bei falscher Antwort / Timeout nach Buzz (Score faellt nicht unter 0)
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

function buildPool(categories, difficulty) {
  let pool = allQuestions.map((q, i) => i);
  if (categories && categories.length) {
    const set = new Set(categories);
    const filtered = allQuestions.map((q, i) => set.has(q.category) ? i : -1).filter(i => i !== -1);
    if (filtered.length >= 5) pool = filtered;
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
  return { id: p.id, name: p.name, score: p.score, skinId: p.skinId || null, character: p.character, connected: p.connected, totem: !!p.hasTotem, streak: p.streak || 0, ready: room ? room.ready.has(p.id) : false };
}
// Voller Datensatz inkl. Skin: nur einmalig (joined-Roster, player_joined, player_updated)
function fullPlayer(p) {
  return { id: p.id, name: p.name, score: p.score, skin: p.skin || null, skinId: p.skinId || null, character: p.character, connected: p.connected, totem: !!p.hasTotem, streak: p.streak || 0 };
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
           maxPlayers: room.maxPlayers, isPublic: room.isPublic, hasPassword: !!room.password };
}

// Host-Uebergabe: naechster verbundener Spieler (nach Beitrittsreihenfolge)
function passHost(room) {
  if (room.permanent) return;
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
    answered: [...room.answers.keys()],
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
  return {
    id: q.id, type: q.type, question: q.question, category: q.category,
    unit: q.unit || null, options: room.options || null,
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
    room.questionOrder = shuffle(buildPool(room.categories, room.difficulty));
    if (room.questionOrder.length > 1 && room.questionOrder[0] === lastIdx) {
      const t = room.questionOrder[0]; room.questionOrder[0] = room.questionOrder[1]; room.questionOrder[1] = t;
    }
    room.currentIndex  = 0;
  }
  room.question = allQuestions[room.questionOrder[room.currentIndex++]];
  room.options  = (room.question.type === 'entity' || room.question.type === 'crafting') ? buildOptions(room.question) : null;
  room.roundNum++;
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
      points: 0, delta: penalty, winner: false, skipped: false, firstBuzzer: isBell, noAnswer: true,
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
  io.to(room.id).emit('result', room.lastResult);
  broadcastLobby(room);

  if (room.roundNum >= room.rounds) {
    later(room, () => {
      room.phase = 'game_over';
      room.lastGameOver = { scores: scoreList(room), rounds: room.roundNum };
      io.to(room.id).emit('game_over', room.lastGameOver);
      broadcastLobby(room);
    }, RESULT_TIME * 1000);
  } else {
    later(room, () => { if (connectedIds(room).length > 0) nextQuestion(room); else resetRoom(room); }, RESULT_TIME * 1000);
  }
}

// Raum zurueck in die Lobby (z. B. wenn alle weg sind)
function resetRoom(room) {
  stopTimers(room);
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
  if (room.phase !== 'waiting' || room.starting) return;
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
  if (room.phase === 'buzzer' || room.phase === 'answering') {
    socket.emit('question', questionPayload(room));
    socket.emit('timer', { left: room.timerLeft, max: room.phase === 'buzzer' ? BUZZER_TIME : atime(room), phase: room.phase === 'buzzer' ? 'buzzer' : 'answering' });
    if (room.phase === 'answering' && room.currentBuzzer && room.players[room.currentBuzzer]) {
      socket.emit('buzzer_won', { playerId: room.currentBuzzer, playerName: room.players[room.currentBuzzer].name });
    }
    if (room.phase === 'answering') socket.emit('answer_phase', { firstBuzzerId: room.firstBuzzer, endsIn: room.timerLeft, answered: [...room.answers.keys()] });
  } else if (room.phase === 'result' && room.lastResult) {
    socket.emit('result', { ...room.lastResult, scores: scoreList(room) });
  } else if (room.phase === 'game_over' && room.lastGameOver) {
    socket.emit('game_over', { ...room.lastGameOver, scores: scoreList(room) });
  }
  socket.emit('scene', sceneState(room));
}

// ── Host-Einstellungen, Votekick, Revanche ───────────────────────────────────
const KICK_BAN_MS = 5 * 60 * 1000;
const VOTE_WINDOW_MS = 15000;
const VOTE_MIN_PLAYERS = 3;
const VOTE_COOLDOWN_MS = 60000;      // je Initiator
const TARGET_COOLDOWN_MS = 120000;   // je Ziel nach gescheiterter Abstimmung
function ipOf(socket) {
  const xf = socket.handshake.headers && socket.handshake.headers['x-forwarded-for'];
  return (typeof xf === 'string' && xf.split(',')[0].trim()) || socket.handshake.address || '';
}
function kickPlayer(room, targetId, reason) {
  const t = io.sockets.sockets.get(targetId);
  const p = room.players[targetId];
  if (!p) return false;
  if (t) {
    room.kickBan.set(ipOf(t), Date.now() + KICK_BAN_MS);
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
    currentRoom = room.id;
    socket.join(room.id);
    socket.emit('joined', {
      playerId: p.id, roomId: room.id, displayName: room.displayName, playerName: p.name,
      isPublic: room.isPublic, categories: room.categories, rounds: room.rounds, skin: p.skin || null,
      hostId: room.hostId, settings: settingsOf(room),
      token: p.token, rejoined: !!rejoinPlayer,
      character: p.character,
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
      delete room.players[p.id];
      io.to(room.id).emit('player_left', { id: p.id });
      room.lockedOut.delete(p.id);
      room.ready.delete(p.id);
      if (room.currentBuzzer === p.id) room.currentBuzzer = null;
      if (room.dead) return;
      room.rematch.delete(p.id);
      if (room.hostId === p.id) { room.hostId = null; passHost(room); }
      voteCheckTarget(room, p.id);
      if (playerCount(room) === 0) {
        if (room.permanent) resetRoom(room); else destroyRoom(room);
        return;
      }
      if (connectedIds(room).length === 0) resetRoom(room);
      else { broadcastLobby(room); checkBuzzerDeadlock(room); maybeAutoStart(room); checkAnswerPhaseDone(room); }
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
    room.questionOrder = shuffle(buildPool(room.categories, room.difficulty));
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
    if (!room || room.dead) return fail(`Raum "${cleanText(rid, 40)}" nicht gefunden.`);
    if (currentRoom === rid && room.players[socket.id]) return;     // schon drin
    if (playerCount(room) >= room.maxPlayers) return fail('Raum voll.');
    const ban = room.kickBan.get(ipOf(socket));
    if (ban && ban > Date.now()) return fail('Du wurdest aus diesem Raum entfernt.');
    if (room.password && room.password !== d.password) return fail('Falsches Passwort.');
    joinFails = 0;
    if (currentRoom) leaveCurrent(true);
    const name = cleanText(d.playerName, MAX_NAME_LEN) || `Spieler ${playerCount(room) + 1}`;
    joinRoomAs(room, name, validSkin(d.skin), null, d.character);
    log('info', 'player_joined', { players: playerCount(room) });
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
    if (d.maxPlayers !== undefined && (!Number.isInteger(d.maxPlayers) || d.maxPlayers < MIN_PLAYERS_SETTING || d.maxPlayers > MAX_PLAYERS || d.maxPlayers < playerCount(room))) return deny('maxPlayers');
    if (d.categories !== undefined && !Array.isArray(d.categories)) return deny('categories');
    if (d.password !== undefined && typeof d.password !== 'string') return deny('password');
    if (d.rounds !== undefined) room.rounds = d.rounds;
    if (d.answerTime !== undefined) room.answerTime = d.answerTime;
    if (d.difficulty !== undefined) room.difficulty = d.difficulty;
    if (d.maxPlayers !== undefined) room.maxPlayers = d.maxPlayers;
    if (d.categories !== undefined) {
      const cats = d.categories.filter(c => typeof c === 'string' && KNOWN_CATEGORIES.has(c)).slice(0, 30);
      room.categories = cats.length ? cats : null;
    }
    if (d.isPublic !== undefined) room.isPublic = !!d.isPublic;
    if (d.password !== undefined) room.password = d.password.slice(0, 40) || null;
    room.questionOrder = shuffle(buildPool(room.categories, room.difficulty)); room.currentIndex = 0;
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
    if (connectedIds(room).length < VOTE_MIN_PLAYERS) return socket.emit('votekick_denied', { reason: 'players' });
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
store.init(['ranked', 'reports', 'qstats', 'runs'], { ranked: [], reports: [], qstats: {}, runs: {} }).then((kind) => {
  hydrateRanked();
  server.listen(PORT, () => console.log(JSON.stringify({ level: 'info', event: 'listening', port: Number(PORT), persist: kind })));
});
process.on('SIGTERM', () => { store.flush().finally(() => process.exit(0)); });
