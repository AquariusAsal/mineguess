/**
 * MineGuess – Multiplayer Beta Server (Buzzer Edition)
 * Node.js + Socket.io
 */

const express    = require('express');
const http       = require('http');
const { Server } = require('socket.io');
const path       = require('path');
const fs         = require('fs');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, { cors: { origin: '*' } });
app.use(express.static(path.join(__dirname)));

// ── Fragen laden ──────────────────────────────────────────────────────────────
let allQuestions = [];
try {
  // Questions are now in game.html (index.html is the landing page)
  const html  = fs.readFileSync(path.join(__dirname, 'game.html'), 'utf8');
  const match = html.match(/const questions = (\[[\s\S]*?\]);[\s\S]{0,200}allQuestions/);
  if (match) {
    allQuestions = JSON.parse(match[1]);
    console.log(`✅ ${allQuestions.length} Fragen geladen.`);
  } else {
    // Fallback: try any JSON array after "const questions ="
    const m2 = html.match(/const questions = (\[[\s\S]*?\n  \]);/);
    if (m2) { allQuestions = JSON.parse(m2[1]); console.log(`✅ ${allQuestions.length} Fragen (fallback).`); }
  }
} catch (e) { console.error('❌ Fragen laden fehlgeschlagen:', e.message); }

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

// ── Raum-Verwaltung ───────────────────────────────────────────────────────────
const rooms = {};

function createRoom({ roomId, displayName, isPublic, password, categories }) {
  // Build question pool — filtered by categories if host is Premium
  let pool = [...Array(allQuestions.length).keys()];
  if (categories && categories.length > 0) {
    const catSet = new Set(categories);
    pool = allQuestions
      .map((q, i) => catSet.has(q.category) ? i : -1)
      .filter(i => i !== -1);
    if (pool.length < 5) pool = [...Array(allQuestions.length).keys()]; // fallback
  }
  return {
    id:            roomId,
    displayName:   displayName || roomId,
    isPublic:      !!isPublic,
    password:      password || null,
    categories:    categories || null,
    players:       {},          // socketId → { id, name, score }
    ready:         new Set(),   // socketIds who pressed Ready
    questionOrder: shuffle(pool),
    currentIndex:  0,
    question:      null,
    // ── Buzzer state ──
    phase:         'waiting',   // waiting | buzzer | answering | result | game_over
    timerLeft:     BUZZER_TIME,
    currentBuzzer: null,        // socketId who buzzed
    lockedOut:     new Set(),   // socketIds who answered wrong this round
    timerIv:       null,
    answerTimer:   null,
    roundNum:      0,
  };
}

function getPublicRooms() {
  return Object.values(rooms)
    .filter(r => r.isPublic)
    .map(r => ({ id: r.id, displayName: r.displayName, playerCount: Object.keys(r.players).length, maxPlayers: MAX_PLAYERS, phase: r.phase, roundNum: r.roundNum }))
    .sort((a,b) => b.playerCount - a.playerCount);
}
function broadcastPublicRooms() { io.emit('public_rooms_update', getPublicRooms()); }

function broadcastLobby(room) {
  const players = Object.values(room.players).map(p => ({ id:p.id, name:p.name, score:p.score, ready: room.ready.has(p.id) }));
  io.to(room.id).emit('room_state', { players, phase: room.phase, lockedOut: [...room.lockedOut], currentBuzzer: room.currentBuzzer, readyCount: room.ready.size, totalCount: Object.keys(room.players).length });
  broadcastPublicRooms();
}

