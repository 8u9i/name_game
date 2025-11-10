
// الاتصال بالسيرفر
const socket = io();

// Constants
const RATE_LIMIT_DELAY = 1000;
const AUDIO_VOLUME = 0.3;

// الحصول على رمز الغرفة من URL
const urlParams = new URLSearchParams(window.location.search);
const roomCode = urlParams.get("room");

if (!roomCode) {
  window.location.href = "/";
}

// عناصر الصفحة
const roomCodeDisplay = document.getElementById("roomCodeDisplay");
const copyCodeBtn = document.getElementById("copyCodeBtn");
const playersList = document.getElementById("playersList");
const playerCount = document.getElementById("playerCount");
const readyBtn = document.getElementById("readyBtn");
const waitingMessage = document.getElementById("waitingMessage");
const leaveRoomBtn = document.getElementById("leaveRoomBtn");

// البيانات المحلية
let isReady = false;
let players = [];
let lastRequestTime = 0;
let isSocketConnected = false;
let audioElement = null; // Reuse audio element to prevent memory leak

// Track socket connection
socket.on('connect', () => {
  isSocketConnected = true;
  console.log('Socket connected');
  updateWaitingMessage('متصل بالسيرفر');
});

socket.on('disconnect', () => {
  isSocketConnected = false;
  console.log('Socket disconnected');
  updateWaitingMessage('فقد الاتصال بالسيرفر... جاري إعادة الاتصال...');
});

socket.on('error', (message) => {
  showError(message || 'حدث خطأ');
});

socket.on('syncError', (message) => {
  showError(message || 'خطأ في المزامنة');
});

// Utility functions
function showError(message) {
  const errorDiv = document.createElement('div');
  errorDiv.className = 'fixed top-4 left-1/2 transform -translate-x-1/2 bg-red-500 text-white px-6 py-3 rounded-lg shadow-lg z-50';
  errorDiv.textContent = message;
  document.body.appendChild(errorDiv);
  
  setTimeout(() => {
    errorDiv.remove();
  }, 3000);
}

function checkRateLimit() {
  const now = Date.now();
  if (now - lastRequestTime < RATE_LIMIT_DELAY) {
    showError('يرجى الانتظار قبل المحاولة مرة أخرى');
    return false;
  }
  lastRequestTime = now;
  return true;
}

function updateWaitingMessage(message) {
  if (waitingMessage) {
    waitingMessage.textContent = message;
  }
}

function playJoinSound() {
  try {
    // Reuse audio element to prevent memory leak
    if (!audioElement) {
      audioElement = new Audio(
        "data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBSuFzPLZjToJHm7A7+OZUA0PVKzn77FgGwU7k9r0yHkpBSh+zPLajToJHm7A7+OZUA0PVKzn77FgGwU7k9r0yHkpBSh+zPLajToJHm7A7+OZUA0PVKzn77FgGwU7k9r0yHkpBSh+zPLajToJHm7A7+OZUA0PVKzn77FgGwU7k9r0yHkpBSh+zPLajToJHm7A7+OZUA0PVKzn77FgGwU7k9r0yHkpBSh+zPLajToJHm7A7+OZUA0PVKzn77FgGwU7k9r0yHkpBSh+zPLajToJHm7A7+OZUA0PVKzn77FgGwU7k9r0yHkpBSh+zPLajToJHm7A7+OZUA0PVKzn77FgGwU7k9r0yHkpBSh+zPLajToJHm7A7+OZUA0PVKzn77FgGwU7k9r0yHkpBSh+zPLajToJHm7A7+OZUA0PVKzn77FgGwU7k9r0yHkpBSh+zPLajToJHm7A7+OZUA0PVKzn77FgGwU7k9r0yHkpBSh+zPLajToJHm7A7+OZUA0PVKzn77FgGwU7k9r0yHkpBSh+zPLajToJHm7A7+OZUA0PVKzn77FgGwU7k9r0yHkpBSh+zPLajToJHm7A7+OZUA0PVKzn77FgGwU7k9r0yHkpBSh+"
      );
      audioElement.volume = AUDIO_VOLUME;
    }
    audioElement.currentTime = 0;
    audioElement.play().catch(err => console.log("Audio play failed:", err));
  } catch (error) {
    console.log("Audio creation failed:", error);
  }
}

// عرض رمز الغرفة
roomCodeDisplay.textContent = roomCode;

// نسخ رمز الغرفة
copyCodeBtn.addEventListener("click", () => {
  navigator.clipboard.writeText(roomCode).then(() => {
    const originalHTML = copyCodeBtn.innerHTML;
    copyCodeBtn.innerHTML =
      '<span class="material-symbols-outlined text-2xl text-green-500">check</span>';
    setTimeout(() => {
      copyCodeBtn.innerHTML = originalHTML;
    }, 2000);
  });
});

