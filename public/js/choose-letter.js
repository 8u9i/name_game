const socket = io();

// Constants
const RATE_LIMIT_DELAY = 1000; // 1 second between requests
const MAX_PLAYER_NAME_LENGTH = 20;

// English letters A-Z (matching server expectations)
const englishLetters = [
  { letter: "A", enabled: true },
  { letter: "B", enabled: true },
  { letter: "C", enabled: true },
  { letter: "D", enabled: true },
  { letter: "E", enabled: true },
  { letter: "F", enabled: true },
  { letter: "G", enabled: true },
  { letter: "H", enabled: true },
  { letter: "I", enabled: true },
  { letter: "J", enabled: true },
  { letter: "K", enabled: true },
  { letter: "L", enabled: true },
  { letter: "M", enabled: true },
  { letter: "N", enabled: true },
  { letter: "O", enabled: true },
  { letter: "P", enabled: true },
  { letter: "Q", enabled: true },
  { letter: "R", enabled: true },
  { letter: "S", enabled: true },
  { letter: "T", enabled: true },
  { letter: "U", enabled: true },
  { letter: "V", enabled: true },
  { letter: "W", enabled: true },
  { letter: "X", enabled: true },
  { letter: "Y", enabled: true },
  { letter: "Z", enabled: true },
];

// عناصر الصفحة
const turnMessage = document.getElementById("turnMessage");
const waitingMessage = document.getElementById("waitingMessage");
const lettersGrid = document.getElementById("lettersGrid");
const chooserName = document.getElementById("chooserName");
const leaveBtn = document.getElementById("leaveBtn");

// البيانات المحلية
let isMyTurn = false;
let currentChooser = null;
let lastRequestTime = 0;
let isSocketConnected = false;
let letterSelectionTimeout = null;

// Track socket connection
socket.on('connect', () => {
  isSocketConnected = true;
  console.log('Socket connected');
});

socket.on('disconnect', () => {
  isSocketConnected = false;
  console.log('Socket disconnected');
  showError('فقد الاتصال بالسيرفر. جاري إعادة الاتصال...');
});

socket.on('error', (message) => {
  showError(message || 'حدث خطأ');
});

socket.on('syncError', (message) => {
  showError(message || 'خطأ في المزامنة');
});

// Show error message
function showError(message) {
  const errorDiv = document.createElement('div');
  errorDiv.className = 'fixed top-4 left-1/2 transform -translate-x-1/2 bg-red-500 text-white px-6 py-3 rounded-lg shadow-lg z-50';
  errorDiv.textContent = message;
  document.body.appendChild(errorDiv);
  
  setTimeout(() => {
    errorDiv.remove();
  }, 3000);
}

// Rate limiting check
function checkRateLimit() {
  const now = Date.now();
  if (now - lastRequestTime < RATE_LIMIT_DELAY) {
    showError('يرجى الانتظار قبل المحاولة مرة أخرى');
    return false;
  }
  lastRequestTime = now;
  return true;
}

// Validate letter
function isValidLetter(letter) {
  return typeof letter === 'string' && /^[A-Z]$/.test(letter);
}

// رسم شبكة الحروف
function renderLetters() {
  try {
    lettersGrid.innerHTML = "";

    englishLetters.forEach(({ letter, enabled }) => {
      const button = document.createElement("button");
      button.className = enabled
        ? "flex flex-1 flex-col gap-2 rounded-lg bg-white dark:bg-background-dark dark:hover:bg-white/10 border border-gray-200 dark:border-white/20 p-4 items-center justify-center aspect-square transition-all hover:bg-primary/10 hover:border-primary/50 hover:shadow-lg hover:-translate-y-1"
        : "flex flex-1 flex-col gap-2 rounded-lg bg-gray-200 dark:bg-white/5 border border-gray-300 dark:border-white/10 p-4 items-center justify-center aspect-square cursor-not-allowed opacity-50";

      const letterText = document.createElement("h2");
      letterText.className = enabled
        ? "text-2xl sm:text-3xl font-bold leading-tight text-gray-800 dark:text-gray-200"
        : "text-2xl sm:text-3xl font-bold leading-tight text-gray-500 dark:text-gray-600";
      letterText.textContent = letter;

      button.appendChild(letterText);

      if (enabled) {
        button.addEventListener("click", () => selectLetter(letter));
      } else {
        button.disabled = true;
      }

      lettersGrid.appendChild(button);
    });
  } catch (error) {
    console.error('Error rendering letters:', error);
    showError('خطأ في عرض الحروف');
  }
}

