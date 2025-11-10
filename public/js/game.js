const socket = io();

// Constants - matching server categories
const CATEGORIES = ["name", "plant", "animal", "thing", "country"];
const MAX_ANSWER_LENGTH = 50;
const RATE_LIMIT_DELAY = 1000;

// عناصر الصفحة
const currentLetterEl = document.getElementById("currentLetter");
const timerEl = document.getElementById("timer");
const roundInfoEl = document.getElementById("roundInfo");
const playersListEl = document.getElementById("playersList");
const submittedCountEl = document.getElementById("submittedCount");

const nameInput = document.getElementById("nameInput");
const plantInput = document.getElementById("plantInput");
const animalInput = document.getElementById("animalInput");
const thingInput = document.getElementById("thingInput");
const countryInput = document.getElementById("countryInput");
const submitBtn = document.getElementById("submitBtn");

// البيانات المحلية
let gameData = null;
let hasSubmitted = false;
let players = [];
let submittedPlayers = 0;
let lastRequestTime = 0;
let isSocketConnected = false;

// Track socket connection
socket.on('connect', () => {
  isSocketConnected = true;
  console.log('Socket connected');
});

socket.on('disconnect', () => {
  isSocketConnected = false;
  console.log('Socket disconnected');
  showNotification('فقد الاتصال بالسيرفر... جاري إعادة الاتصال...');
});

socket.on('error', (message) => {
  showNotification(message || 'حدث خطأ');
});

socket.on('syncError', (message) => {
  showNotification(message || 'خطأ في المزامنة');
});

