// الاتصال بالسيرفر
const socket = io();

// Constants
const RATE_LIMIT_DELAY = 1000;
const MAX_PLAYER_NAME_LENGTH = 20;
const MIN_PLAYER_NAME_LENGTH = 2;
const MAX_ROOM_CODE_LENGTH = 10;
const LOCALSTORAGE_KEY_PREFIX = 'nameGame_';
const LOCALSTORAGE_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days

// عناصر الصفحة
const playerNameInput = document.getElementById("playerNameInput");
const quickPlayBtn = document.getElementById("quickPlayBtn");
const joinRoomBtn = document.getElementById("joinRoomBtn");
const createRoomBtn = document.getElementById("createRoomBtn");
const roomCodeInput = document.getElementById("roomCodeInput");
const errorMessage = document.getElementById("errorMessage");

// بيانات اللاعب الحالي
let currentPlayer = {
  name: "",
  roomCode: "",
  id: "",
};

// Rate limiting
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
  showError('فقد الاتصال بالسيرفر');
});

// Utility functions
function sanitizeInput(input) {
  if (typeof input !== 'string') return '';
  return input
    .trim()
    .replace(/[<>\"'&]/g, '') // Remove potentially dangerous characters
    .substring(0, MAX_PLAYER_NAME_LENGTH);
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

function saveToLocalStorage(key, value) {
  try {
    const data = {
      value: value,
      timestamp: Date.now()
    };
    localStorage.setItem(LOCALSTORAGE_KEY_PREFIX + key, JSON.stringify(data));
  } catch (error) {
    console.error('Error saving to localStorage:', error);
  }
}

function getFromLocalStorage(key) {
  try {
    const item = localStorage.getItem(LOCALSTORAGE_KEY_PREFIX + key);
    if (!item) return null;
    
    const data = JSON.parse(item);
    if (!data || typeof data !== 'object') return null;
    
    // Check if data is expired
    if (Date.now() - data.timestamp > LOCALSTORAGE_MAX_AGE) {
      localStorage.removeItem(LOCALSTORAGE_KEY_PREFIX + key);
      return null;
    }
    
    return data.value;
  } catch (error) {
    console.error('Error reading from localStorage:', error);
    return null;
  }
}

// عرض رسالة خطأ
function showError(message) {
  try {
    if (!errorMessage) return;
    
    errorMessage.textContent = message || 'حدث خطأ';
    errorMessage.classList.remove("hidden");
    setTimeout(() => {
      errorMessage.classList.add("hidden");
    }, 3000);
  } catch (error) {
    console.error('Error showing error message:', error);
  }
}

// التحقق من اسم اللاعب
function validatePlayerName() {
  try {
    const rawName = playerNameInput.value || '';
    const name = sanitizeInput(rawName);
    
    if (!name) {
      showError("الرجاء إدخال اسمك أولاً");
      return false;
    }
    if (name.length < MIN_PLAYER_NAME_LENGTH) {
      showError(`الاسم يجب أن يكون ${MIN_PLAYER_NAME_LENGTH} أحرف على الأقل`);
      return false;
    }
    if (name.length > MAX_PLAYER_NAME_LENGTH) {
      showError(`الاسم يجب أن لا يتجاوز ${MAX_PLAYER_NAME_LENGTH} حرف`);
      return false;
    }
    
    currentPlayer.name = name;
    return true;
  } catch (error) {
    console.error('Error validating player name:', error);
    showError('خطأ في التحقق من الاسم');
    return false;
  }
}

function disableButton(button, text) {
  if (!button) return;
  button.disabled = true;
  button.innerHTML = `<span class="truncate">${text}</span>`;
}

function enableButton(button, text) {
  if (!button) return;
  button.disabled = false;
  button.innerHTML = `<span class="truncate">${text}</span>`;
}

// لعبة سريعة (إنشاء غرفة تلقائياً)
quickPlayBtn.addEventListener("click", () => {
  try {
    if (!validatePlayerName()) return;
    
    if (!isSocketConnected) {
      showError('لا يوجد اتصال بالسيرفر');
      return;
    }
    
    if (!checkRateLimit()) return;

    disableButton(quickPlayBtn, 'جاري الاتصال...');

    socket.emit("createRoom", currentPlayer.name);
  } catch (error) {
    console.error('Error in quick play:', error);
    showError('حدث خطأ عند بدء اللعبة');
    enableButton(quickPlayBtn, 'ابدأ اللعبة');
  }
});

// إنشاء غرفة
createRoomBtn.addEventListener("click", () => {
  try {
    if (!validatePlayerName()) return;
    
    if (!isSocketConnected) {
      showError('لا يوجد اتصال بالسيرفر');
      return;
    }
    
    if (!checkRateLimit()) return;

    disableButton(createRoomBtn, 'جاري إنشاء الغرفة...');

    socket.emit("createRoom", currentPlayer.name);
  } catch (error) {
    console.error('Error creating room:', error);
    showError('حدث خطأ عند إنشاء الغرفة');
    enableButton(createRoomBtn, 'أنشئ غرفة وادعُ أصدقاءك');
  }
});

// الانضمام لغرفة
joinRoomBtn.addEventListener("click", () => {
  try {
    if (!validatePlayerName()) return;
    
    if (!isSocketConnected) {
      showError('لا يوجد اتصال بالسيرفر');
      return;
    }

    const roomCode = sanitizeInput(roomCodeInput.value).toUpperCase();
    if (!roomCode) {
      showError("الرجاء إدخال رمز الغرفة");
      return;
    }
    
    if (roomCode.length > MAX_ROOM_CODE_LENGTH) {
      showError("رمز الغرفة غير صالح");
      return;
    }
    
    if (!checkRateLimit()) return;

    disableButton(joinRoomBtn, 'جاري الانضمام...');

    socket.emit("joinRoom", { roomCode, playerName: currentPlayer.name });
  } catch (error) {
    console.error('Error joining room:', error);
    showError('حدث خطأ عند الانضمام للغرفة');
    enableButton(joinRoomBtn, 'انضم');
  }
});

// عند إنشاء الغرفة بنجاح
socket.on("roomCreated", (data) => {
  try {
    if (!data || !data.roomCode || !data.player) {
      showError('بيانات غير صالحة من السيرفر');
      enableButton(quickPlayBtn, 'ابدأ اللعبة');
      enableButton(createRoomBtn, 'أنشئ غرفة وادعُ أصدقاءك');
      return;
    }

    currentPlayer.roomCode = data.roomCode;
    currentPlayer.id = data.player.id;

    // Save player info
    saveToLocalStorage('playerName', currentPlayer.name);

    // الانتقال لصفحة الانتظار
    window.location.href = `waiting-room.html?room=${encodeURIComponent(data.roomCode)}`;
  } catch (error) {
    console.error('Error handling roomCreated:', error);
    showError('خطأ عند إنشاء الغرفة');
    enableButton(quickPlayBtn, 'ابدأ اللعبة');
    enableButton(createRoomBtn, 'أنشئ غرفة وادعُ أصدقاءك');
  }
});

// عند الانضمام بنجاح
socket.on("joinedRoom", (data) => {
  try {
    if (!data || !data.roomCode || !data.player) {
      showError('بيانات غير صالحة من السيرفر');
      enableButton(joinRoomBtn, 'انضم');
      return;
    }

    currentPlayer.roomCode = data.roomCode;
    currentPlayer.id = data.player.id;

    // Save player info
    saveToLocalStorage('playerName', currentPlayer.name);

    // الانتقال لصفحة الانتظار
    window.location.href = `waiting-room.html?room=${encodeURIComponent(data.roomCode)}`;
  } catch (error) {
    console.error('Error handling joinedRoom:', error);
    showError('خطأ عند الانضمام للغرفة');
    enableButton(joinRoomBtn, 'انضم');
  }
});

// رسائل الأخطاء
socket.on("error", (message) => {
  try {
    showError(message || 'حدث خطأ');

    // إعادة تفعيل الأزرار
    enableButton(quickPlayBtn, 'ابدأ اللعبة');
    enableButton(createRoomBtn, 'أنشئ غرفة وادعُ أصدقاءك');
    enableButton(joinRoomBtn, 'انضم');
  } catch (error) {
    console.error('Error handling error:', error);
  }
});

// حفظ اسم اللاعب في localStorage
playerNameInput.addEventListener("input", () => {
  try {
    const name = sanitizeInput(playerNameInput.value);
    saveToLocalStorage("playerName", name);
  } catch (error) {
    console.error('Error saving player name:', error);
  }
});

// استرجاع اسم اللاعب المحفوظ
try {
  const savedName = getFromLocalStorage("playerName");
  if (savedName && typeof savedName === 'string') {
    playerNameInput.value = savedName;
  }
} catch (error) {
  console.error('Error loading saved name:', error);
}

// Enter للضغط على الأزرار
playerNameInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter") {
    quickPlayBtn.click();
  }
});

roomCodeInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter") {
    joinRoomBtn.click();
  }
});

// تحويل رمز الغرفة لأحرف كبيرة تلقائياً
roomCodeInput.addEventListener("input", (e) => {
  e.target.value = e.target.value.toUpperCase();
});
