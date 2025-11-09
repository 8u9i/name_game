
const express = require("express");
const app = express();
const http = require("http").createServer(app);
const io = require("socket.io")(http);

// تقديم الملفات الثابتة
app.use(express.static("public"));

// تخزين الغرف واللاعبين
const rooms = new Map();
const players = new Map();

// دالة لتوليد رمز غرفة عشوائي
function generateRoomCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// دالة لتوليد حرف عشوائي
function generateRandomLetter() {
  const arabicLetters = [
    "ا",
    "ب",
    "ت",
    "ث",
    "ج",
    "ح",
    "خ",
    "د",
    "ذ",
    "ر",
    "ز",
    "س",
    "ش",
    "ص",
    "ض",
    "ط",
    "ظ",
    "ع",
    "غ",
    "ف",
    "ق",
    "ك",
    "ل",
    "م",
    "ن",
    "ه",
    "و",
    "ي",
  ];
  return arabicLetters[Math.floor(Math.random() * arabicLetters.length)];
}

// الاتصال بـ Socket.IO
io.on("connection", (socket) => {
  console.log("لاعب جديد متصل:", socket.id);

  // إنشاء غرفة جديدة
  socket.on("createRoom", (playerName) => {
    console.log(`🎮 محاولة إنشاء غرفة من: ${playerName} (${socket.id})`);

    const roomCode = generateRoomCode();
    const room = {
      code: roomCode,
      host: socket.id,
      players: [
        {
          id: socket.id,
          name: playerName,
          score: 0,
          ready: false,
        },
      ],
      status: "waiting", // waiting, playing, reviewing, finished
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

    socket.emit("roomCreated", {
      roomCode,
      player: room.players[0],
    });

    console.log(`✅ غرفة جديدة: ${roomCode} بواسطة ${playerName}`);
    console.log(`📊 عدد الغرف الحالية: ${rooms.size}`);
  });

  // الانضمام لغرفة موجودة
  socket.on("joinRoom", ({ roomCode, playerName }) => {
    console.log(`🚪 محاولة انضمام: ${playerName} للغرفة ${roomCode}`);
    console.log(`📊 الغرف المتاحة:`, Array.from(rooms.keys()));

    const room = rooms.get(roomCode);

    if (!room) {
      console.log(`❌ الغرفة ${roomCode} غير موجودة`);
      socket.emit("error", "الغرفة غير موجودة أو انتهت صلاحيتها");
      return;
    }

    if (room.status !== "waiting") {
      socket.emit("error", "اللعبة قد بدأت بالفعل");
      return;
    }

    if (room.players.length >= 6) {
      socket.emit("error", "الغرفة ممتلئة (6 لاعبين كحد أقصى)");
      return;
    }

    // التحقق إذا كان اللاعب موجود مسبقاً (إعادة اتصال)
    const existingPlayer = room.players.find((p) => p.name === playerName);
    if (existingPlayer) {
      // تحديث socket id
      existingPlayer.id = socket.id;
      players.set(socket.id, { roomCode, name: playerName });
      socket.join(roomCode);

      socket.emit("joinedRoom", { roomCode, player: existingPlayer });
      io.to(roomCode).emit("playerReconnected", {
        player: existingPlayer,
        players: room.players,
      });

      console.log(`♻️ ${playerName} أعاد الاتصال بالغرفة ${roomCode}`);
      return;
    }

    const player = {
      id: socket.id,
      name: playerName,
      score: 0,
      ready: false,
    };

    room.players.push(player);
    players.set(socket.id, { roomCode, name: playerName });
    socket.join(roomCode);

    socket.emit("joinedRoom", { roomCode, player });
    io.to(roomCode).emit("playerJoined", {
      player,
      players: room.players,
    });

    console.log(`✅ ${playerName} انضم للغرفة ${roomCode}`);
  });

  // اللاعب جاهز
  socket.on("playerReady", ({ roomCode }) => {
    const playerData = players.get(socket.id);
    if (!playerData) return;

    const room = rooms.get(roomCode || playerData.roomCode);
    if (!room) return;

    const player = room.players.find((p) => p.id === socket.id);
    if (player) {
      player.ready = true;
      io.to(room.code).emit("playerReadyUpdate", {
        playerId: socket.id,
        players: room.players,
      });

      console.log(`✅ ${player.name} أصبح جاهزاً في الغرفة ${room.code}`);

      // التحقق إذا كل اللاعبين جاهزين
      const allReady = room.players.every((p) => p.ready);
      if (allReady && room.players.length >= 2) {
        console.log(`🎮 بدء اللعبة في الغرفة ${room.code}`);
        startGame(room.code);
      }
    }
  });

  // بدء اللعبة
  function startGame(roomCode) {
    const room = rooms.get(roomCode);
    if (!room) return;

    room.status = "choosing";
    room.currentRound = 1;
    room.currentLetter = null;
    room.timer = 60;
    room.answers.clear();
    room.letterChooserIndex = 0;

    console.log(`🎲 بدء مرحلة اختيار الحرف في الغرفة ${roomCode}`);
    // الانتقال لصفحة اختيار الحرف
    chooseLetterPhase(roomCode);
  }

  // مرحلة اختيار الحرف
  function chooseLetterPhase(roomCode) {
    const room = rooms.get(roomCode);
    if (!room) return;

    // اختيار لاعب بالترتيب
    const chooserIndex = room.letterChooserIndex % room.players.length;
    const chooser = room.players[chooserIndex];

    console.log(`👉 دور ${chooser.name} لاختيار الحرف في الغرفة ${roomCode}`);

    // إخبار اللاعب المختار
    io.to(chooser.id).emit("yourTurnToChoose");

    // إخبار باقي اللاعبين بالانتظار
    room.players.forEach((player) => {
      if (player.id !== chooser.id) {
        io.to(player.id).emit("waitingForPlayerToChoose", {
          playerName: chooser.name,
        });
      }
    });
  }

  // عند اختيار الحرف
  socket.on("letterChosen", (letter) => {
    const playerData = players.get(socket.id);
    if (!playerData) return;

    const room = rooms.get(playerData.roomCode);
    if (!room || room.status !== "choosing") return;

    room.currentLetter = letter;
    room.status = "playing";

    console.log(`🔤 تم اختيار الحرف "${letter}" في الغرفة ${playerData.roomCode}`);

    // إخبار جميع اللاعبين بالحرف المختار
    io.to(playerData.roomCode).emit("letterSelected", {
      letter: letter,
      round: room.currentRound,
      maxRounds: room.maxRounds,
    });

    // بدء الجولة بعد ثانية
    setTimeout(() => {
      io.to(playerData.roomCode).emit("gameStarted", {
        letter: room.currentLetter,
        round: room.currentRound,
        maxRounds: room.maxRounds,
        timer: room.timer,
      });

      startTimer(playerData.roomCode);
    }, 1000);
  });

  // العد التنازلي
  function startTimer(roomCode) {
    const room = rooms.get(roomCode);
    if (!room) return;

    // إلغاء أي timer سابق
    if (room.timerInterval) {
      clearInterval(room.timerInterval);
    }

    const timerInterval = setInterval(() => {
      room.timer--;
      io.to(roomCode).emit("timerUpdate", room.timer);

      if (room.timer <= 0) {
        clearInterval(timerInterval);
        room.timerInterval = null;
        endRound(roomCode);
      }
    }, 1000);

    // حفظ الـ interval في الغرفة للإلغاء عند الحاجة
    room.timerInterval = timerInterval;
  }

  // طلب بيانات اللاعبين
  socket.on("requestPlayersData", () => {
    const playerData = players.get(socket.id);
    if (!playerData) return;

    const room = rooms.get(playerData.roomCode);
    if (!room) return;

    const playersWithCurrentFlag = room.players.map((p) => ({
      ...p,
      isCurrentPlayer: p.id === socket.id,
    }));

    socket.emit("playersData", {
      players: playersWithCurrentFlag,
    });
  });

  // استلام إجابات اللاعب
  socket.on("submitAnswers", (answers) => {
    const playerData = players.get(socket.id);
    if (!playerData) return;

    const room = rooms.get(playerData.roomCode);
    if (!room || room.status !== "playing") return;

    room.answers.set(socket.id, {
      playerName: playerData.name,
      answers: answers,
      votes: new Map(),
    });

    console.log(`📝 ${playerData.name} قدم إجاباته (${room.answers.size}/${room.players.length})`);

    io.to(playerData.roomCode).emit("playerSubmitted", {
      playerId: socket.id,
      playerName: playerData.name,
      totalSubmitted: room.answers.size,
      totalPlayers: room.players.length,
    });

    // إذا كل اللاعبين أرسلوا إجاباتهم
    if (room.answers.size === room.players.length) {
      if (room.timerInterval) {
        clearInterval(room.timerInterval);
        room.timerInterval = null;
      }
      endRound(playerData.roomCode);
    }
  });

  // انتهاء الجولة
  function endRound(roomCode) {
    const room = rooms.get(roomCode);
    if (!room) return;

    room.status = "reviewing";

    console.log(`⏰ انتهت الجولة ${room.currentRound} في الغرفة ${roomCode}`);

    // تحويل answers Map إلى array
    const answersArray = Array.from(room.answers.entries()).map(
      ([playerId, data]) => ({
        playerId,
        playerName: data.playerName,
        answers: data.answers,
      })
    );

    io.to(roomCode).emit("roundEnded", {
      answers: answersArray,
      letter: room.currentLetter,
    });
  }

  // التصويت على الإجابات
  socket.on("voteAnswers", ({ playerId, votes }) => {
    const playerData = players.get(socket.id);
    if (!playerData) return;

    const room = rooms.get(playerData.roomCode);
    if (!room || room.status !== "reviewing") return;

    const targetAnswers = room.answers.get(playerId);
    if (!targetAnswers) return;

    targetAnswers.votes.set(socket.id, votes);

    console.log(`🗳️ ${playerData.name} صوّت على إجابات اللاعب ${playerId}`);

    // التحقق إذا كل اللاعبين صوتوا على جميع الإجابات
    let allVoted = true;
    room.answers.forEach((answerData, answerPlayerId) => {
      const requiredVotes = room.players.length - 1; // كل اللاعبين ماعدا صاحب الإجابة
      if (answerData.votes.size < requiredVotes) {
        allVoted = false;
      }
    });

    if (allVoted) {
      console.log(`✅ جميع اللاعبين صوّتوا، حساب النقاط...`);
      calculateScores(playerData.roomCode);
    }
  });

  // حساب النقاط
  function calculateScores(roomCode) {
    const room = rooms.get(roomCode);
    if (!room) return;

    const categories = ["name", "plant", "animal", "thing", "country"];
    const scores = new Map();

    // حساب نقاط كل لاعب
    room.answers.forEach((data, playerId) => {
      let playerScore = 0;

      categories.forEach((category) => {
        const answer = data.answers[category];
        if (!answer || answer.trim() === "") return;

        // عد الأصوات الموافقة
        let approveCount = 0;
        data.votes.forEach((vote) => {
          if (vote[category] === true) approveCount++;
        });

        const totalVoters = data.votes.size;
        // إذا أكثر من 50% وافقوا
        if (totalVoters > 0 && approveCount > totalVoters / 2) {
          playerScore += 10;
        }
      });

      scores.set(playerId, playerScore);

      // تحديث النقاط الكلية
      const player = room.players.find((p) => p.id === playerId);
      if (player) {
        player.score += playerScore;
      }
    });

    console.log(`📊 النقاط:`, Array.from(scores.entries()));

    io.to(roomCode).emit("scoresCalculated", {
      roundScores: Array.from(scores.entries()).map(([id, score]) => ({
        playerId: id,
        score,
      })),
      totalScores: room.players.map((p) => ({
        playerId: p.id,
        name: p.name,
        score: p.score,
      })),
    });

    // الانتقال للجولة التالية أو إنهاء اللعبة
    setTimeout(() => {
      if (room.currentRound < room.maxRounds) {
        nextRound(roomCode);
      } else {
        endGame(roomCode);
      }
    }, 5000);
  }

  // الجولة التالية
  function nextRound(roomCode) {
    const room = rooms.get(roomCode);
    if (!room) return;

    room.currentRound++;
    room.currentLetter = null;
    room.timer = 60;
    room.answers.clear();
    room.status = "choosing";
    room.letterChooserIndex++;

    console.log(`➡️ الانتقال للجولة ${room.currentRound} في الغرفة ${roomCode}`);

    // العودة لمرحلة اختيار الحرف
    chooseLetterPhase(roomCode);
  }

  // إنهاء اللعبة
  function endGame(roomCode) {
    const room = rooms.get(roomCode);
    if (!room) return;

    room.status = "finished";

    // ترتيب اللاعبين حسب النقاط
    const sortedPlayers = [...room.players].sort((a, b) => b.score - a.score);

    console.log(`🏆 انتهت اللعبة في الغرفة ${roomCode}، الفائز: ${sortedPlayers[0].name}`);

    io.to(roomCode).emit("gameEnded", {
      winner: sortedPlayers[0],
      rankings: sortedPlayers,
    });
  }

  // مغادرة الغرفة
  socket.on("leaveRoom", ({ roomCode }) => {
    handlePlayerLeave(socket.id, roomCode);
  });

  // دالة مساعدة للتعامل مع مغادرة اللاعب
  function handlePlayerLeave(socketId, roomCode) {
    const playerData = players.get(socketId);
    if (!playerData && !roomCode) return;

    const targetRoomCode = roomCode || playerData.roomCode;
    const room = rooms.get(targetRoomCode);
    if (!room) return;

    // إزالة اللاعب من الغرفة
    const playerName = playerData ? playerData.name : "Unknown";
    room.players = room.players.filter((p) => p.id !== socketId);
    players.delete(socketId);

    console.log(`👋 ${playerName} غادر الغرفة ${targetRoomCode}`);

    if (room.players.length === 0) {
      // إبقاء الغرفة لمدة 5 دقائق قبل الحذف
      console.log(`⏰ الغرفة ${targetRoomCode} فارغة، سيتم حذفها بعد 5 دقائق`);

      setTimeout(() => {
        const currentRoom = rooms.get(targetRoomCode);
        if (currentRoom && currentRoom.players.length === 0) {
          if (currentRoom.timerInterval) {
            clearInterval(currentRoom.timerInterval);
          }
          rooms.delete(targetRoomCode);
          console.log(`🗑️ تم حذف الغرفة ${targetRoomCode} (فارغة لمدة 5 دقائق)`);
        }
      }, 5 * 60 * 1000);
    } else {
      // إذا كان المضيف، جعل لاعب آخر مضيف
      if (room.host === socketId) {
        room.host = room.players[0].id;
        console.log(`👑 ${room.players[0].name} أصبح المضيف الجديد`);
      }

      io.to(targetRoomCode).emit("playerLeft", {
        playerId: socketId,
        playerName: playerName,
        players: room.players,
      });
    }
  }

  // اللاعب انقطع عنه الاتصال
  socket.on("disconnect", () => {
    console.log(`🔌 انقطع الاتصال: ${socket.id}`);
    handlePlayerLeave(socket.id);
  });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
  console.log(`🎮 السيرفر يعمل على المنفذ ${PORT}`);
  console.log(`🌐 افتح المتصفح على: http://localhost:${PORT}`);
});
