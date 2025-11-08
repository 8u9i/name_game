const socket = io();

// الحروف العربية مع الحروف المعطلة
const arabicLetters = [
  { letter: "ا", enabled: true },
  { letter: "ب", enabled: true },
  { letter: "ت", enabled: true },
  { letter: "ث", enabled: false },
  { letter: "ج", enabled: true },
  { letter: "ح", enabled: true },
  { letter: "خ", enabled: true },
  { letter: "د", enabled: true },
  { letter: "ذ", enabled: true },
  { letter: "ر", enabled: true },
  { letter: "ز", enabled: false },
  { letter: "س", enabled: true },
  { letter: "ش", enabled: true },
  { letter: "ص", enabled: true },
  { letter: "ض", enabled: true },
  { letter: "ط", enabled: true },
  { letter: "ظ", enabled: true },
  { letter: "ع", enabled: true },
  { letter: "غ", enabled: true },
  { letter: "ف", enabled: true },
  { letter: "ق", enabled: true },
  { letter: "ك", enabled: true },
  { letter: "ل", enabled: false },
  { letter: "م", enabled: true },
  { letter: "ن", enabled: true },
  { letter: "ه", enabled: true },
  { letter: "و", enabled: true },
  { letter: "ي", enabled: true },
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

// رسم شبكة الحروف
function renderLetters() {
  lettersGrid.innerHTML = "";

  arabicLetters.forEach(({ letter, enabled }) => {
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
}

// اختيار حرف
function selectLetter(letter) {
  if (!isMyTurn) {
    alert("ليس دورك!");
    return;
  }

  // إرسال الحرف المختار للسيرفر
  socket.emit("letterChosen", letter);

  // تعطيل الأزرار
  disableAllButtons();

  turnMessage.querySelector("p").textContent = `اخترت الحرف "${letter}"`;
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

// استقبال الدور من السيرفر
socket.on("yourTurnToChoose", () => {
  showMyTurn();
});

socket.on("waitingForPlayerToChoose", (data) => {
  showWaitingForPlayer(data.playerName);
});

// عند اختيار الحرف والانتقال للعبة
socket.on("letterSelected", (data) => {
  // حفظ بيانات اللعبة
  localStorage.setItem("currentLetter", data.letter);
  localStorage.setItem("roundNumber", data.round);

  // الانتقال لصفحة اللعب
  setTimeout(() => {
    window.location.href = "game.html";
  }, 1000);
});

// زر المغادرة
leaveBtn.addEventListener("click", () => {
  if (confirm("هل تريد مغادرة اللعبة؟")) {
    window.location.href = "/";
  }
});

// تهيئة الصفحة
renderLetters();
