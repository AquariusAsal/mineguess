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
const MGAnswer   = require('./answer-check.js');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, { cors: { origin: '*' }, maxHttpBufferSize: 96 * 1024 });

// ── Statische Dateien (Server-/Config-Dateien nicht ausliefern) ──────────────
const BLOCKED = [
  /^\/(node_modules|\.git|\.claude|docs)(\/|$)/i,
  /^\/(server|fetch-wiki)\.js$/i,
  /^\/package(-lock)?\.json$/i,
  /^\/google-services\.json$/i,
  /\.(py|md|pdf|log|env)$/i,
];
app.use((req, res, next) => {
  let p = req.path;
  try { p = decodeURIComponent(p); } catch (e) { return res.status(400).end(); }
  if (BLOCKED.some(r => r.test(p))) return res.status(404).end();
  next();
});
app.use(express.static(path.join(__dirname), {
  dotfiles: 'ignore',
  setHeaders(res, file) {
    if (/\.(html|json|js|css)$/i.test(file)) res.setHeader('Cache-Control', 'no-cache');
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
    } else return bad('type unbekannt');
    ok.push(q);
  });
  return ok;
}
let allQuestions = [];
try {
  allQuestions = loadQuestions();
  console.log(`${allQuestions.length} Fragen geladen (questions.json).`);
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
const ANSWER_TIME  = 15;
const RESULT_TIME  = 6;
const MAX_PLAYERS  = 8;
const MAX_ROUNDS   = 10;
const PTS_CORRECT  = 150;
const PTS_SPEED    = 50;
const PTS_WRONG    = 50;
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

function buildPool(categories) {
  let pool = allQuestions.map((q, i) => i);
  if (categories && categories.length) {
    const set = new Set(categories);
    const filtered = allQuestions.map((q, i) => set.has(q.category) ? i : -1).filter(i => i !== -1);
    if (filtered.length >= 5) pool = filtered;
  }
  return pool;
}

function makeRoom({ id, displayName, isPublic, password, categories, permanent }) {
  return {
    id,
    displayName:   displayName || id,
    isPublic:      !!isPublic,
    password:      password || null,
    categories:    categories && categories.length ? categories : null,
    permanent:     !!permanent,
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
    penalized:     false,
    lastReveal:    null,
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
    try { fn(); } catch (e) { console.error('Timer-Fehler:', e); }
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
  return { id: p.id, name: p.name, score: p.score, skinId: p.skinId || null, character: p.character, connected: p.connected, totem: !p.totemUsed, ready: room ? room.ready.has(p.id) : false };
}
// Voller Datensatz inkl. Skin: nur einmalig (joined-Roster, player_joined, player_updated)
function fullPlayer(p) {
  return { id: p.id, name: p.name, score: p.score, skin: p.skin || null, skinId: p.skinId || null, character: p.character, connected: p.connected, totem: !p.totemUsed };
}
function scoreList(room) {
  return Object.values(room.players)
    .map(p => ({ id: p.id, name: p.name, score: p.score, skinId: p.skinId || null, character: p.character, connected: p.connected }))
    .sort((a, b) => b.score - a.score);
}

function getPublicRooms() {
  return Object.values(rooms)
    .filter(r => r.isPublic)
    .map(r => ({ id: r.id, displayName: r.displayName, playerCount: playerCount(r), hasPassword: !!r.password, maxPlayers: MAX_PLAYERS, phase: r.phase, roundNum: r.roundNum }))
    .sort((a, b) => b.playerCount - a.playerCount);
}
let pubTimer = null;
function broadcastPublicRooms() {
  if (pubTimer) return;
  pubTimer = setTimeout(() => { pubTimer = null; io.emit('public_rooms_update', getPublicRooms()); }, 250);
}

function broadcastLobby(room) {
  io.to(room.id).emit('room_state', {
    players: Object.values(room.players).map(p => publicPlayer(p, room)),
    phase: room.phase,
    lockedOut: [...room.lockedOut],
    currentBuzzer: room.currentBuzzer,
    firstBuzzer: room.firstBuzzer,
    answered: [...room.answers.keys()],
    readyCount: room.ready.size,
    totalCount: connectedIds(room).length,
  });
  broadcastPublicRooms();
}

// ── Antwort-Optionen (Entity-Fragen): richtige Antwort + Ablenker ────────────
function buildOptions(q) {
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
    roundNum: room.roundNum,
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
  room.penalized     = false;
  room.lastReveal    = null;

  if (!room.questionOrder.length || room.currentIndex >= room.questionOrder.length) {
    room.questionOrder = shuffle(buildPool(room.categories));
    room.currentIndex  = 0;
  }
  room.question = allQuestions[room.questionOrder[room.currentIndex++]];
  room.options  = room.question.type === 'entity' ? buildOptions(room.question) : null;
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
      revealResult(room, null);   // niemand hat gebuzzert
    }
  }, 1000);
}