// اختيار حرف
function selectLetter(letter) {
  try {
    if (!isMyTurn) {
      showError("ليس دورك!");
      return;
    }

    if (!isSocketConnected) {
      showError("لا يوجد اتصال بالسيرفر");
      return;
    }

    if (!checkRateLimit()) {
      return;
    }

    if (!isValidLetter(letter)) {
      showError("حرف غير صالح");
      return;
    }

    // إرسال الحرف المختار للسيرفر
    socket.emit("letterChosen", letter);

    // تعطيل الأزرار
    disableAllButtons();

    const messageEl = turnMessage.querySelector("p");
    if (messageEl) {
      messageEl.textContent = `اخترت الحرف "${letter}"`;
    }
  } catch (error) {
    console.error('Error selecting letter:', error);
    showError('حدث خطأ عند اختيار الحرف');
  }
}

// تعطيل جميع الأزرار
function disableAllButtons() {
  const buttons = lettersGrid.querySelectorAll("button");
  buttons.forEach((btn) => {
    btn.disabled = true;
    btn.classList.add("cursor-not-allowed", "opacity-50");
  });
}

// عرض دور اللاعب
function showMyTurn() {
  isMyTurn = true;
  turnMessage.classList.remove("hidden");
  waitingMessage.classList.add("hidden");
  lettersGrid.classList.remove("hidden");
  renderLetters();
}

// عرض انتظار لاعب آخر
function showWaitingForPlayer(playerName) {
  isMyTurn = false;
  turnMessage.classList.add("hidden");
  waitingMessage.classList.remove("hidden");
  lettersGrid.classList.add("hidden");
  chooserName.textContent = playerName;
}

// Handle server events for new round phase
socket.on('newRoundPhase', (data) => {
  try {
    if (!data) return;
    
    if (data.phase === 'choosing') {
      if (data.chooserId === socket.id) {
        showMyTurn();
      } else {
        showWaitingForPlayer(data.chooserName || 'لاعب آخر');
      }
    }
  } catch (error) {
    console.error('Error handling newRoundPhase:', error);
  }
});

// Handle game started event (server sends this after letter is chosen)
socket.on('gameStarted', (data) => {
  try {
    if (!data || !data.letter) {
      console.error('Invalid gameStarted data:', data);
      return;
    }

    // Save game data to localStorage with validation
    const gameData = {
      letter: data.letter,
      round: data.round || 1,
      maxRounds: data.maxRounds || 5,
      timestamp: Date.now()
    };
    
    localStorage.setItem("gameData", JSON.stringify(gameData));

    // الانتقال لصفحة اللعب
    setTimeout(() => {
      window.location.href = "game.html";
    }, 1000);
  } catch (error) {
    console.error('Error handling gameStarted:', error);
    showError('خطأ في بدء اللعبة');
  }
});

// زر المغادرة
leaveBtn.addEventListener("click", () => {
  if (confirm("هل تريد مغادرة اللعبة؟")) {
    try {
      socket.emit('leaveRoom');
    } catch (error) {
      console.error('Error leaving room:', error);
    }
    window.location.href = "/";
  }
});

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
  if (letterSelectionTimeout) {
    clearTimeout(letterSelectionTimeout);
  }
});

// تهيئة الصفحة
try {
  renderLetters();
} catch (error) {
  console.error('Error initializing page:', error);
  showError('خطأ في تهيئة الصفحة');
}
