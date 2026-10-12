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
const io     = new Server(server, { cors: { origin: '*' }, maxHttpBufferSize: 32 * 1024 });

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
const BUZZ_WINDOW  = 120;          // ms: gleichzeitige Buzzes werden latenzbereinigt verglichen
const GRACE_MS     = 30000;        // Reconnect-Fenster
const MAX_NAME_LEN = 16;
const MAX_ANSWER_LEN = 100;
const MAX_ROOMS    = 300;
const MAX_SKIN_LEN = 6000;
const OPTION_COUNT = 8;

// ── Eingabe-Hilfen ────────────────────────────────────────────────────────────
function cleanText(v, max) {
  if (typeof v !== 'string' && typeof v !== 'number') return '';
  return String(v).replace(/[\u0000-\u001f\u007f<>"`&​-‏‪-‮⁦-⁩﻿]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
}

// Skin: winziges PNG als data-URL. Nur validieren, nie speichern, nie als HTML ausgeben.
function validSkin(s) {
  const PRE = 'data:image/png;base64,';
  if (typeof s !== 'string' || s.length > MAX_SKIN_LEN || !s.startsWith(PRE)) return null;
  const b64 = s.slice(PRE.length);
  if (!b64 || !/^[A-Za-z0-9+/]+={0,2}$/.test(b64)) return null;
  let buf;
  try { buf = Buffer.from(b64, 'base64'); } catch (e) { return null; }
  if (buf.length < 33 || buf.length > 4500) return null;
  if (buf.readUInt32BE(0) !== 0x89504e47 || buf.readUInt32BE(4) !== 0x0d0a1a0a) return null;
  if (buf.toString('ascii', 12, 16) !== 'IHDR') return null;
  const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20);
  if (w < 1 || h < 1 || w > 64 || h > 64) return null;
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
  return { id: p.id, name: p.name, score: p.score, skin: p.skin || null, connected: p.connected, ready: room ? room.ready.has(p.id) : false };
}
function scoreList(room) {
  return Object.values(room.players)
    .map(p => ({ id: p.id, name: p.name, score: p.score, skin: p.skin || null, connected: p.connected }))
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
      handleWrongAnswer(room, room.currentBuzzer, null, true);
    }
  }, 1000);
}

// ── Falsche Antwort → naechster Spieler ──────────────────────────────────────
function handleWrongAnswer(room, socketId, submittedAnswer, timeout = false, feedback = null) {
  clearInterval(room.timerIv);
  if (socketId) room.lockedOut.add(socketId);
  room.currentBuzzer = null;

  const player = room.players[socketId];
  const remaining = connectedIds(room).filter(id => !room.lockedOut.has(id));

  io.to(room.id).emit('answer_broadcast', {
    playerId:   socketId,
    playerName: player ? player.name : '?',
    correct:    false,
    timeout,
    submitted:  submittedAnswer,
    feedback,
    lockedOut:  [...room.lockedOut],
    remaining:  remaining.length,
  });

  if (remaining.length === 0) {
    room.answered = true;                       // nichts mehr annehmen
    later(room, () => revealResult(room, null), 1800);
  } else {
    room.phase = 'buzzer';
    room.answered = false;
    broadcastLobby(room);
    io.to(room.id).emit('buzzer_reset', { lockedOut: [...room.lockedOut] });
    startBuzzerCountdown(room);
  }
}

// ── Aufloesung ────────────────────────────────────────────────────────────────
function revealResult(room, winnerId) {
  if (room.dead || room.phase === 'result' || room.phase === 'game_over' || !room.question) return;
  stopTimers(room);
  room.phase = 'result';

  const q      = room.question;
  const answer = q.type === 'number' ? `${q.answer}${q.unit ? ' ' + q.unit : ''}` : q.answer;
  room.lastResult = { answer, funFact: q.funFact, winnerId, scores: scoreList(room), nextIn: RESULT_TIME };
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
  room.answered      = false;
  room.timerLeft     = ANSWER_TIME;

  io.to(room.id).emit('buzzer_won', { playerId: winner.id, playerName: winner.name });
  broadcastLobby(room);
  startAnswerCountdown(room);
}