function startAnswerCountdown(room) {
  clearInterval(room.timerIv);
  room.timerLeft = ANSWER_TIME;
  room.timerIv = setInterval(() => {
    if (room.dead) return clearInterval(room.timerIv);
    room.timerLeft--;
    io.to(room.id).emit('timer', { left: room.timerLeft, max: ANSWER_TIME, phase: 'answering' });
    if (room.timerLeft <= 0) {
      clearInterval(room.timerIv);
      finishAnswerPhase(room, 'timeout');
    }
  }, 1000);
}

// ── Antwortphase: alle antworten, Auswertung "am naechsten dran" ───────────────
function bandPoints(rel) {
  if (rel == null) return 0;
  return rel <= 0.05 ? 100 : rel <= 0.10 ? 80 : rel <= 0.20 ? 60 : rel <= APPROACH_LIMIT ? 40 : 0;
}

// Abzug nur fuer den ersten Laeutenden, hoechstens einmal je Frage, Score nie < 0
function applyPenalty(room, p) {
  if (!p || room.penalized) return 0;
  room.penalized = true;
  const before = p.score;
  p.score = Math.max(0, before - PTS_WRONG);
  return p.score - before;
}

function answerDone(room) {
  const ids = connectedIds(room);
  return ids.length === 0 || ids.every(id => room.answers.has(id));
}
function checkAnswerPhaseDone(room) {
  if (room.phase === 'answering' && !room.resolving && room.question && answerDone(room)) finishAnswerPhase(room, 'all');
}

function emitFirstBuzzerTimeout(room) {
  const fb = room.players[room.firstBuzzer];
  if (!fb || room.answers.has(fb.id) || room.penalized) return;
  const delta = applyPenalty(room, fb);
  io.to(room.id).emit('answer_timeout', { playerId: fb.id, playerName: fb.name, delta, penalty: PTS_WRONG, score: fb.score });
}

// Ergebnis der Antwortphase verkuenden, danach (REVEAL_DELAY) result
function concludeAnswerPhase(room, mode, winnerId, points) {
  room.resolving = true;
  room.answered = true;
  clearInterval(room.timerIv); room.timerIv = null;
  const q = room.question;
  const entries = [...room.answers.values()].sort((a, b) => a.order - b.order);
  const answers = entries.map(e => {
    const win = e.playerId === winnerId;
    const pts = win ? points : 0;
    return {
      playerId: e.playerId, playerName: e.playerName, text: e.text.slice(0, 40), correct: !!e.correct,
      deviationPct: e.rel == null ? null : Math.round(e.rel * 1000) / 10,
      points: pts, delta: pts + (e.penalty || 0), winner: win,
    };
  });
  // erster Laeutender ohne Antwort: Abzug als eigener Eintrag
  const fb = room.players[room.firstBuzzer];
  const fbAnswered = room.answers.has(room.firstBuzzer);
  room.lastReveal = {
    mode, winnerId: winnerId || null, firstBuzzerId: room.firstBuzzer || null, answers,
    correctAnswer: q.type === 'number' ? `${q.answer}${q.unit ? ' ' + q.unit : ''}` : q.answer,
  };
  io.to(room.id).emit('answers_revealed', room.lastReveal);
  if (winnerId && room.players[winnerId]) {
    const w = room.players[winnerId];
    const win = entries.find(e => e.playerId === winnerId);
    io.to(room.id).emit('answer_broadcast', {
      playerId: w.id, playerName: w.name, correct: true, submitted: win ? win.text : '',
      score: w.score, speedBonus: win && mode === 'exact' ? Math.max(0, points - PTS_CORRECT) : 0, delta: points,
    });
    io.to(room.id).emit('answer_given', {
      playerId: w.id, playerName: w.name, text: win ? win.text.slice(0, 40) : '', correct: true,
      delta: points, score: w.score, unit: q.unit || null,
    });
    room.lastAnswer = { playerId: w.id, text: win ? win.text : '', correct: true, timeout: false, delta: points };
  } else if (fb && !fbAnswered) {
    room.lastAnswer = { playerId: fb.id, text: null, correct: false, timeout: true, delta: 0 };
  }
  broadcastLobby(room);
  later(room, () => revealResult(room, winnerId || null), REVEAL_DELAY);
}

