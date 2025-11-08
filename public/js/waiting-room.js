// الاتصال بالسيرفر
const socket = io();

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
  if (isReady) return;

  isReady = true;
  readyBtn.classList.remove("bg-primary");
  readyBtn.classList.add("bg-green-500");
  readyBtn.innerHTML = '<span class="truncate">✓ جاهز</span>';
  readyBtn.disabled = true;

  socket.emit("playerReady");
});

// تحديث قائمة اللاعبين
function updatePlayersList(playersList_data) {
  players = playersList_data;
  playerCount.textContent = players.length;

  playersList.innerHTML = "";

  players.forEach((player) => {
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
  const readyCount = players.filter((p) => p.ready).length;
  if (readyCount === players.length && players.length >= 2) {
    waitingMessage.textContent = "جميع اللاعبين جاهزون! اللعبة ستبدأ قريباً...";
    waitingMessage.classList.add("text-green-500", "font-bold");
  } else if (players.length < 2) {
    waitingMessage.textContent = "في انتظار لاعب آخر على الأقل...";
  } else {
    waitingMessage.textContent = `${readyCount}/${players.length} جاهزون`;
  }
}

// عند انضمام لاعب جديد
socket.on("playerJoined", (data) => {
  updatePlayersList(data.players);

  // إشعار صوتي (اختياري)
  const audio = new Audio(
    "data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBSuFzPLZjToJHm7A7+OZUA0PVKzn77FgGwU7k9r0yHkpBSh+zPLajToJHm7A7+OZUA0PVKzn77FgGwU7k9r0yHkpBSh+zPLajToJHm7A7+OZUA0PVKzn77FgGwU7k9r0yHkpBSh+zPLajToJHm7A7+OZUA0PVKzn77FgGwU7k9r0yHkpBSh+zPLajToJHm7A7+OZUA0PVKzn77FgGwU7k9r0yHkpBSh+zPLajToJHm7A7+OZUA0PVKzn77FgGwU7k9r0yHkpBSh+zPLajToJHm7A7+OZUA0PVKzn77FgGwU7k9r0yHkpBSh+zPLajToJHm7A7+OZUA0PVKzn77FgGwU7k9r0yHkpBSh+zPLajToJHm7A7+OZUA0PVKzn77FgGwU7k9r0yHkpBSh+zPLajToJHm7A7+OZUA0PVKzn77FgGwU7k9r0yHkpBSh+zPLajToJHm7A7+OZUA0PVKzn77FgGwU7k9r0yHkpBSh+zPLajToJHm7A7+OZUA0PVKzn77FgGwU7k9r0yHkpBSh+zPLajToJHm7A7+OZUA0PVKzn77FgGwU7k9r0yHkpBSh+zPLajToJHm7A7+OZUA0PVKzn77FgGwU7k9r0yHkpBSh+zPLajToJHm7A7+OZUA0PVKzn77FgGwU7k9r0yHkpBSh+zPLajToJHm7A7+OZUA0PVKzn77FgGwU7k9r0yHkpBSh+zPLajToJHm7A7+OZUA0PVKzn77FgGwU7k9r0yHkpBSh+zPLajToJHm7A7+OZUA0PVKzn77FgGwU7k9r0yHkpBSh+"
  );
});

// عند تحديث حالة الاستعداد
socket.on("playerReadyUpdate", (data) => {
  updatePlayersList(data.players);
});

// عند بدء اللعبة (الانتقال لاختيار الحرف)
socket.on("yourTurnToChoose", () => {
  window.location.href = "choose-letter.html";
});

socket.on("waitingForPlayerToChoose", (data) => {
  window.location.href = "choose-letter.html";
});

// مغادرة الغرفة
leaveRoomBtn.addEventListener("click", () => {
  if (confirm("هل أنت متأكد من مغادرة الغرفة؟")) {
    window.location.href = "/";
  }
});

// عند مغادرة لاعب
socket.on("playerLeft", (data) => {
  updatePlayersList(data.players);
});

// إعادة الاتصال عند فقدان الاتصال
socket.on("disconnect", () => {
  waitingMessage.textContent = "فقد الاتصال بالسيرفر... جاري إعادة الاتصال...";
  waitingMessage.classList.add("text-red-500");
});

socket.on("connect", () => {
  waitingMessage.classList.remove("text-red-500");
});