// ── Snapshot fuer Spaetbeitritt / Reconnect ──────────────────────────────────
function sendSnapshot(socket, room) {
  broadcastLobby(room);
  if (room.phase === 'buzzer' || room.phase === 'answering') {
    socket.emit('question', questionPayload(room));
    socket.emit('timer', { left: room.timerLeft, max: room.phase === 'buzzer' ? BUZZER_TIME : ANSWER_TIME, phase: room.phase === 'buzzer' ? 'buzzer' : 'answering' });
    if (room.phase === 'answering' && room.currentBuzzer && room.players[room.currentBuzzer]) {
      socket.emit('buzzer_won', { playerId: room.currentBuzzer, playerName: room.players[room.currentBuzzer].name });
    }
    if (room.lockedOut.size) socket.emit('buzzer_reset', { lockedOut: [...room.lockedOut] });
  } else if (room.phase === 'result' && room.lastResult) {
    socket.emit('result', { ...room.lastResult, scores: scoreList(room) });
  } else if (room.phase === 'game_over' && room.lastGameOver) {
    socket.emit('game_over', { ...room.lastGameOver, scores: scoreList(room) });
  }
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

  function joinRoomAs(room, name, skin, rejoinPlayer) {
    let p = rejoinPlayer;
    if (!p) {
      p = { id: socket.id, name: uniqueName(room, name), score: 0, skin: skin || null,
            token: crypto.randomBytes(16).toString('hex'), connected: true, dcTimer: null };
      room.players[socket.id] = p;
    }
    currentRoom = room.id;
    socket.join(room.id);
    socket.emit('joined', {
      playerId: p.id, roomId: room.id, displayName: room.displayName, playerName: p.name,
      isPublic: room.isPublic, categories: room.categories, skin: p.skin || null,
      token: p.token, rejoined: !!rejoinPlayer,
    });
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

    // Buzzer-Halter weg → zaehlt als falsch
    if (room.currentBuzzer === id && room.phase === 'answering') handleWrongAnswer(room, id, null, true);
    room.ready.delete(id);

    const finalize = () => {
      clearTimeout(p.dcTimer);
      delete room.players[p.id];
      room.lockedOut.delete(p.id);
      room.ready.delete(p.id);
      if (room.currentBuzzer === p.id) room.currentBuzzer = null;
      if (room.dead) return;
      if (playerCount(room) === 0) {
        if (room.permanent) resetRoom(room); else destroyRoom(room);
        return;
      }
      if (connectedIds(room).length === 0) resetRoom(room);
      else { broadcastLobby(room); checkBuzzerDeadlock(room); maybeAutoStart(room); }
    };

    if (immediate) { finalize(); return; }

    p.connected = false;
    p.dcTimer = setTimeout(finalize, GRACE_MS);
    if (connectedIds(room).length === 0 && room.phase !== 'waiting') stopTimers(room);   // niemand da → pausieren
    broadcastLobby(room);
    checkBuzzerDeadlock(room);
    maybeAutoStart(room);
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
    joinRoomAs(room, cleanText(d.playerName, MAX_NAME_LEN) || 'Host', validSkin(d.skin), null);
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
    joinRoomAs(room, name, validSkin(d.skin), null);
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
    joinRoomAs(room, old.name, null, old);
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

  // ANTWORT ────────────────────────────────────────────────────────────────────
  on('submit_answer', (d) => {
    const room = getRoom();
    if (!room || room.phase !== 'answering' || room.currentBuzzer !== socket.id || room.answered) return;
    const raw = d && (typeof d.answer === 'string' || typeof d.answer === 'number') ? String(d.answer).slice(0, MAX_ANSWER_LEN) : '';
    const result = MGAnswer.check(room.question, raw);
    if (!result.valid) {                         // leer / keine Zahl → keine Strafe
      socket.emit('answer_invalid', { message: room.question.type === 'number' ? 'Bitte eine Zahl eingeben.' : 'Bitte eine Antwort eingeben.' });
      return;
    }

    clearInterval(room.timerIv);
    room.answered = true;
    const player     = room.players[socket.id];
    const speedBonus = Math.round(room.timerLeft / ANSWER_TIME * PTS_SPEED);
    const shown      = cleanText(raw, 60);

    if (result.correct) {
      player.score += PTS_CORRECT + speedBonus;
      io.to(room.id).emit('answer_broadcast', {
        playerId: socket.id, playerName: player.name, correct: true,
        submitted: shown, score: player.score, speedBonus,
      });
      broadcastLobby(room);
      later(room, () => revealResult(room, socket.id), 2000);
    } else {
      handleWrongAnswer(room, socket.id, shown, false, result.dir);
    }
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