// ── Frage starten ─────────────────────────────────────────────────────────────
function nextQuestion(room) {
  clearInterval(room.timerIv);
  clearTimeout(room.answerTimer);
  room.lockedOut     = new Set();
  room.currentBuzzer = null;

  if (room.currentIndex >= room.questionOrder.length) {
    let pool = [...Array(allQuestions.length).keys()];
    if (room.categories && room.categories.length > 0) {
      const catSet = new Set(room.categories);
      const filtered = allQuestions.map((q,i)=>catSet.has(q.category)?i:-1).filter(i=>i!==-1);
      if (filtered.length >= 5) pool = filtered;
    }
    room.questionOrder = shuffle(pool);
    room.currentIndex  = 0;
  }
  room.question     = allQuestions[room.questionOrder[room.currentIndex++]];
  room.roundNum++;
  room.phase        = 'buzzer';
  room.timerLeft    = BUZZER_TIME;

  const q = room.question;
  io.to(room.id).emit('question', {
    id: q.id, type: q.type, question: q.question, category: q.category,
    unit: q.unit||null, options: q.type==='entity'?q.acceptedAnswers:null,
    roundNum: room.roundNum,
  });

  startBuzzerCountdown(room);
  broadcastLobby(room);
}

// ── Buzzer-Timer ──────────────────────────────────────────────────────────────
function startBuzzerCountdown(room) {
  clearInterval(room.timerIv);
  room.timerLeft = BUZZER_TIME;
  room.timerIv = setInterval(() => {
    room.timerLeft--;
    io.to(room.id).emit('timer', { left: room.timerLeft, max: BUZZER_TIME, phase: 'buzzer' });
    if (room.timerLeft <= 0) {
      clearInterval(room.timerIv);
      // Niemand hat gebuzzert → Auflösung
      revealResult(room, null);
    }
  }, 1000);
}

// ── Antwort-Timer (nach Buzzer) ───────────────────────────────────────────────
function startAnswerCountdown(room) {
  clearInterval(room.timerIv);
  room.timerLeft = ANSWER_TIME;
  room.timerIv = setInterval(() => {
    room.timerLeft--;
    io.to(room.id).emit('timer', { left: room.timerLeft, max: ANSWER_TIME, phase: 'answering' });
    if (room.timerLeft <= 0) {
      clearInterval(room.timerIv);
      handleWrongAnswer(room, room.currentBuzzer, null, true); // timeout
    }
  }, 1000);
}

// ── Antwort prüfen ────────────────────────────────────────────────────────────
function checkAnswer(rawInput, room) {
  const q = room.question;
  if (!q) return { correct: false };
  if (q.type === 'number') {
    const val = parseFloat(String(rawInput).replace(',','.'));
    if (isNaN(val)) return { correct: false, arrow:'?', text:'Ungültige Zahl' };
    const diff  = Math.abs(val - q.answer);
    const close = diff / Math.max(Math.abs(q.answer), 1);
    const correct = diff <= (q.tolerance ?? 0);
    return { correct, arrow: correct?'✅':(val<q.answer?'⬆':'⬇'), text: correct?'Richtig!':(close<0.15?'Sehr nah!':(val<q.answer?'Zu niedrig':'Zu hoch')) };
  } else {
    const norm = s => s.toLowerCase().replace(/[^a-z0-9äöüß]/g,'');
    const correct = (q.acceptedAnswers||[q.answer]).map(norm).includes(norm(String(rawInput)));
    return { correct, arrow: correct?'✅':'❌', text: correct?'Richtig!':'Falsch!' };
  }
}

// ── Falsche Antwort → nächster Spieler ───────────────────────────────────────
function handleWrongAnswer(room, socketId, submittedAnswer, timeout=false) {
  clearInterval(room.timerIv);
  if (socketId) room.lockedOut.add(socketId);
  room.currentBuzzer = null;

  const player = room.players[socketId];
  const remaining = Object.keys(room.players).filter(id => !room.lockedOut.has(id));

  io.to(room.id).emit('answer_broadcast', {
    playerId:    socketId,
    playerName:  player?.name || '?',
    correct:     false,
    timeout,
    submitted:   submittedAnswer,
    lockedOut:   [...room.lockedOut],
    remaining:   remaining.length,
  });

  if (remaining.length === 0) {
    // Alle falsch → Auflösung
    setTimeout(() => revealResult(room, null), 1800);
  } else {
    // Buzzer wieder öffnen für restliche Spieler
    room.phase = 'buzzer';
    broadcastLobby(room);
    io.to(room.id).emit('buzzer_reset', { lockedOut: [...room.lockedOut] });
    startBuzzerCountdown(room);
  }
}

