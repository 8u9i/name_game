const express = require("express");
const app = express();
const http = require("http").createServer(app);
const io = require("socket.io")(http, {
  cors: {
    origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : ["http://localhost:3000"],
    methods: ["GET", "POST"]
  },
  pingTimeout: 60000,
  pingInterval: 25000
});

// Rate limiting per socket
const rateLimiter = new Map();
const RATE_LIMIT_WINDOW = 1000; // 1 second
const MAX_REQUESTS_PER_WINDOW = 10;

app.use(express.static("public"));

// Security headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  next();
});

const rooms = new Map();
const players = new Map();

// Constants
const MAX_ROOM_CODE_ATTEMPTS = 10;
const MAX_PLAYER_NAME_LENGTH = 20;
const MAX_ANSWER_LENGTH = 50;
const VALID_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
const MIN_PLAYERS_TO_START = 2;
const MAX_PLAYERS_PER_ROOM = 6;
const CATEGORIES = ["name", "plant", "animal", "thing", "country"];

// Utility Functions
function sanitizeInput(input) {
  if (typeof input !== 'string') return '';
  return input
    .trim()
    .replace(/[<>\"'&]/g, '') // Remove potentially dangerous characters
    .substring(0, MAX_ANSWER_LENGTH);
}

function sanitizeName(name) {
  if (typeof name !== 'string') return '';
  return name
    .trim()
    .replace(/[<>\"'&]/g, '')
    .substring(0, MAX_PLAYER_NAME_LENGTH);
}

function isValidLetter(letter) {
  return typeof letter === 'string' && VALID_LETTERS.includes(letter.toUpperCase());
}

function generateRoomCode() {
  let attempts = 0;
  let code;
  do {
    code = Math.random().toString(36).substring(2, 8).toUpperCase();
    attempts++;
    if (attempts > MAX_ROOM_CODE_ATTEMPTS) {
      // Fallback to timestamp-based code if too many collisions
      code = Date.now().toString(36).toUpperCase().substring(0, 6);
      break;
    }
  } while (rooms.has(code));
  return code;
}

function checkRateLimit(socketId) {
  const now = Date.now();
  const userRequests = rateLimiter.get(socketId) || [];
  
  // Remove old requests outside the window
  const recentRequests = userRequests.filter(time => now - time < RATE_LIMIT_WINDOW);
  
  if (recentRequests.length >= MAX_REQUESTS_PER_WINDOW) {
    return false; // Rate limit exceeded
  }
  
  recentRequests.push(now);
  rateLimiter.set(socketId, recentRequests);
  return true;
}

function clearTimer(room) {
  if (room && room.timerInterval) {
    clearInterval(room.timerInterval);
    room.timerInterval = null;
  }
}

function cleanupRoom(roomCode) {
  const room = rooms.get(roomCode);
  if (room) {
    clearTimer(room);
    // Remove all players from this room
    room.players.forEach(player => {
      players.delete(player.id);
    });
    rooms.delete(roomCode);
    console.log(`🗑️ Room '${roomCode}' cleaned up completely.`);
  }
}

io.on("connection", (socket) => {
  console.log("A new player connected:", socket.id);

  // === ROOM CREATION ===
  socket.on("createRoom", (playerName) => {
    if (!checkRateLimit(socket.id)) {
      return socket.emit("error", "Too many requests. Please slow down.");
    }

    const sanitizedName = sanitizeName(playerName);
    
    if (!sanitizedName || sanitizedName.length < 2) {
      return socket.emit("error", "Player name must be between 2-20 characters.");
    }

    // Check if player is already in a room
    if (players.has(socket.id)) {
      return socket.emit("error", "You are already in a room.");
    }

    console.log(`🎮 Player '${sanitizedName}' (${socket.id}) is creating a room.`);
    const roomCode = generateRoomCode();
    const newPlayer = {
      id: socket.id,
      name: sanitizedName,
      score: 0,
      ready: false,
      finishedReviewing: false,
    };
    const room = {
      code: roomCode,
      host: socket.id,
      players: [newPlayer],
      status: "waiting",
      currentRound: 0,
      maxRounds: 5,
      currentLetter: null,
      timer: 60,
      answers: new Map(),
      timerInterval: null,
      letterChooserIndex: 0,
      submittedPlayers: new Set(), // Track who has submitted
    };
    rooms.set(roomCode, room);
    players.set(socket.id, { roomCode, name: sanitizedName });
    socket.join(roomCode);
    socket.emit("roomCreated", { roomCode, player: newPlayer });
    console.log(`✅ Room '${roomCode}' created by '${sanitizedName}'. Total rooms: ${rooms.size}`);
  });

  // === JOINING A ROOM ===
  socket.on("joinRoom", ({ roomCode, playerName }) => {
    if (!checkRateLimit(socket.id)) {
      return socket.emit("error", "Too many requests. Please slow down.");
    }

    const sanitizedName = sanitizeName(playerName);
    const sanitizedRoomCode = typeof roomCode === 'string' ? roomCode.trim().toUpperCase() : '';

    if (!sanitizedName || sanitizedName.length < 2) {
      return socket.emit("error", "Player name must be between 2-20 characters.");
    }

    if (!sanitizedRoomCode) {
      return socket.emit("error", "Invalid room code.");
    }

    // Check if player is already in a room
    if (players.has(socket.id)) {
      return socket.emit("error", "You are already in a room. Please leave first.");
    }

    console.log(`🚪 Player '${sanitizedName}' is trying to join room '${sanitizedRoomCode}'.`);
    const room = rooms.get(sanitizedRoomCode);

    if (!room) return socket.emit("error", "Room not found.");
    if (room.status !== "waiting") return socket.emit("error", "The game has already started.");
    if (room.players.length >= MAX_PLAYERS_PER_ROOM) return socket.emit("error", "The room is full.");
    
    const isNameTaken = room.players.some((p) => p.name === sanitizedName);
    if (isNameTaken) return socket.emit("error", "This name is already taken in this room.");
    
    const newPlayer = { 
      id: socket.id, 
      name: sanitizedName, 
      score: 0, 
      ready: false,
      finishedReviewing: false,
    };
    room.players.push(newPlayer);
    players.set(socket.id, { roomCode: sanitizedRoomCode, name: sanitizedName });
    socket.join(sanitizedRoomCode);
    socket.emit("joinedRoom", { roomCode: sanitizedRoomCode, player: newPlayer, players: room.players });
    socket.broadcast.to(sanitizedRoomCode).emit("playerJoined", { player: newPlayer, players: room.players });
    console.log(`✅ '${sanitizedName}' joined room '${sanitizedRoomCode}'. Players: ${room.players.length}`);
  });

  // === PLAYER READY STATE ===
  socket.on("playerReady", () => {
    if (!checkRateLimit(socket.id)) return;

    const validation = validatePlayerAndRoom(socket.id);
    if (!validation.isValid) return socket.emit("syncError", validation.message);
    const { room, player } = validation;

    if (room.status !== "waiting") {
      return socket.emit("syncError", "Cannot change ready state after game starts.");
    }

    player.ready = !player.ready;
    io.to(room.code).emit("playerReadyUpdate", {
      playerId: socket.id,
      isReady: player.ready,
    });
    console.log(`👍 '${player.name}' is now ${player.ready ? 'ready' : 'not ready'}.`);

    const allReady = room.players.every((p) => p.ready);
    if (allReady && room.players.length >= MIN_PLAYERS_TO_START) {
      startGame(room.code);
    }
  });

  // === LETTER SELECTION ===
  socket.on("letterChosen", (letter) => {
    if (!checkRateLimit(socket.id)) return;

    const validation = validatePlayerAndRoom(socket.id);
    if (!validation.isValid) return socket.emit("syncError", validation.message);
    const { room, player } = validation;
    
    if (room.status !== "choosing") {
      return socket.emit("syncError", "Not in letter choosing phase.");
    }

    const chooser = room.players[room.letterChooserIndex % room.players.length];
    if (socket.id !== chooser.id) {
      console.log(`⚠️ Security: '${player.name}' tried to choose a letter out of turn.`);
      return socket.emit("syncError", "It's not your turn to choose.");
    }

    if (!isValidLetter(letter)) {
      return socket.emit("syncError", "Invalid letter selected.");
    }

    const upperLetter = letter.toUpperCase();
    room.currentLetter = upperLetter;
    room.status = "playing";
    room.submittedPlayers.clear(); // Reset submission tracking
    
    console.log(`🔤 Letter '${upperLetter}' was chosen for room '${room.code}'.`);
    io.to(room.code).emit("gameStarted", {
      letter: room.currentLetter,
      round: room.currentRound,
      maxRounds: room.maxRounds,
    });
    startTimer(room.code);
  });

  // === ANSWER SUBMISSION ===
  socket.on("submitAnswers", (answers) => {
    if (!checkRateLimit(socket.id)) return;

    const validation = validatePlayerAndRoom(socket.id);
    if (!validation.isValid) return socket.emit("syncError", validation.message);
    const { room, player } = validation;

    if (room.status !== "playing") {
      return socket.emit("syncError", "Not in playing phase.");
    }

    // Prevent double submission
    if (room.submittedPlayers.has(socket.id)) {
      return socket.emit("syncError", "You already submitted your answers.");
    }

    // Validate and sanitize answers
    const sanitizedAnswers = {};
    if (typeof answers === 'object' && answers !== null) {
      CATEGORIES.forEach(category => {
        if (answers[category]) {
          sanitizedAnswers[category] = sanitizeInput(answers[category]);
        }
      });
    }

    room.answers.set(socket.id, sanitizedAnswers);
    room.submittedPlayers.add(socket.id);
    
    console.log(`📝 '${player.name}' submitted answers. (${room.submittedPlayers.size}/${room.players.length})`);
    io.to(room.code).emit("playerSubmitted", { playerId: socket.id });
    
    if (room.submittedPlayers.size === room.players.length) {
      endRound(room.code);
    }
  });

  // === PLAYER FINISHED REVIEWING SCORES ===
  socket.on('finishedReviewing', () => {
    if (!checkRateLimit(socket.id)) return;

    const validation = validatePlayerAndRoom(socket.id);
    if (!validation.isValid) return socket.emit("syncError", validation.message);
    const { room, player } = validation;

    if (room.status !== "reviewing") {
      return socket.emit("syncError", "Not in reviewing phase.");
    }

    player.finishedReviewing = true;
    const allFinished = room.players.every(p => p.finishedReviewing);
    
    if (allFinished) {
      console.log(`✅ All players in '${room.code}' are ready for the next round.`);
      room.players.forEach(p => p.finishedReviewing = false);
      
      if (room.currentRound < room.maxRounds) {
        nextRound(room.code);
      } else {
        endGame(room.code);
      }
    }
  });

  // === DISCONNECTION / LEAVING ===
  socket.on("disconnect", () => {
    handlePlayerLeave(socket.id);
    rateLimiter.delete(socket.id); // Cleanup rate limiter
  });

  socket.on("leaveRoom", () => {
    handlePlayerLeave(socket.id);
  });
});

// --- Validation Helper Function ---
function validatePlayerAndRoom(socketId) {
  const playerData = players.get(socketId);
  if (!playerData) {
    return { isValid: false, message: "Your session has expired. Please rejoin." };
  }
  
  const room = rooms.get(playerData.roomCode);
  if (!room) {
    players.delete(socketId);
    return { isValid: false, message: "The room you were in no longer exists." };
  }

  const player = room.players.find(p => p.id === socketId);
  if (!player) {
    players.delete(socketId);
    return { isValid: false, message: "You are no longer part of this room." };
  }

  return { isValid: true, room, player, playerData };
}

// --- Game Logic Functions ---

function startGame(roomCode) {
  const room = rooms.get(roomCode);
  if (!room || room.status !== "waiting") return;
  
  console.log(`🚀 Starting game in room '${roomCode}'!`);
  room.status = "choosing";
  room.currentRound = 1;
  room.letterChooserIndex = 0;
  room.players.forEach(p => {
    p.score = 0;
    p.finishedReviewing = false;
  });
  
  io.to(roomCode).emit('gameStarting');
  chooseLetterPhase(roomCode);
}

function chooseLetterPhase(roomCode) {
  const room = rooms.get(roomCode);
  if (!room) return;
  
  clearTimer(room); // Ensure no zombie timers
  room.answers.clear();
  room.submittedPlayers.clear();
  room.timer = 60;
  room.status = 'choosing';
  
  const chooser = room.players[room.letterChooserIndex % room.players.length];
  console.log(`👉 It's '${chooser.name}'s turn to choose a letter in room '${room.code}'.`);
  
  io.to(roomCode).emit('newRoundPhase', {
    phase: 'choosing',
    chooserName: chooser.name,
    chooserId: chooser.id,
    round: room.currentRound
  });
}

function startTimer(roomCode) {
  const room = rooms.get(roomCode);
  if (!room) return;
  
  clearTimer(room); // Clear any existing timer
  room.timer = 60;
  
  room.timerInterval = setInterval(() => {
    room.timer--;
    io.to(roomCode).emit("timerUpdate", room.timer);
    
    if (room.timer <= 0) {
      clearTimer(room); // Clear timer before ending round
      endRound(roomCode);
    }
  }, 1000);
}

function endRound(roomCode) {
  const room = rooms.get(roomCode);
  
  // Prevent race condition - check if already reviewing
  if (!room || room.status === 'reviewing' || room.status === 'finished') {
    return;
  }
  
  console.log(`⏰ Round ${room.currentRound} ended in room '${roomCode}'.`);
  room.status = "reviewing";
  clearTimer(room);
  
  // Ensure all players have entries (empty if not submitted)
  room.players.forEach(player => {
    if (!room.answers.has(player.id)) {
      room.answers.set(player.id, {});
    }
  });
  
  calculateScores(roomCode);
}

function calculateScores(roomCode) {
  const room = rooms.get(roomCode);
  if (!room) return;
  
  const roundScores = new Map();
  room.players.forEach(p => roundScores.set(p.id, 0));
  
  CATEGORIES.forEach(category => {
    const categoryAnswers = new Map();
    
    room.answers.forEach((answers, playerId) => {
      const answer = answers[category]?.trim().toLowerCase();
      if (answer && answer.length > 0) {
        // Check if answer starts with the current letter
        const firstChar = answer.charAt(0).toUpperCase();
        if (firstChar === room.currentLetter) {
          if (!categoryAnswers.has(answer)) {
            categoryAnswers.set(answer, []);
          }
          categoryAnswers.get(answer).push(playerId);
        }
      }
    });
    
    // Score calculation: 10 for unique, 5 for duplicate
    categoryAnswers.forEach((playerIds) => {
      if (playerIds.length === 1) {
        const pid = playerIds[0];
        roundScores.set(pid, roundScores.get(pid) + 10);
      } else {
        playerIds.forEach(pid => {
          roundScores.set(pid, roundScores.get(pid) + 5);
        });
      }
    });
  });
  
  // Update total scores
  roundScores.forEach((score, playerId) => {
    const player = room.players.find(p => p.id === playerId);
    if (player) player.score += score;
  });
  
  const allAnswers = Array.from(room.answers.entries()).map(([playerId, answers]) => ({
    playerId,
    playerName: room.players.find(p => p.id === playerId)?.name,
    answers
  }));
  
  console.log(`📊 Scores calculated for room '${roomCode}'.`);
  io.to(roomCode).emit("scoresCalculated", {
    allAnswers,
    roundScores: Array.from(roundScores.entries()).map(([id, score]) => ({ playerId: id, score })),
    totalScores: room.players.map(p => ({ playerId: p.id, name: p.name, score: p.score })),
  });
}

function nextRound(roomCode) {
  const room = rooms.get(roomCode);
  if (!room) return;
  
  room.currentRound++;
  room.letterChooserIndex++;
  
  console.log(`➡️  Starting next round (${room.currentRound}) for room '${roomCode}'.`);
  chooseLetterPhase(roomCode);
}

function endGame(roomCode) {
  const room = rooms.get(roomCode);
  if (!room || room.status === 'finished') return;
  
  room.status = "finished";
  clearTimer(room);
  
  const sortedPlayers = [...room.players].sort((a, b) => b.score - a.score);
  console.log(`🏆 Game ended in room '${roomCode}'. Winner: ${sortedPlayers[0]?.name}`);
  
  io.to(roomCode).emit("gameEnded", {
    winner: sortedPlayers[0],
    rankings: sortedPlayers,
  });
  
  // Cleanup room after 30 seconds
  setTimeout(() => {
    cleanupRoom(roomCode);
  }, 30 * 1000);
}

function handlePlayerLeave(socketId) {
  const playerData = players.get(socketId);
  if (!playerData) return;
  
  const { roomCode, name } = playerData;
  const room = rooms.get(roomCode);
  
  players.delete(socketId);
  
  if (!room) return;
  
  console.log(`👋 Player '${name}' (${socketId}) left room '${roomCode}'.`);
  
  room.players = room.players.filter((p) => p.id !== socketId);
  room.submittedPlayers.delete(socketId); // Remove from submitted tracking
  
  if (room.players.length === 0) {
    cleanupRoom(roomCode);
  } else {
    // Handle host migration
    if (room.host === socketId) {
      room.host = room.players[0].id;
      console.log(`👑 '${room.players[0].name}' is the new host of room '${roomCode}'.`);
    }
    
    io.to(roomCode).emit("playerLeft", {
      playerId: socketId,
      playerName: name,
      players: room.players,
      newHostId: room.host,
    });
    
    // If everyone remaining has submitted, end the round
    if (room.status === "playing") {
      const allRemainingSubmitted = room.players.every(p => room.submittedPlayers.has(p.id));
      if (allRemainingSubmitted) {
        endRound(roomCode);
      }
    }
    
    // If in waiting and everyone is ready, start game
    if (room.status === "waiting") {
      const allReady = room.players.every(p => p.ready);
      if (allReady && room.players.length >= MIN_PLAYERS_TO_START) {
        startGame(roomCode);
      }
    }
  }
}

// Cleanup zombie data periodically
setInterval(() => {
  const now = Date.now();
  // Clean rate limiter
  rateLimiter.forEach((requests, socketId) => {
    const recentRequests = requests.filter(time => now - time < RATE_LIMIT_WINDOW);
    if (recentRequests.length === 0) {
      rateLimiter.delete(socketId);
    } else {
      rateLimiter.set(socketId, recentRequests);
    }
  });
}, 60000); // Every minute

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
  console.log(`🎮 Server is running on port ${PORT}`);
  console.log(`🌐 Open in browser: http://localhost:${PORT}`);
});
