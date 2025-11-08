const socket = io();

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

// تحميل بيانات اللعبة
function loadGameData() {
  const storedData = localStorage.getItem("gameData");
  if (storedData) {
    gameData = JSON.parse(storedData);
    currentLetterEl.textContent = gameData.letter;
    roundInfoEl.textContent = `الجولة ${gameData.round}/${gameData.maxRounds}`;
  }
}

// تحديث العد التنازلي
socket.on("timerUpdate", (time) => {
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
  submittedPlayers = data.totalSubmitted;
  submittedCountEl.textContent = `${data.totalSubmitted}/${data.totalPlayers}`;

  // إظهار إشعار
  if (data.playerId !== socket.id) {
    showNotification(`${data.playerName} أرسل إجاباته!`);
  }
});

// إرسال الإجابات
submitBtn.addEventListener("click", () => {
  if (hasSubmitted) {
    alert("لقد أرسلت إجاباتك بالفعل!");
    return;
  }

  const answers = {
    name: nameInput.value.trim(),
    plant: plantInput.value.trim(),
    animal: animalInput.value.trim(),
    thing: thingInput.value.trim(),
    country: countryInput.value.trim(),
  };

  // التحقق من وجود إجابة واحدة على الأقل
  const hasAtLeastOne = Object.values(answers).some((val) => val !== "");
  if (!hasAtLeastOne) {
    alert("الرجاء إدخال إجابة واحدة على الأقل!");
    return;
  }

  // إرسال للسيرفر
  socket.emit("submitAnswers", answers);

  hasSubmitted = true;
  submitBtn.disabled = true;
  submitBtn.classList.add("opacity-50", "cursor-not-allowed");
  submitBtn.textContent = "✓ تم الإرسال";

  // تعطيل الحقول
  [nameInput, plantInput, animalInput, thingInput, countryInput].forEach(
    (input) => {
      input.disabled = true;
    }
  );
});

// عند انتهاء الجولة
socket.on("roundEnded", (data) => {
  // حفظ البيانات
  localStorage.setItem("roundResults", JSON.stringify(data));

  // الانتقال لصفحة التصحيح
  setTimeout(() => {
    window.location.href = "review.html";
  }, 1000);
});

// إشعار
function showNotification(message) {
  const notification = document.createElement("div");
  notification.className =
    "fixed top-4 left-1/2 transform -translate-x-1/2 bg-primary text-white px-6 py-3 rounded-lg shadow-lg z-50 animate-bounce";
  notification.textContent = message;
  document.body.appendChild(notification);

  setTimeout(() => {
    notification.remove();
  }, 3000);
}

// تهيئة الصفحة
loadGameData();

// طلب بيانات اللاعبين (سيتم إضافتها للسيرفر)
socket.emit("requestPlayersData");

// استقبال بيانات اللاعبين
socket.on("playersData", (data) => {
  updatePlayersList(data.players);
  submittedCountEl.textContent = `0/${data.players.length}`;
});
