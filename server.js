const express = require("express");
const app = express();
const http = require("http").createServer(app);
const io = require("socket.io")(http);

// Serve static files from the 'public' directory
app.use(express.static("public"));

// In-memory storage for rooms and players
const rooms = new Map();
const players = new Map();

// --- Helper Functions ---

function generateRoomCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// --- Socket.IO Connection Logic ---

io.on("connection", (socket) => {
  console.log("A new player connected:", socket.id);

  // === ROOM CREATION ===
  socket.on("createRoom", (playerName) => {
    console.log(`🎮 Player '${playerName}' (${socket.id}) is creating a room.`);

    const roomCode = generateRoomCode();
    const newPlayer = {
      id: socket.id,
      name: playerName,
      score: 0,
      ready: false,
    };
    
    const room = {
      code: roomCode,
      host: socket.id,
      players: [newPlayer],
      status: "waiting", // waiting, choosing, playing, reviewing, finished
      currentRound: 0,
      maxRounds: 5,
      currentLetter: null,
      timer: 60,
      answers: new Map(),
      timerInterval: null,
      letterChooserIndex: 0,
    };

    rooms.set(roomCode, room);
    players.set(socket.id, { roomCode, name: playerName });
    socket.join(roomCode);

    socket.emit("roomCreated", { roomCode, player: newPlayer });
    console.log(`✅ Room '${roomCode}' created by '${playerName}'. Total rooms: ${rooms.size}`);
  });

  // === JOINING A ROOM ===
  socket.on("joinRoom", ({ roomCode, playerName }) => {
    console.log(`🚪 Player '${playerName}' is trying to join room '${roomCode}'.`);

    const room = rooms.get(roomCode);

    // --- Validation Checks ---
    if (!room) {
      return socket.emit("error", "Room not found.");
    }
    if (room.status !== "waiting") {
      return socket.emit("error", "The game has already started.");
    }
    if (room.players.length >= 6) {
      return socket.emit("error", "The room is full.");
    }

    // [CRITICAL FIX] Prevent players with the same name from joining the same room.
    // This was the source of the original bug.
    const isNameTaken = room.players.some((p) => p.name === playerName);
    if (isNameTaken) {
      return socket.emit("error", "This name is already taken in this room.");
    }

    // --- Add Player to Room ---
    const newPlayer = {
      id: socket.id,
      name: playerName,
      score: 0,
      ready: false,
    };

    room.players.push(newPlayer);
    players.set(socket.id, { roomCode, name: playerName });
    socket.join(roomCode);

    // Let the new player know they joined successfully and give them the full player list.
    socket.emit("joinedRoom", { roomCode, player: newPlayer, players: room.players });

    // Let everyone else in the room know a new player has joined.
    socket.broadcast.to(roomCode).emit("playerJoined", { player: newPlayer, players: room.players });

    console.log(`✅ '${playerName}' joined room '${roomCode}'. Players: ${room.players.length}`);
  });

  // === PLAYER READY STATE ===
  socket.on("playerReady", () => {
    const playerData = players.get(socket.id);
    if (!playerData) return;
    const room = rooms.get(playerData.roomCode);
    if (!room) return;

    const player = room.players.find((p) => p.id === socket.id);
    if (player) {
      player.ready = !player.ready; // Toggle ready state
      io.to(room.code).emit("playerReadyUpdate", {
        playerId: socket.id,
        isReady: player.ready
      });

      console.log(`👍 '${player.name}' is now ${player.ready ? 'ready' : 'not ready'}.`);

      // Check if the game can start
      const allReady = room.players.every((p) => p.ready);
      if (allReady && room.players.length >= 2) {
        startGame(room.code);
      }
    }
  });

  // === LETTER SELECTION ===
  socket.on("letterChosen", (letter) => {
    const playerData = players.get(socket.id);
    if (!playerData) return;
    const room = rooms.get(playerData.roomCode);
    if (!room || room.status !== "choosing") return;

    // Security check: ensure the correct player is choosing
    const chooser = room.players[room.letterChooserIndex % room.players.length];
    if (socket.id !== chooser.id) {
        return console.log(`⚠️ Security: '${playerData.name}' tried to choose a letter out of turn.`);
    }

    room.currentLetter = letter;
    room.status = "playing";
    console.log(`🔤 Letter '${letter}' was chosen for room '${room.code}'.`);

    io.to(room.code).emit("gameStarted", {
      letter: room.currentLetter,
      round: room.currentRound,
      maxRounds: room.maxRounds,
    });

    startTimer(room.code);
  });

  // === ANSWER SUBMISSION ===
  socket.on("submitAnswers", (answers) => {
    const playerData = players.get(socket.id);
    if (!playerData) return;
    const room = rooms.get(playerData.roomCode);
    if (!room || room.status !== "playing") return;

    room.answers.set(socket.id, answers);
    console.log(`📝 '${playerData.name}' submitted answers. (${room.answers.size}/${room.players.length})`);

    io.to(room.code).emit("playerSubmitted", { playerId: socket.id });

    // If everyone has submitted, end the round early.
    if (room.answers.size === room.players.length) {
      endRound(room.code);
    }
  });
  
  // === PLAYER FINISHED REVIEWING SCORES ===
  socket.on('finishedReviewing', () => {
    const playerData = players.get(socket.id);
    if (!playerData) return;
    const room = rooms.get(playerData.roomCode);
    if (!room || room.status !== "reviewing") return;

    const player = room.players.find(p => p.id === socket.id);
    if (player) {
      player.finishedReviewing = true;
    }

    const allFinished = room.players.every(p => p.finishedReviewing);
    if (allFinished) {
      console.log(`✅ All players in '${room.code}' are ready for the next round.`);
      // Reset the flag for the next round
      room.players.forEach(p => p.finishedReviewing = false);
      
      // Proceed to the next phase
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
  });

  socket.on("leaveRoom", () => {
    handlePlayerLeave(socket.id);
  });
});

// --- Game Logic Functions ---

function startGame(roomCode) {
  const room = rooms.get(roomCode);
  if (!room || room.status !== "waiting") return;

  console.log(`🚀 Starting game in room '${roomCode}'!`);
  room.status = "choosing";
  room.currentRound = 1;
  room.letterChooserIndex = 0;

  // Reset scores for a new game
  room.players.forEach(p => p.score = 0);
  
  io.to(roomCode).emit('gameStarting');
  chooseLetterPhase(roomCode);
}

function chooseLetterPhase(roomCode) {
  const room = rooms.get(roomCode);
  if (!room) return;

  // Clear previous round data
  room.answers.clear();
  room.timer = 60;
  if(room.timerInterval) clearInterval(room.timerInterval);

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

  if (room.timerInterval) clearInterval(room.timerInterval);
  room.timer = 60; // Reset timer

  room.timerInterval = setInterval(() => {
    room.timer--;
    io.to(roomCode).emit("timerUpdate", room.timer);

    if (room.timer <= 0) {
      endRound(roomCode);
    }
  }, 1000);
}

function endRound(roomCode) {
  const room = rooms.get(roomCode);
  // Prevent this function from running multiple times for the same round
  if (!room || room.status === 'reviewing') return; 

  console.log(`⏰ Round ${room.currentRound} ended in room '${roomCode}'.`);
  room.status = "reviewing";
  if (room.timerInterval) {
    clearInterval(room.timerInterval);
    room.timerInterval = null;
  }
  
  // Ensure every player has an entry in the answers map, even if empty.
  room.players.forEach(player => {
    if (!room.answers.has(player.id)) {
      room.answers.set(player.id, {}); // Empty answers
    }
  });

  calculateScores(roomCode);
}

function calculateScores(roomCode) {
  const room = rooms.get(roomCode);
  if (!room) return;

  const categories = ["name", "plant", "animal", "thing", "country"];
  const roundScores = new Map();
  room.players.forEach(p => roundScores.set(p.id, 0)); // Initialize round scores

  categories.forEach(category => {
    const categoryAnswers = new Map();
    // Collect all answers for the current category and count who submitted them
    room.answers.forEach((answers, playerId) => {
      const answer = answers[category]?.trim().toLowerCase();
      if (answer) {
        if (!categoryAnswers.has(answer)) {
          categoryAnswers.set(answer, []);
        }
        categoryAnswers.get(answer).push(playerId);
      }
    });

    // Award points based on uniqueness
    categoryAnswers.forEach((playerIds, answer) => {
      if (playerIds.length === 1) { // Unique answer
        const pid = playerIds[0];
        roundScores.set(pid, roundScores.get(pid) + 10);
      } else { // Shared answer
        playerIds.forEach(pid => {
          roundScores.set(pid, roundScores.get(pid) + 5);
        });
      }
    });
  });

  // Update total scores
  roundScores.forEach((score, playerId) => {
    const player = room.players.find(p => p.id === playerId);
    if (player) {
      player.score += score;
    }
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
  if (!room) return;

  room.status = "finished";
  const sortedPlayers = [...room.players].sort((a, b) => b.score - a.score);
  
  console.log(`🏆 Game ended in room '${roomCode}'. Winner: ${sortedPlayers[0]?.name}`);
  io.to(roomCode).emit("gameEnded", {
    winner: sortedPlayers[0],
    rankings: sortedPlayers,
  });

  // Clean up the room after a delay
  setTimeout(() => {
    if (rooms.has(roomCode)) {
      if(rooms.get(roomCode)?.timerInterval) clearInterval(rooms.get(roomCode).timerInterval);
      rooms.delete(roomCode);
      console.log(`🗑️ Room '${roomCode}' has been deleted after game ended.`);
    }
  }, 30 * 1000); // 30 seconds
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

  if (room.players.length === 0) {
    console.log(`🗑️ Room '${roomCode}' is empty and is being deleted.`);
    if (room.timerInterval) clearInterval(room.timerInterval);
    rooms.delete(roomCode);
  } else {
    // If the host left, assign a new host
    if (room.host === socketId) {
      room.host = room.players[0].id;
      console.log(`👑 '${room.players[0].name}' is the new host of room '${roomCode}'.`);
    }

    // Inform remaining players
    io.to(roomCode).emit("playerLeft", {
      playerId: socketId,
      playerName: name,
      players: room.players,
      newHostId: room.host,
    });
    
    // If a game was in progress, check if conditions are met to end the round
    if (room.status === "playing" && room.answers.size === room.players.length) {
        endRound(roomCode);
    }
  }
}

// --- Server Startup ---

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
  console.log(`🎮 Server is running on port ${PORT}`);
  console.log(`🌐 Open in browser: http://localhost:${PORT}`);
});
