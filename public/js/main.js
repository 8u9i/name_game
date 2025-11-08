// الاتصال بالسيرفر
const socket = io();

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

// عرض رسالة خطأ
function showError(message) {
  errorMessage.textContent = message;
  errorMessage.classList.remove("hidden");
  setTimeout(() => {
    errorMessage.classList.add("hidden");
  }, 3000);
}

// التحقق من اسم اللاعب
function validatePlayerName() {
  const name = playerNameInput.value.trim();
  if (!name) {
    showError("الرجاء إدخال اسمك أولاً");
    return false;
  }
  if (name.length < 2) {
    showError("الاسم يجب أن يكون على الأقل حرفين");
    return false;
  }
  currentPlayer.name = name;
  return true;
}

// لعبة سريعة (إنشاء غرفة تلقائياً)
quickPlayBtn.addEventListener("click", () => {
  if (!validatePlayerName()) return;

  quickPlayBtn.disabled = true;
  quickPlayBtn.innerHTML = '<span class="truncate">جاري الاتصال...</span>';

  socket.emit("createRoom", currentPlayer.name);
});

// إنشاء غرفة
createRoomBtn.addEventListener("click", () => {
  if (!validatePlayerName()) return;

  createRoomBtn.disabled = true;
  createRoomBtn.innerHTML =
    '<span class="truncate">جاري إنشاء الغرفة...</span>';

  socket.emit("createRoom", currentPlayer.name);
});

// الانضمام لغرفة
joinRoomBtn.addEventListener("click", () => {
  if (!validatePlayerName()) return;

  const roomCode = roomCodeInput.value.trim().toUpperCase();
  if (!roomCode) {
    showError("الرجاء إدخال رمز الغرفة");
    return;
  }

  joinRoomBtn.disabled = true;
  joinRoomBtn.innerHTML = '<span class="truncate">جاري الانضمام...</span>';

  socket.emit("joinRoom", { roomCode, playerName: currentPlayer.name });
});

// عند إنشاء الغرفة بنجاح
socket.on("roomCreated", (data) => {
  currentPlayer.roomCode = data.roomCode;
  currentPlayer.id = data.player.id;

  // الانتقال لصفحة الانتظار
  window.location.href = `waiting-room.html?room=${data.roomCode}`;
});

// عند الانضمام بنجاح
socket.on("joinedRoom", (data) => {
  currentPlayer.roomCode = data.roomCode;
  currentPlayer.id = data.player.id;

  // الانتقال لصفحة الانتظار
  window.location.href = `waiting-room.html?room=${data.roomCode}`;
});

// رسائل الأخطاء
socket.on("error", (message) => {
  showError(message);

  // إعادة تفعيل الأزرار
  quickPlayBtn.disabled = false;
  quickPlayBtn.innerHTML = '<span class="truncate">ابدأ اللعبة</span>';

  createRoomBtn.disabled = false;
  createRoomBtn.innerHTML =
    '<span class="truncate">أنشئ غرفة وادعُ أصدقاءك</span>';

  joinRoomBtn.disabled = false;
  joinRoomBtn.innerHTML = '<span class="truncate">انضم</span>';
});

// حفظ اسم اللاعب في localStorage
playerNameInput.addEventListener("input", () => {
  localStorage.setItem("playerName", playerNameInput.value);
});

// استرجاع اسم اللاعب المحفوظ
const savedName = localStorage.getItem("playerName");
if (savedName) {
  playerNameInput.value = savedName;
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