// زر الاستعداد
readyBtn.addEventListener("click", () => {
  try {
    if (isReady) return;

    if (!isSocketConnected) {
      showError('لا يوجد اتصال بالسيرفر');
      return;
    }

    if (!checkRateLimit()) {
      return;
    }

    isReady = true;
    readyBtn.classList.remove("bg-primary");
    readyBtn.classList.add("bg-green-500");
    readyBtn.innerHTML = '<span class="truncate">✓ جاهز</span>';
    readyBtn.disabled = true;

    // Fixed: Server doesn't expect roomCode parameter for playerReady
    socket.emit("playerReady");
  } catch (error) {
    console.error('Error in ready button:', error);
    showError('حدث خطأ عند الاستعداد');
    isReady = false;
    readyBtn.disabled = false;
  }
});

// تحديث قائمة اللاعبين
function updatePlayersList(playersList_data) {
  try {
    if (!playersList_data || !Array.isArray(playersList_data)) {
      console.error('Invalid players data:', playersList_data);
      return;
    }

    players = playersList_data;
    playerCount.textContent = players.length;

    playersList.innerHTML = "";

    players.forEach((player) => {
      if (!player || !player.name) {
        console.warn('Invalid player data:', player);
        return;
      }

      const playerDiv = document.createElement("div");
      playerDiv.className =
        "flex items-center justify-between p-3 bg-background-light dark:bg-background-dark rounded-lg";

      const nameDiv = document.createElement("div");
      nameDiv.className = "flex items-center gap-2";

      const nameSpan = document.createElement("span");
      nameSpan.className = "font-bold";
      nameSpan.textContent = player.name;

      nameDiv.appendChild(nameSpan);

      const statusDiv = document.createElement("div");
      if (player.ready) {
        statusDiv.innerHTML =
          '<span class="text-green-500 font-bold">✓ جاهز</span>';
      } else {
        statusDiv.innerHTML =
          '<span class="text-muted-light dark:text-muted-dark">في الانتظار...</span>';
      }

      playerDiv.appendChild(nameDiv);
      playerDiv.appendChild(statusDiv);
      playersList.appendChild(playerDiv);
    });

    // تحديث رسالة الانتظار
    const readyCount = players.filter((p) => p && p.ready).length;
    if (readyCount === players.length && players.length >= 2) {
      updateWaitingMessage("جميع اللاعبين جاهزون! اللعبة ستبدأ قريباً...");
      waitingMessage.classList.add("text-green-500", "font-bold");
    } else if (players.length < 2) {
      updateWaitingMessage("في انتظار لاعب آخر على الأقل...");
      waitingMessage.classList.remove("text-green-500", "font-bold");
    } else {
      updateWaitingMessage(`${readyCount}/${players.length} جاهزون`);
      waitingMessage.classList.remove("text-green-500", "font-bold");
    }
  } catch (error) {
    console.error('Error updating players list:', error);
    showError('خطأ في تحديث قائمة اللاعبين');
  }
}

// عند الانضمام بنجاح
socket.on("joinedRoom", (data) => {
  try {
    if (data && data.players) {
      updatePlayersList(data.players);
    }
  } catch (error) {
    console.error('Error handling joinedRoom:', error);
  }
});

// عند انضمام لاعب جديد
socket.on("playerJoined", (data) => {
  try {
    if (data && data.players) {
      updatePlayersList(data.players);
      playJoinSound();
    }
  } catch (error) {
    console.error('Error handling playerJoined:', error);
  }
});

// عند تحديث حالة الاستعداد
socket.on("playerReadyUpdate", (data) => {
  try {
    if (!data) return;
    
    // Update individual player ready state
    const player = players.find(p => p.id === data.playerId);
    if (player) {
      player.ready = data.isReady;
      updatePlayersList(players);
    }
  } catch (error) {
    console.error('Error handling playerReadyUpdate:', error);
  }
});

// Handle game starting event from server
socket.on("gameStarting", () => {
  try {
    updateWaitingMessage("اللعبة تبدأ الآن...");
  } catch (error) {
    console.error('Error handling gameStarting:', error);
  }
});

// Handle new round phase (choosing letter)
socket.on("newRoundPhase", (data) => {
  try {
    if (!data) return;
    
    if (data.phase === 'choosing') {
      window.location.href = `choose-letter.html?room=${roomCode}`;
    }
  } catch (error) {
    console.error('Error handling newRoundPhase:', error);
  }
});

// مغادرة الغرفة
leaveRoomBtn.addEventListener("click", () => {
  if (confirm("هل أنت متأكد من مغادرة الغرفة؟")) {
    try {
      socket.emit("leaveRoom");
    } catch (error) {
      console.error('Error leaving room:', error);
    }
    window.location.href = "/";
  }
});

// عند مغادرة لاعب
socket.on("playerLeft", (data) => {
  try {
    if (data && data.players) {
      updatePlayersList(data.players);
    }
  } catch (error) {
    console.error('Error handling playerLeft:', error);
  }
});

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
  try {
    if (audioElement) {
      audioElement.pause();
      audioElement = null;
    }
  } catch (error) {
    console.error('Error cleaning up:', error);
  }
});