// Ende der 15 s oder alle haben geantwortet: Annaeherungswertung
function finishAnswerPhase(room, reason) {
  if (room.dead || room.phase !== 'answering' || room.resolving || !room.question) return;
  clearInterval(room.timerIv); room.timerIv = null;
  emitFirstBuzzerTimeout(room);
  let winnerId = null, mode = 'none', points = 0;
  if (room.question.type === 'number') {
    let best = null;
    for (const a of room.answers.values()) {
      if (bandPoints(a.rel) <= 0) continue;
      if (!best || a.rel < best.rel - 1e-12 || (Math.abs(a.rel - best.rel) <= 1e-12 && a.order < best.order)) best = a;
    }
    if (best && room.players[best.playerId]) {
      winnerId = best.playerId; mode = 'closest'; points = bandPoints(best.rel);
      room.players[winnerId].score += points;
    }
  }
  concludeAnswerPhase(room, mode, winnerId, points);
}

// ── Aufloesung ────────────────────────────────────────────────────────────────
function revealResult(room, winnerId) {
  if (room.dead || room.phase === 'result' || room.phase === 'game_over' || !room.question) return;
  stopTimers(room);
  room.phase = 'result';

  const q      = room.question;
  const answer = q.type === 'number' ? `${q.answer}${q.unit ? ' ' + q.unit : ''}` : q.answer;
  room.lastResult = { answer, funFact: q.funFact, winnerId, scores: scoreList(room), nextIn: RESULT_TIME,
    mode: room.lastReveal ? room.lastReveal.mode : 'none', answers: room.lastReveal ? room.lastReveal.answers : [] };
  io.to(room.id).emit('result', room.lastResult);
  broadcastLobby(room);

  if (room.roundNum >= MAX_ROUNDS) {
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
  room.penalized     = false;
  room.answered      = false;
  room.timerLeft     = ANSWER_TIME;

  room.typingId = null;
  io.to(room.id).emit('buzzer_won', { playerId: winner.id, playerName: winner.name });
  io.to(room.id).emit('buzzed', { playerId: winner.id, playerName: winner.name });
  io.to(room.id).emit('answer_phase', { firstBuzzerId: winner.id, endsIn: ANSWER_TIME, answered: [] });
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
    socket.emit('timer', { left: room.timerLeft, max: room.phase === 'buzzer' ? BUZZER_TIME : ANSWER_TIME, phase: room.phase === 'buzzer' ? 'buzzer' : 'answering' });
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

// ── Socket.io ─────────────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  let currentRoom = null;           // Raum-ID
  const limiter  = makeLimiter(20, 8);
  let lastCreate = 0;
  let joinFails  = 0, joinBlockUntil = 0;
  socket.data.rtt = 0;

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
    try { fn(...args); } catch (e) { console.error(`Fehler in ${ev}:`, e); }
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
            character: validCharacter(character), totemUsed: false,
            token: crypto.randomBytes(16).toString('hex'), connected: true, dcTimer: null };
      room.players[socket.id] = p;
    }
    currentRoom = room.id;
    socket.join(room.id);
    socket.emit('joined', {
      playerId: p.id, roomId: room.id, displayName: room.displayName, playerName: p.name,
      isPublic: room.isPublic, categories: room.categories, skin: p.skin || null,
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

    // Erster Laeutender weg ohne Antwort → Abzug wie Timeout, Runde laeuft fuer die anderen weiter
    if (room.firstBuzzer === id && room.phase === 'answering' && !room.resolving) emitFirstBuzzerTimeout(room);
    room.ready.delete(id);

    const finalize = () => {
      clearTimeout(p.dcTimer);
      delete room.players[p.id];
      io.to(room.id).emit('player_left', { id: p.id });
      room.lockedOut.delete(p.id);
      room.ready.delete(p.id);
      if (room.currentBuzzer === p.id) room.currentBuzzer = null;
      if (room.dead) return;
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
    const room = makeRoom({
      id: rid,
      displayName: cleanText(d.displayName, 30) || rid,
      isPublic: !!d.isPublic,
      password: pw || null,
      categories: cats,
    });
    room.questionOrder = shuffle(buildPool(room.categories));
    rooms[rid] = room;
    joinRoomAs(room, cleanText(d.playerName, MAX_NAME_LEN) || 'Host', validSkin(d.skin), null, d.character);
    console.log(`Raum: ${rid}${room.categories ? ' [' + room.categories.join(',') + ']' : ''}`);
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
    if (playerCount(room) >= MAX_PLAYERS) return fail('Raum voll.');
    if (room.password && room.password !== d.password) return fail('Falsches Passwort.');
    joinFails = 0;
    if (currentRoom) leaveCurrent(true);
    const name = cleanText(d.playerName, MAX_NAME_LEN) || `Spieler ${playerCount(room) + 1}`;
    joinRoomAs(room, name, validSkin(d.skin), null, d.character);
    console.log(`+ Spieler -> ${rid}`);
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
    const result = MGAnswer.check(q, raw);
    if (!result.valid) {                         // leer / keine Zahl → keine Strafe, Timer unveraendert
      socket.emit('answer_invalid', { message: q.type === 'number' ? 'Bitte eine Zahl eingeben.' : 'Bitte eine Antwort eingeben.' });
      return;
    }
    let rel = null;
    if (q.type === 'number') rel = Math.max(0, result.diff - MGAnswer.tolerance(q)) / Math.max(Math.abs(q.answer), 5);
    const entry = {
      playerId: socket.id, playerName: player.name, text: cleanText(raw, 60),
      correct: !!result.correct, rel, order: ++room.answerSeq, timeLeft: room.timerLeft, penalty: 0,
    };
    room.answers.set(socket.id, entry);
    room.typingId = null;

    if (result.correct) {
      // sofort volle Punkte, Runde endet, andere Antworten werden ignoriert
      const speedBonus = Math.round(room.timerLeft / ANSWER_TIME * PTS_SPEED);
      const gain = PTS_CORRECT + speedBonus;
      player.score += gain;
      concludeAnswerPhase(room, 'exact', socket.id, gain);
      return;
    }
    // nicht exakt: Abzug nur fuer den ersten Laeutenden und nur ausserhalb des Annaeherungsbereichs
    if (socket.id === room.firstBuzzer && (q.type !== 'number' || rel > APPROACH_LIMIT)) {
      entry.penalty = applyPenalty(room, player);
    }
    io.to(room.id).emit('answer_submitted', { playerId: socket.id, playerName: player.name, delta: entry.penalty, score: player.score });
    broadcastLobby(room);
    checkAnswerPhaseDone(room);
  });

  // TOTEM: ein Mal pro Spieler und Raum-Session (serverseitig), Wirkung = Solo-Joker "Tipp 1" ─────
  on('use_totem', () => {
    const room = getRoom();
    if (!room || room.phase !== 'answering' || room.resolving || !room.question) return socket.emit('totem_denied', { reason: 'phase' });
    const p = room.players[socket.id];
    if (!p || !p.connected) return;
    if (p.totemUsed) return socket.emit('totem_denied', { reason: 'used' });
    if (room.answers.has(socket.id)) return socket.emit('totem_denied', { reason: 'answered' });
    p.totemUsed = true;
    const q = room.question;
    if (q.type === 'number') {
      const margin = Math.max(Math.round(Math.abs(q.answer || 1) * 0.3), 3);
      socket.emit('totem_result', { kind: 'range', from: q.answer - margin, to: q.answer + margin, unit: q.unit || null });
    } else {
      const wrong = (room.options || []).filter(o => !MGAnswer.check(q, o).correct);
      const remove = shuffle(wrong).slice(0, 4);
      socket.emit('totem_result', { kind: 'options', remove });
    }
    io.to(room.id).emit('totem_used', { playerId: p.id, playerName: p.name });
    broadcastLobby(room);
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
    try { leaveCurrent(false); } catch (e) { console.error('disconnect:', e); }
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
console.log('5 permanente oeffentliche Raeume erstellt');

process.on('uncaughtException', (e) => console.error('uncaughtException:', e));
process.on('unhandledRejection', (e) => console.error('unhandledRejection:', e));

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`http://localhost:${PORT}`));
