const express = require("express");
const app = express();
const http = require("http").createServer(app);
const io = require("socket.io")(http, {
  cors: {
    origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(",") : ["http://localhost:3000"],
    methods: ["GET", "POST"]
  },
  pingTimeout: 60000,
  pingInterval: 25000
});

// Rate limiting per socket
const rateLimiter = new Map();
const RATE_LIMIT_WINDOW = 1000; // 1 second
const MAX_REQUESTS_PER_WINDOW = 10;

// Constants
const MAX_ROOM_CODE_ATTEMPTS = 10;
const MAX_PLAYER_NAME_LENGTH = 20;
const MAX_ANSWER_LENGTH = 50;
const VALID_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
const MIN_PLAYERS_TO_START = 2;
const MAX_PLAYERS_PER_ROOM = 6;
const CATEGORIES = ["name", "plant", "animal", "thing", "country"];
const ROOM_EMPTY_GRACE_MS = 30000; // Grace period for rooms after game end
const WAITING_ROOM_IDLE_TIMEOUT = parseInt(process.env.WAITING_ROOM_IDLE_TIMEOUT || "600000", 10); // 10 min default

app.use(express.static("public"));

// Security headers
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  next();
});

const rooms = new Map();
const players = new Map();

// --- Utility Functions ---
function sanitizeInput(input) {
  if (typeof input !== "string") return "";
  return input.trim().replace(/[<>\"'&]/g, "").substring(0, MAX_ANSWER_LENGTH);
}

function sanitizeName(name) {
  if (typeof name !== "string") return "";
  return name.trim().replace(/[<>\"'&]/g, "").substring(0, MAX_PLAYER_NAME_LENGTH);
}

function isValidLetter(letter) {
  return typeof letter === "string" && VALID_LETTERS.includes(letter.toUpperCase());
}

function generateRoomCode() {
  let attempts = 0;
  let code;
  do {
    code = Math.random().toString(36).substring(2, 8).toUpperCase();
    attempts++;
    if (attempts > MAX_ROOM_CODE_ATTEMPTS) {
      code = Date.now().toString(36).toUpperCase().substring(0, 6);
      break;
    }
  } while (rooms.has(code));
  return code;
}

function checkRateLimit(socketId) {
  const now = Date.now();
  const userRequests = rateLimiter.get(socketId) || [];
  const recent = userRequests.filter(t => now - t < RATE_LIMIT_WINDOW);
  if (recent.length >= MAX_REQUESTS_PER_WINDOW) return false;
  recent.push(now);
  rateLimiter.set(socketId, recent);
  return true;
}

function clearTimer(room) {
  if (room && room.timerInterval) {
    clearInterval(room.timerInterval);
    room.timerInterval = null;
  }
}

function scheduleIdleDeletion(room) {
  if (room.status !== "waiting") return;
  const connectedCount = room.players.filter(p => !p.disconnected).length;
  if (connectedCount > 0) return; // Don't schedule if someone still connected
  if (room.idleTimer) return;     // Already scheduled

  room.idleTimer = setTimeout(() => {
    const stillRoom = rooms.get(room.code);
    if (!stillRoom) return;
    const active = stillRoom.players.filter(p => !p.disconnected).length;
    if (active === 0 && stillRoom.status === "waiting") {
      console.log(`🕒 Waiting room '${room.code}' idle timeout reached. Deleting room.`);
      cleanupRoom(room.code);
    } else {
      // Someone reconnected
      if (stillRoom.idleTimer) {
        clearTimeout(stillRoom.idleTimer);
        stillRoom.idleTimer = null;
      }
    }
  }, WAITING_ROOM_IDLE_TIMEOUT);
}

function cleanupRoom(roomCode) {
  const room = rooms.get(roomCode);
  if (!room) return;
  clearTimer(room);
  if (room.deletionTimer) {
    clearTimeout(room.deletionTimer);
    room.deletionTimer = null;
  }
  if (room.idleTimer) {
    clearTimeout(room.idleTimer);
    room.idleTimer = null;
  }
  room.players.forEach(p => {
    if (p.id) players.delete(p.id);
  });
  rooms.delete(roomCode);
  console.log(`🗑️ Room '${roomCode}' fully cleaned up.`);
}

// --- Socket Logic ---
io.on("connection", (socket) => {
  console.log("A new player connected:", socket.id);

  // Create Room
  socket.on("createRoom", (playerName) => {
    if (!checkRateLimit(socket.id)) return socket.emit("error", "Too many requests.");
    const sanitizedName = sanitizeName(playerName);
    if (!sanitizedName || sanitizedName.length < 2) return socket.emit("error", "Player name must be 2-20 chars.");
    if (players.has(socket.id)) return socket.emit("error", "You are already in a room.");

    const roomCode = generateRoomCode();
    const player = {
      id: socket.id,
      name: sanitizedName,
      score: 0,
      ready: false,
      finishedReviewing: false,
      disconnected: false
    };
    const room = {
      code: roomCode,
      host: socket.id,
      players: [player],
      status: "waiting",
      currentRound: 0,
      maxRounds: 5,
      currentLetter: null,
      timer: 60,
      answers: new Map(),
      timerInterval: null,
      letterChooserIndex: 0,
      submittedPlayers: new Set(),
      deletionTimer: null,
      idleTimer: null
    };
    rooms.set(roomCode, room);
    players.set(socket.id, { roomCode, name: sanitizedName });
    socket.join(roomCode);
    socket.emit("roomCreated", { roomCode, player });
    console.log(`✅ Room '${roomCode}' created by '${sanitizedName}'.`);
  });

  // Join / Rejoin Room
  socket.on("joinRoom", ({ roomCode, playerName }) => {
    if (!checkRateLimit(socket.id)) return socket.emit("error", "Too many requests.");
    const name = sanitizeName(playerName);
    const code = typeof roomCode === "string" ? roomCode.trim().toUpperCase() : "";
    if (!code) return socket.emit("error", "Invalid room code.");
    if (!name || name.length < 2) return socket.emit("error", "Player name must be 2-20 chars.");
    const room = rooms.get(code);
    if (!room) return socket.emit("error", "Room not found.");

    // Reconnection allowed regardless of status (waiting or in-game)
    const existingPlayer = room.players.find(p => p.name === name);
    if (existingPlayer) {
      console.log(`🔄 Player '${name}' reconnecting to room '${code}'.`);
      const oldId = existingPlayer.id;
      existingPlayer.id = socket.id;
      existingPlayer.disconnected = false;
      if (oldId) players.delete(oldId);
      players.set(socket.id, { roomCode: code, name });
      socket.join(code);
      // Cancel idle deletion if scheduled
      if (room.idleTimer) {
        clearTimeout(room.idleTimer);
        room.idleTimer = null;
      }
      socket.emit("joinedRoom", { roomCode: code, player: existingPlayer, players: room.players });
      socket.broadcast.to(code).emit("playerRejoined", { player: existingPlayer, players: room.players });
      return;
    }

    // New join only allowed while waiting
    if (room.status !== "waiting") return socket.emit("error", "The game has already started.");
    if (room.players.length >= MAX_PLAYERS_PER_ROOM) return socket.emit("error", "Room is full.");
    if (room.players.some(p => p.name === name)) return socket.emit("error", "Name already taken.");

    const newPlayer = {
      id: socket.id,
      name,
      score: 0,
      ready: false,
      finishedReviewing: false,
      disconnected: false
    };
    room.players.push(newPlayer);
    players.set(socket.id, { roomCode: code, name });
    socket.join(code);
    socket.emit("joinedRoom", { roomCode: code, player: newPlayer, players: room.players });
    socket.broadcast.to(code).emit("playerJoined", { player: newPlayer, players: room.players });
    // Cancel idle deletion if any (room is active again)
    if (room.idleTimer) {
      clearTimeout(room.idleTimer);
      room.idleTimer = null;
    }
  });

  // Player ready toggle (no auto-start)
  socket.on("playerReady", () => {
    if (!checkRateLimit(socket.id)) return;
    const validation = validatePlayerAndRoom(socket.id);
    if (!validation.isValid) return socket.emit("syncError", validation.message);
    const { room, player } = validation;
    if (room.status !== "waiting") return socket.emit("syncError", "Game already started.");

    player.ready = !player.ready;
    io.to(room.code).emit("playerReadyUpdate", { playerId: player.id, isReady: player.ready });

    // Inform room of readiness summary
    const activePlayers = room.players.filter(p => !p.disconnected);
    const readyCount = activePlayers.filter(p => p.ready).length;
    io.to(room.code).emit("roomReadyStatus", {
      readyCount,
      totalActive: activePlayers.length,
      allReady: readyCount === activePlayers.length && activePlayers.length >= MIN_PLAYERS_TO_START
    });
  });

  // Manual start request by host
  socket.on("startGameRequest", () => {
    if (!checkRateLimit(socket.id)) return;
    const validation = validatePlayerAndRoom(socket.id);
    if (!validation.isValid) return socket.emit("syncError", validation.message);
    const { room, player } = validation;
    if (room.status !== "waiting") return socket.emit("syncError", "Game already started.");
    if (room.host !== player.id) return socket.emit("syncError", "Only host can start the game.");

    const activePlayers = room.players.filter(p => !p.disconnected);
    if (activePlayers.length < MIN_PLAYERS_TO_START) return socket.emit("syncError", "Not enough players to start.");
    const allReady = activePlayers.every(p => p.ready);
    if (!allReady) return socket.emit("syncError", "All players must be ready before starting.");

    startGame(room.code);
  });

  // Letter selection
  socket.on("letterChosen", (letter) => {
    if (!checkRateLimit(socket.id)) return;
    const validation = validatePlayerAndRoom(socket.id);
    if (!validation.isValid) return socket.emit("syncError", validation.message);
    const { room, player } = validation;
    if (room.status !== "choosing") return socket.emit("syncError", "Not in choosing phase.");

    const chooser = room.players[room.letterChooserIndex % room.players.length];
    if (chooser.id !== player.id) return socket.emit("syncError", "Not your turn.");

    if (!isValidLetter(letter)) return socket.emit("syncError", "Invalid letter.");
    room.currentLetter = letter.toUpperCase();
    room.status = "playing";
    room.submittedPlayers.clear();

    io.to(room.code).emit("gameStarted", {
      letter: room.currentLetter,
      round: room.currentRound,
      maxRounds: room.maxRounds
    });
    startTimer(room.code);
  });

  // Submit answers
  socket.on("submitAnswers", (answers) => {
    if (!checkRateLimit(socket.id)) return;
    const validation = validatePlayerAndRoom(socket.id);
    if (!validation.isValid) return socket.emit("syncError", validation.message);
    const { room, player } = validation;
    if (room.status !== "playing") return socket.emit("syncError", "Not in playing phase.");
    if (room.submittedPlayers.has(player.id)) return socket.emit("syncError", "Already submitted.");

    const sanitizedAnswers = {};
    if (answers && typeof answers === "object") {
      CATEGORIES.forEach(cat => {
        if (answers[cat]) sanitizedAnswers[cat] = sanitizeInput(answers[cat]);
      });
    }
    room.answers.set(player.id, sanitizedAnswers);
    room.submittedPlayers.add(player.id);

    const activePlayers = room.players.filter(p => !p.disconnected);
    io.to(room.code).emit("playerSubmitted", { playerId: player.id });

    if (room.submittedPlayers.size === activePlayers.length) {
      endRound(room.code);
    }
  });

  // Review phase finish
  socket.on("finishedReviewing", () => {
    if (!checkRateLimit(socket.id)) return;
    const validation = validatePlayerAndRoom(socket.id);
    if (!validation.isValid) return socket.emit("syncError", validation.message);
    const { room, player } = validation;
    if (room.status !== "reviewing") return socket.emit("syncError", "Not in reviewing phase.");

    player.finishedReviewing = true;
    const activePlayers = room.players.filter(p => !p.disconnected);
    const allFinished = activePlayers.every(p => p.finishedReviewing);

    if (allFinished) {
      activePlayers.forEach(p => p.finishedReviewing = false);
      if (room.currentRound < room.maxRounds) {
        nextRound(room.code);
      } else {
        endGame(room.code);
      }
    }
  });

  // Disconnect / leave
  socket.on("disconnect", () => {
    handlePlayerLeave(socket.id);
    rateLimiter.delete(socket.id);
  });
  socket.on("leaveRoom", () => {
    handlePlayerLeave(socket.id);
  });
});

// --- Validation Helper ---
function validatePlayerAndRoom(socketId) {
  const playerData = players.get(socketId);
  if (!playerData) return { isValid: false, message: "Session expired." };
  const room = rooms.get(playerData.roomCode);
  if (!room) {
    players.delete(socketId);
    return { isValid: false, message: "Room no longer exists." };
  }
  const player = room.players.find(p => p.id === socketId);
  if (!player) {
    players.delete(socketId);
    return { isValid: false, message: "You are no longer in this room." };
  }
  return { isValid: true, room, player, playerData };
}

// --- Game Logic ---
function startGame(roomCode) {
  const room = rooms.get(roomCode);
  if (!room || room.status !== "waiting") return;
  console.log(`🚀 Starting game in room '${roomCode}'.`);
  room.status = "choosing";
  room.currentRound = 1;
  room.letterChooserIndex = 0;
  room.players.forEach(p => { p.score = 0; p.finishedReviewing = false; });
  io.to(roomCode).emit("gameStarting");
  chooseLetterPhase(roomCode);
}

function chooseLetterPhase(roomCode) {
  const room = rooms.get(roomCode);
  if (!room) return;
  clearTimer(room);
  room.answers.clear();
  room.submittedPlayers.clear();
  room.timer = 60;
  room.status = "choosing";
  const chooser = room.players[room.letterChooserIndex % room.players.length];
  io.to(roomCode).emit("newRoundPhase", {
    phase: "choosing",
    chooserName: chooser.name,
    chooserId: chooser.id,
    round: room.currentRound
  });
}

function startTimer(roomCode) {
  const room = rooms.get(roomCode);
  if (!room) return;
  clearTimer(room);
  room.timer = 60;
  room.timerInterval = setInterval(() => {
    room.timer--;
    io.to(roomCode).emit("timerUpdate", room.timer);
    if (room.timer <= 0) {
      clearTimer(room);
      endRound(roomCode);
    }
  }, 1000);
}

function endRound(roomCode) {
  const room = rooms.get(roomCode);
  if (!room || room.status === "reviewing" || room.status === "finished") return;
  room.status = "reviewing";
  clearTimer(room);
  room.players.forEach(p => {
    if (!room.answers.has(p.id) && !p.disconnected) {
      room.answers.set(p.id, {});
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
      if (answer) {
        const firstChar = answer.charAt(0).toUpperCase();
        if (firstChar === room.currentLetter) {
          if (!categoryAnswers.has(answer)) categoryAnswers.set(answer, []);
          categoryAnswers.get(answer).push(playerId);
        }
      }
    });
    categoryAnswers.forEach(playerIds => {
      if (playerIds.length === 1) {
        const pid = playerIds[0];
        roundScores.set(pid, roundScores.get(pid) + 10);
      } else {
        playerIds.forEach(pid => roundScores.set(pid, roundScores.get(pid) + 5));
      }
    });
  });

  roundScores.forEach((score, playerId) => {
    const player = room.players.find(p => p.id === playerId);
    if (player) player.score += score;
  });

  const allAnswers = Array.from(room.answers.entries()).map(([playerId, answers]) => ({
    playerId,
    playerName: room.players.find(p => p.id === playerId)?.name,
    answers
  }));

  io.to(roomCode).emit("scoresCalculated", {
    allAnswers,
    roundScores: Array.from(roundScores.entries()).map(([id, score]) => ({ playerId: id, score })),
    totalScores: room.players.map(p => ({ playerId: p.id, name: p.name, score: p.score }))
  });
}

function nextRound(roomCode) {
  const room = rooms.get(roomCode);
  if (!room) return;
  room.currentRound++;
  room.letterChooserIndex++;
  chooseLetterPhase(roomCode);
}

function endGame(roomCode) {
  const room = rooms.get(roomCode);
  if (!room || room.status === "finished") return;
  room.status = "finished";
  clearTimer(room);
  const sorted = [...room.players].sort((a, b) => b.score - a.score);
  io.to(roomCode).emit("gameEnded", {
    winner: sorted[0],
    rankings: sorted
  });
  room.deletionTimer = setTimeout(() => {
    cleanupRoom(roomCode);
  }, ROOM_EMPTY_GRACE_MS);
}

function handlePlayerLeave(socketId) {
  const playerData = players.get(socketId);
  if (!playerData) return;
  const { roomCode, name } = playerData;
  const room = rooms.get(roomCode);
  players.delete(socketId);
  if (!room) return;

  const player = room.players.find(p => p.id === socketId);
  if (!player) return;

  console.log(`👋 Player '${name}' (${socketId}) left room '${roomCode}'.`);

  // Mark disconnected instead of removing if still waiting
  if (room.status === "waiting") {
    player.disconnected = true;
    player.id = null; // release old socket id
    io.to(roomCode).emit("playerLeft", {
      playerId: socketId,
      playerName: name,
      players: room.players,
      newHostId: room.host
    });

    // If host disconnected, keep host assignment (they can reclaim on reconnect)
    const connectedCount = room.players.filter(p => !p.disconnected).length;
    if (connectedCount === 0) {
      scheduleIdleDeletion(room);
    }
    return;
  }

  // In-game: remove player entirely
  room.players = room.players.filter(p => p !== player);
  io.to(roomCode).emit("playerLeft", {
    playerId: socketId,
    playerName: name,
    players: room.players,
    newHostId: room.host
  });

  if (room.players.length === 0) {
    cleanupRoom(roomCode);
    return;
  }

  if (room.host === socketId) {
    room.host = room.players[0].id;
    console.log(`👑 '${room.players[0].name}' is the new host of room '${roomCode}'.`);
    io.to(roomCode).emit("hostChanged", { newHostId: room.host });
  }

  if (room.status === "playing") {
    const activePlayers = room.players.filter(p => !p.disconnected);
    const allSubmitted = activePlayers.every(p => room.submittedPlayers.has(p.id));
    if (allSubmitted && activePlayers.length > 0) endRound(roomCode);
  }

  if (room.status === "waiting") {
    const activeReady = room.players.filter(p => !p.disconnected).every(p => p.ready);
    const activeCount = room.players.filter(p => !p.disconnected).length;
    io.to(roomCode).emit("roomReadyStatus", {
      readyCount: room.players.filter(p => p.ready && !p.disconnected).length,
      totalActive: activeCount,
      allReady: activeReady && activeCount >= MIN_PLAYERS_TO_START
    });
  }
}

// Periodic cleanup (rate limiter pruning)
setInterval(() => {
  const now = Date.now();
  rateLimiter.forEach((requests, socketId) => {
    const recent = requests.filter(t => now - t < RATE_LIMIT_WINDOW);
    if (recent.length === 0) rateLimiter.delete(socketId);
    else rateLimiter.set(socketId, recent);
  });
}, 60000);

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
  console.log(`🎮 Server is running on port ${PORT}`);
  console.log(`🌐 Open in browser: http://localhost:${PORT}`);
});