// ── Auflösung ─────────────────────────────────────────────────────────────────
function revealResult(room, winnerId) {
  clearInterval(room.timerIv);
  clearTimeout(room.answerTimer);
  room.phase = 'result';

  const q      = room.question;
  const answer = q.type === 'number' ? `${q.answer}${q.unit?' '+q.unit:''}` : q.answer;

  io.to(room.id).emit('result', {
    answer,
    funFact:  q.funFact,
    winnerId,
    scores:   Object.values(room.players).map(p=>({id:p.id,name:p.name,score:p.score})).sort((a,b)=>b.score-a.score),
    nextIn:   RESULT_TIME,
  });

  broadcastLobby(room);

  // Check if game over (10 rounds)
  if (room.roundNum >= MAX_ROUNDS) {
    setTimeout(() => {
      io.to(room.id).emit('game_over', {
        scores: Object.values(room.players).map(p=>({id:p.id,name:p.name,score:p.score})).sort((a,b)=>b.score-a.score),
        rounds: room.roundNum,
      });
      room.phase = 'game_over';
    }, RESULT_TIME * 1000);
  } else {
    setTimeout(() => { if (Object.keys(room.players).length > 0) nextQuestion(room); }, RESULT_TIME * 1000);
  }
}

// ── Socket.io ─────────────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  let currentRoom = null;
  console.log('🔌', socket.id);

  // Raum erstellen ─────────────────────────────────────────────────────────────
  socket.on('create_room', ({ playerName, displayName, isPublic, password, categories }) => {
    const words = ['epic','cool','wild','dark','fire','iron','diamond','golden','creeper','zombie','blaze','wither','steve','alex'];
    const rid   = words[Math.floor(Math.random()*words.length)] + words[Math.floor(Math.random()*words.length)] + Math.floor(Math.random()*100);
    const room  = createRoom({ roomId: rid, displayName: displayName||rid, isPublic, password, categories });
    rooms[rid]  = room;
    currentRoom = rid;
    room.players[socket.id] = { id: socket.id, name: playerName||'Host', score: 0 };
    socket.join(rid);
    socket.emit('joined', { playerId: socket.id, roomId: rid, displayName: room.displayName, playerName: room.players[socket.id].name, isPublic: room.isPublic, categories: room.categories });
    broadcastLobby(room);
    console.log(`🏠 Raum: ${rid}${room.categories ? ' ['+room.categories.join(',')+']' : ''}`);
    // Game starts only when all players press Ready
  });

  // Raum beitreten ─────────────────────────────────────────────────────────────
  socket.on('join_room', ({ roomId, playerName, password }) => {
    const rid  = roomId.toLowerCase().trim();
    const room = rooms[rid];
    if (!room) { socket.emit('join_error', { message: `Raum "${rid}" nicht gefunden.` }); return; }
    if (Object.keys(room.players).length >= MAX_PLAYERS) { socket.emit('join_error', { message: 'Raum voll.' }); return; }
    if (!room.isPublic && room.password && room.password !== password) { socket.emit('join_error', { message: 'Falsches Passwort.' }); return; }
    currentRoom = rid;
    room.players[socket.id] = { id: socket.id, name: playerName||`Spieler ${Object.keys(room.players).length+1}`, score: 0 };
    socket.join(rid);
    socket.emit('joined', { playerId: socket.id, roomId: rid, displayName: room.displayName, playerName: room.players[socket.id].name, isPublic: room.isPublic });
    broadcastLobby(room);
    console.log(`➕ ${room.players[socket.id].name} → ${rid}`);
    // Don't auto-start — wait for all players to press Ready
  });

  // Öffentliche Räume ──────────────────────────────────────────────────────────
  socket.on('get_public_rooms', () => socket.emit('public_rooms_update', getPublicRooms()));

  // READY ──────────────────────────────────────────────────────────────────────
  socket.on('player_ready', () => {
    if (!currentRoom) return;
    const room = rooms[currentRoom];
    if (!room || room.phase !== 'waiting') return;
    const player = room.players[socket.id];
    if (!player) return;

    // Toggle ready state
    if (room.ready.has(socket.id)) {
      room.ready.delete(socket.id);
    } else {
      room.ready.add(socket.id);
    }
    broadcastLobby(room);
    console.log(`✅ Ready: ${room.ready.size}/${Object.keys(room.players).length} in ${currentRoom}`);

    // Start game when ALL players are ready (min 1)
    const total = Object.keys(room.players).length;
    if (total > 0 && room.ready.size === total) {
      console.log(`🎮 Alle bereit — Spiel startet in ${currentRoom}`);
      room.ready.clear();
      setTimeout(() => nextQuestion(room), 1500);
    }
  });

  // BUZZER ─────────────────────────────────────────────────────────────────────
  socket.on('buzz', () => {
    if (!currentRoom) return;
    const room   = rooms[currentRoom];
    if (!room || room.phase !== 'buzzer') return;
    const player = room.players[socket.id];
    if (!player || room.lockedOut.has(socket.id)) return;

    clearInterval(room.timerIv);
    room.phase         = 'answering';
    room.currentBuzzer = socket.id;
    room.timerLeft     = ANSWER_TIME;

    io.to(room.id).emit('buzzer_won', {
      playerId:   socket.id,
      playerName: player.name,
    });

    broadcastLobby(room);
    startAnswerCountdown(room);
  });

  // ANTWORT ──────────────────────────────────────────────────────
  socket.on('submit_answer', ({ answer }) => {
    if (!currentRoom) return;
    const room = rooms[currentRoom];
    if (!room || room.phase !== 'answering' || room.currentBuzzer !== socket.id) return;

    clearInterval(room.timerIv);
    const result     = checkAnswer(answer, room);
    const player     = room.players[socket.id];
    const speedBonus = Math.round(room.timerLeft / ANSWER_TIME * PTS_SPEED);

    if (result.correct) {
      player.score += PTS_CORRECT + speedBonus;
      io.to(room.id).emit('answer_broadcast', {
        playerId:    socket.id,
        playerName:  player.name,
        correct:     true,
        submitted:   answer,
        score:       player.score,
        speedBonus,
      });
      broadcastLobby(room);
      setTimeout(() => revealResult(room, socket.id), 2000);
    } else {
      handleWrongAnswer(room, socket.id, answer);
    }
  });

  // Weiterspielen ──────────────────────────────────────────────────────────────
  socket.on('continue_game', () => {
    if (!currentRoom) return;
    const room = rooms[currentRoom];
    if (!room || room.phase !== 'game_over') return;
    // Reset scores, round counter, and ready state
    Object.values(room.players).forEach(p => { p.score = 0; });
    room.roundNum = 0;
    room.ready.clear();
    room.phase = 'waiting';
    broadcastLobby(room);
  });

  // Disconnect ─────────────────────────────────────────────────────────────────
  socket.on('disconnect', () => {
    if (!currentRoom || !rooms[currentRoom]) return;
    const room = rooms[currentRoom];
    const name = room.players[socket.id]?.name;
    // Falls disconnected player hatte den Buzzer → falsche Antwort
    if (room.currentBuzzer === socket.id) handleWrongAnswer(room, socket.id, null, true);
    delete room.players[socket.id];
    room.lockedOut.delete(socket.id);
    room.ready.delete(socket.id);
    console.log(`➖ ${name} hat verlassen`);
    broadcastLobby(room);
    if (Object.keys(room.players).length === 0) { clearInterval(room.timerIv); delete rooms[currentRoom]; }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 http://localhost:${PORT}`));
.log(`🚀 http://localhost:${PORT}`));
