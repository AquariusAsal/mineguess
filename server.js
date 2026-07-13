/**
 * MineGuess – Multiplayer Beta Server
 * Node.js + Socket.io
 *
 * Start: npm install && node server.js
 * Öffne dann: http://localhost:3000
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
  const html  = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
  const match = html.match(/const questions = (\[[\s\S]*?\]);\s*\/\/ Shuffle/);
  if (match) {
    allQuestions = JSON.parse(match[1]);
    console.log(`✅ ${allQuestions.length} Fragen geladen.`);
  }
} catch (e) {
  console.error('❌ Fragen konnten nicht geladen werden:', e.message);
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ── Raum-Verwaltung ───────────────────────────────────────────────────────────
const rooms = {};
const ANSWER_TIME = 40;
const RESULT_TIME = 5;
const MAX_PLAYERS = 8;

function createRoom({ roomId, displayName, isPublic, password }) {
  return {
    id:            roomId,
    displayName:   displayName || roomId,
    isPublic:      !!isPublic,
    password:      password || null,
    players:       {},
    questionOrder: shuffle([...Array(allQuestions.length).keys()]),
    currentIndex:  0,
    question:      null,
    phase:         'waiting',
    timer:         null,
    timerLeft:     ANSWER_TIME,
    roundNum:      0,
    createdAt:     Date.now(),
  };
}

function getPublicRooms() {
  return Object.values(rooms)
    .filter(r => r.isPublic)
    .map(r => ({
      id:          r.id,
      displayName: r.displayName,
      playerCount: Object.keys(r.players).length,
      maxPlayers:  MAX_PLAYERS,
      phase:       r.phase,
      roundNum:    r.roundNum,
    }))
    .sort((a, b) => b.playerCount - a.playerCount);
}

function broadcastPublicRooms() {
  io.emit('public_rooms_update', getPublicRooms());
}

function broadcastRoomState(room) {
  const players = Object.values(room.players).map(p => ({
    id: p.id, name: p.name, score: p.score, answered: p.answered,
  }));
  io.to(room.id).emit('room_state', { players, phase: room.phase });
  broadcastPublicRooms();
}

function nextQuestion(room) {
  clearInterval(room.timer);

  if (room.currentIndex >= room.questionOrder.length) {
    room.questionOrder = shuffle([...Array(allQuestions.length).keys()]);
    room.currentIndex  = 0;
  }

  room.question   = allQuestions[room.questionOrder[room.currentIndex]];
  room.currentIndex++;
  room.roundNum++;
  room.phase      = 'question';
  room.timerLeft  = ANSWER_TIME;

  Object.values(room.players).forEach(p => { p.answered = false; });

  const q = room.question;
  io.to(room.id).emit('question', {
    id:        q.id,
    type:      q.type,
    question:  q.question,
    category:  q.category,
    unit:      q.unit || null,
    options:   q.type === 'entity' ? q.acceptedAnswers : null,
    roundNum:  room.roundNum,
    timeLimit: ANSWER_TIME,
  });

  broadcastRoomState(room);

  room.timer = setInterval(() => {
    room.timerLeft--;
    io.to(room.id).emit('timer', { left: room.timerLeft });
    if (room.timerLeft <= 0) { clearInterval(room.timer); revealResult(room); }
  }, 1000);
}

function checkAnswer(rawInput, room) {
  const q = room.question;
  if (!q) return { correct: false, arrow: '?', text: 'Keine Frage aktiv' };

  if (q.type === 'number') {
    const val   = parseFloat(String(rawInput).replace(',', '.'));
    if (isNaN(val)) return { correct: false, arrow: '?', text: 'Ungültige Zahl' };
    const diff  = Math.abs(val - q.answer);
    const close = diff / Math.max(Math.abs(q.answer), 1);
    const correct = diff <= (q.tolerance ?? 0);
    const arrow = correct ? '✅' : (val < q.answer ? '⬆' : '⬇');
    const text  = correct ? 'Richtig!' : (close < 0.15 ? 'Sehr nah dran!' : (val < q.answer ? 'Zu niedrig' : 'Zu hoch'));
    return { correct, arrow, text };
  } else {
    const norm     = s => s.toLowerCase().replace(/[^a-z0-9äöüß]/g, '');
    const accepted = (q.acceptedAnswers || [q.answer]).map(norm);
    const correct  = accepted.includes(norm(String(rawInput)));
    return { correct, arrow: correct ? '✅' : '❌', text: correct ? 'Richtig!' : 'Falsch!' };
  }
}

function revealResult(room) {
  clearInterval(room.timer);
  room.phase = 'result';

  const q      = room.question;
  const answer = q.type === 'number'
    ? `${q.answer}${q.unit ? ' ' + q.unit : ''}` : q.answer;

  io.to(room.id).emit('result', {
    answer,
    funFact: q.funFact,
    scores:  Object.values(room.players)
               .map(p => ({ id: p.id, name: p.name, score: p.score }))
               .sort((a, b) => b.score - a.score),
    nextIn:  RESULT_TIME,
  });

  broadcastRoomState(room);
  setTimeout(() => {
    if (Object.keys(room.players).length > 0) nextQuestion(room);
  }, RESULT_TIME * 1000);
}

// ── Socket.io ─────────────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log('🔌 Verbunden:', socket.id);
  let currentRoom = null;

  // Raum erstellen ─────────────────────────────────────────────────────────────
  socket.on('create_room', ({ playerName, displayName, isPublic, password }) => {
    const words = ['epic','cool','wild','dark','fire','iron','diamond','golden',
                   'creeper','zombie','blaze','wither','steve','alex'];
    const rid = words[Math.floor(Math.random()*words.length)] +
                words[Math.floor(Math.random()*words.length)] +
                Math.floor(Math.random()*100);

    const room = createRoom({ roomId: rid, displayName: displayName || rid, isPublic, password });
    rooms[rid] = room;
    currentRoom = rid;

    room.players[socket.id] = {
      id: socket.id, name: playerName || 'Host', score: 0, answered: false,
    };

    socket.join(rid);
    socket.emit('joined', {
      playerId:    socket.id,
      roomId:      rid,
      displayName: room.displayName,
      playerName:  room.players[socket.id].name,
      isPublic:    room.isPublic,
    });

    broadcastRoomState(room);
    console.log(`🏠 Raum erstellt: ${rid} (${isPublic ? 'öffentlich' : 'privat'})`);
    setTimeout(() => nextQuestion(room), 3000);
  });

  // Raum beitreten ─────────────────────────────────────────────────────────────
  socket.on('join_room', ({ roomId, playerName, password }) => {
    const rid  = roomId.toLowerCase().trim();
    const room = rooms[rid];

    if (!room) {
      socket.emit('join_error', { message: `Raum "${rid}" nicht gefunden.` });
      return;
    }
    if (Object.keys(room.players).length >= MAX_PLAYERS) {
      socket.emit('join_error', { message: 'Raum ist voll (max. 8 Spieler).' });
      return;
    }
    if (!room.isPublic && room.password && room.password !== password) {
      socket.emit('join_error', { message: 'Falsches Passwort.' });
      return;
    }

    currentRoom = rid;
    room.players[socket.id] = {
      id: socket.id,
      name: playerName || `Spieler ${Object.keys(room.players).length + 1}`,
      score: 0, answered: false,
    };

    socket.join(rid);
    socket.emit('joined', {
      playerId:    socket.id,
      roomId:      rid,
      displayName: room.displayName,
      playerName:  room.players[socket.id].name,
      isPublic:    room.isPublic,
    });

    broadcastRoomState(room);
    console.log(`➕ ${room.players[socket.id].name} → Raum ${rid}`);

    if (room.phase === 'waiting') setTimeout(() => nextQuestion(room), 2000);
  });

  // Öffentliche Räume abrufen ──────────────────────────────────────────────────
  socket.on('get_public_rooms', () => {
    socket.emit('public_rooms_update', getPublicRooms());
  });

  // Antwort ────────────────────────────────────────────────────────────────────
  socket.on('submit_answer', ({ answer }) => {
    if (!currentRoom) return;
    const room   = rooms[currentRoom];
    if (!room || room.phase !== 'question') return;
    const player = room.players[socket.id];
    if (!player || player.answered) return;

    player.answered = true;
    const result    = checkAnswer(answer, room);
    const timeBonus = Math.round(room.timerLeft / ANSWER_TIME * 50);
    if (result.correct) player.score += 100 + timeBonus;

    socket.emit('answer_result', {
      ...result, score: player.score,
      timeBonus: result.correct ? timeBonus : 0,
    });

    broadcastRoomState(room);
    if (Object.values(room.players).every(p => p.answered)) revealResult(room);
  });

  // Disconnect ─────────────────────────────────────────────────────────────────
  socket.on('disconnect', () => {
    if (!currentRoom || !rooms[currentRoom]) return;
    const room = rooms[currentRoom];
    const name = room.players[socket.id]?.name;
    delete room.players[socket.id];
    console.log(`➖ ${name} hat Raum verlassen`);
    broadcastRoomState(room);

    if (Object.keys(room.players).length === 0) {
      clearInterval(room.timer);
      delete rooms[currentRoom];
      console.log(`🗑 Raum ${currentRoom} gelöscht`);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 MineGuess Multiplayer läuft auf http://localhost:${PORT}`);
});