// Utility functions
function sanitizeInput(input) {
  if (typeof input !== 'string') return '';
  return input
    .trim()
    .replace(/[<>\"'&]/g, '')
    .substring(0, MAX_ANSWER_LENGTH);
}

function checkRateLimit() {
  const now = Date.now();
  if (now - lastRequestTime < RATE_LIMIT_DELAY) {
    showNotification('يرجى الانتظار قبل المحاولة مرة أخرى');
    return false;
  }
  lastRequestTime = now;
  return true;
}

function validateAnswer(answer, letter) {
  if (!answer || answer.trim() === '') return true; // Empty is OK
  if (typeof answer !== 'string') return false;
  if (answer.length > MAX_ANSWER_LENGTH) return false;
  // Check if answer starts with the current letter (case insensitive)
  const firstChar = answer.charAt(0).toUpperCase();
  return firstChar === letter.toUpperCase();
}

// تحميل بيانات اللعبة
function loadGameData() {
  try {
    const storedData = localStorage.getItem("gameData");
    if (!storedData) {
      showNotification('لا توجد بيانات لعبة');
      return;
    }
    
    gameData = JSON.parse(storedData);
    
    if (!gameData || !gameData.letter) {
      showNotification('بيانات اللعبة غير صالحة');
      return;
    }
    
    // Validate data structure
    if (typeof gameData.letter !== 'string' || 
        typeof gameData.round !== 'number' || 
        typeof gameData.maxRounds !== 'number') {
      showNotification('بيانات اللعبة غير صالحة');
      return;
    }
    
    currentLetterEl.textContent = gameData.letter;
    roundInfoEl.textContent = `الجولة ${gameData.round}/${gameData.maxRounds}`;
  } catch (error) {
    console.error('Error loading game data:', error);
    showNotification('خطأ في تحميل بيانات اللعبة');
  }
}

// Handle game started event from server
socket.on("gameStarted", (data) => {
  try {
    if (!data || !data.letter) {
      console.error('Invalid gameStarted data:', data);
      return;
    }

    gameData = {
      letter: data.letter,
      round: data.round || 1,
      maxRounds: data.maxRounds || 5
    };
    
    localStorage.setItem("gameData", JSON.stringify(gameData));
    
    currentLetterEl.textContent = gameData.letter;
    roundInfoEl.textContent = `الجولة ${gameData.round}/${gameData.maxRounds}`;
  } catch (error) {
    console.error('Error handling gameStarted:', error);
  }
});

// تحديث العد التنازلي
socket.on("timerUpdate", (time) => {
  try {
    if (typeof time !== 'number') return;
    
    const minutes = Math.floor(time / 60);
    const seconds = time % 60;
    timerEl.textContent = `${minutes.toString().padStart(2, "0")}:${seconds
      .toString()
      .padStart(2, "0")}`;

    // تغيير اللون عند اقتراب الوقت
    if (time <= 10) {
      timerEl.parentElement.classList.remove("border-accent-yellow");
      timerEl.parentElement.classList.add("border-red-500", "animate-pulse");
    }
  } catch (error) {
    console.error('Error updating timer:', error);
  }
});

// تحديث قائمة اللاعبين
function updatePlayersList(playersData) {
  players = playersData;
  playersListEl.innerHTML = "";

  playersData.forEach((player, index) => {
    const playerDiv = document.createElement("div");
    playerDiv.className = player.isCurrentPlayer
      ? "flex items-center justify-between p-3 rounded-lg bg-primary/20 dark:bg-primary/40 border border-primary/50"
      : "flex items-center justify-between p-3 rounded-lg bg-gray-100 dark:bg-gray-800/50";

    const leftDiv = document.createElement("div");
    leftDiv.className = "flex items-center gap-3";

    // أيقونة اللاعب
    const avatar = document.createElement("div");
    avatar.className =
      "w-10 h-10 rounded-full bg-primary/30 flex items-center justify-center text-white font-bold";
    avatar.textContent = player.name.charAt(0);

    const nameSpan = document.createElement("span");
    nameSpan.className = player.isCurrentPlayer
      ? "font-bold text-secondary dark:text-white"
      : "font-semibold text-secondary dark:text-gray-300";
    nameSpan.textContent = player.name;

    leftDiv.appendChild(avatar);
    leftDiv.appendChild(nameSpan);

    const scoreSpan = document.createElement("span");
    scoreSpan.className = "text-lg font-bold text-primary dark:text-primary";
    scoreSpan.textContent = player.score;

    playerDiv.appendChild(leftDiv);
    playerDiv.appendChild(scoreSpan);
    playersListEl.appendChild(playerDiv);
  });
}

// تحديث عدد اللاعبين الذين أرسلوا
socket.on("playerSubmitted", (data) => {
  try {
    if (!data || typeof data.playerId !== 'string') return;
    
    // Update submitted count in UI
    submittedPlayers++;
    if (submittedCountEl) {
      const totalPlayers = players.length || submittedPlayers;
      submittedCountEl.textContent = `${submittedPlayers}/${totalPlayers}`;
    }

    // إظهار إشعار
    if (data.playerId !== socket.id) {
      showNotification('لاعب آخر أرسل إجاباته!');
    }
  } catch (error) {
    console.error('Error handling playerSubmitted:', error);
  }
});

// إرسال الإجابات
submitBtn.addEventListener("click", () => {
  try {
    if (hasSubmitted) {
      showNotification("لقد أرسلت إجاباتك بالفعل!");
      return;
    }

    if (!isSocketConnected) {
      showNotification('لا يوجد اتصال بالسيرفر');
      return;
    }
    
    if (!checkRateLimit()) return;
    
    if (!gameData || !gameData.letter) {
      showNotification('بيانات اللعبة غير متوفرة');
      return;
    }

    // Sanitize and validate answers
    const rawAnswers = {
      name: nameInput.value,
      plant: plantInput.value,
      animal: animalInput.value,
      thing: thingInput.value,
      country: countryInput.value,
    };
    
    const answers = {};
    let hasValidAnswer = false;
    
    CATEGORIES.forEach(category => {
      const sanitized = sanitizeInput(rawAnswers[category]);
      if (sanitized) {
        // Validate answer starts with current letter
        if (!validateAnswer(sanitized, gameData.letter)) {
          showNotification(`إجابة ${category} يجب أن تبدأ بالحرف ${gameData.letter}`);
          return;
        }
        answers[category] = sanitized;
        hasValidAnswer = true;
      }
    });

    // التحقق من وجود إجابة واحدة على الأقل
    if (!hasValidAnswer) {
      showNotification("الرجاء إدخال إجابة واحدة على الأقل!");
      return;
    }

    // إرسال للسيرفر - server expects object with category keys
    socket.emit("submitAnswers", answers);

    hasSubmitted = true;
    submitBtn.disabled = true;
    submitBtn.classList.add("opacity-50", "cursor-not-allowed");
    submitBtn.textContent = "✓ تم الإرسال";

    // تعطيل الحقول
    [nameInput, plantInput, animalInput, thingInput, countryInput].forEach(
      (input) => {
        if (input) input.disabled = true;
      }
    );
  } catch (error) {
    console.error('Error submitting answers:', error);
    showNotification('خطأ في إرسال الإجابات');
  }
});

// Handle scores calculated event from server
socket.on("scoresCalculated", (data) => {
  try {
    if (!data) return;
    
    // Save to localStorage for review page
    localStorage.setItem("scoresCalculated", JSON.stringify(data));

    // الانتقال لصفحة التصحيح
    setTimeout(() => {
      window.location.href = "review.html";
    }, 1000);
  } catch (error) {
    console.error('Error handling scoresCalculated:', error);
  }
});

// إشعار
function showNotification(message) {
  try {
    const notification = document.createElement("div");
    notification.className =
      "fixed top-4 left-1/2 transform -translate-x-1/2 bg-primary text-white px-6 py-3 rounded-lg shadow-lg z-50";
    notification.textContent = message || 'إشعار';
    document.body.appendChild(notification);

    setTimeout(() => {
      notification.remove();
    }, 3000);
  } catch (error) {
    console.error('Error showing notification:', error);
  }
}

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
  try {
    // Clean up any timers or listeners
  } catch (error) {
    console.error('Error cleaning up:', error);
  }
});

// تهيئة الصفحة
try {
  loadGameData();
} catch (error) {
  console.error('Error initializing page:', error);
  showNotification('خطأ في تهيئة الصفحة');
}
