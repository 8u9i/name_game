const socket = io();

// عناصر الصفحة
const winnersList = document.getElementById("winnersList");
const playAgainBtn = document.getElementById("playAgainBtn");
const homeBtn = document.getElementById("homeBtn");

// البيانات المحلية
let finalResults = null;

// تحميل النتائج النهائية
function loadFinalResults() {
  const storedData = localStorage.getItem("finalResults");
  if (storedData) {
    finalResults = JSON.parse(storedData);
    renderWinners();
    celebrateWinner();
  }
}

// رسم قائمة الفائزين
function renderWinners() {
  winnersList.innerHTML = "";

  const medals = [
    {
      class:
        "relative flex items-center gap-4 p-4 rounded-lg bg-white dark:bg-gray-800/50 border-2 border-gold shadow-glow-gold",
      rank: "١",
      color: "gold",
      icon: "military_tech",
    },
    {
      class:
        "flex items-center gap-4 p-4 rounded-lg bg-white dark:bg-gray-800/50 border border-silver",
      rank: "٢",
      color: "silver",
      icon: "military_tech",
    },
    {
      class:
        "flex items-center gap-4 p-4 rounded-lg bg-white dark:bg-gray-800/50 border border-bronze",
      rank: "٣",
      color: "bronze",
      icon: "military_tech",
    },
  ];

  finalResults.rankings.forEach((player, index) => {
    const div = document.createElement("div");

    if (index < 3) {
      div.className = medals[index].class;

      const rankSpan = document.createElement("span");
      rankSpan.className = `text-4xl font-bold text-${medals[index].color}`;
      rankSpan.textContent = medals[index].rank;
      div.appendChild(rankSpan);

      // Avatar
      const avatar = document.createElement("div");
      avatar.className =
        "bg-center bg-no-repeat aspect-square bg-cover rounded-full h-16 w-16 bg-gradient-to-br from-primary to-blue-500 flex items-center justify-center text-white font-black text-2xl";
      avatar.textContent = player.name.charAt(0);
      div.appendChild(avatar);

      const infoDiv = document.createElement("div");
      infoDiv.className = "flex-grow";

      const nameP = document.createElement("p");
      nameP.className = "text-gray-900 dark:text-gray-50 text-xl font-bold";
      nameP.textContent = player.name;

      const scoreP = document.createElement("p");
      scoreP.className = "text-gray-500 dark:text-gray-400";
      scoreP.textContent = `${player.score} نقطة`;

      infoDiv.appendChild(nameP);
      infoDiv.appendChild(scoreP);
      div.appendChild(infoDiv);

      const iconSpan = document.createElement("span");
      iconSpan.className = `material-symbols-outlined text-4xl text-${medals[index].color}`;
      iconSpan.textContent = medals[index].icon;
      div.appendChild(iconSpan);
    } else {
      div.className =
        "flex items-center gap-4 p-4 rounded-lg bg-white dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700";

      const rankSpan = document.createElement("span");
      rankSpan.className =
        "text-4xl font-bold text-gray-500 dark:text-gray-400";
      rankSpan.textContent =
        ["٤", "٥", "٦"][index - 3] || (index + 1).toString();
      div.appendChild(rankSpan);

      // Avatar
      const avatar = document.createElement("div");
      avatar.className =
        "bg-center bg-no-repeat aspect-square bg-cover rounded-full h-16 w-16 bg-gradient-to-br from-gray-400 to-gray-600 flex items-center justify-center text-white font-black text-2xl";
      avatar.textContent = player.name.charAt(0);
      div.appendChild(avatar);

      const infoDiv = document.createElement("div");
      infoDiv.className = "flex-grow";

      const nameP = document.createElement("p");
      nameP.className = "text-gray-900 dark:text-gray-50 text-xl font-bold";
      nameP.textContent = player.name;

      const scoreP = document.createElement("p");
      scoreP.className = "text-gray-500 dark:text-gray-400";
      scoreP.textContent = `${player.score} نقطة`;

      infoDiv.appendChild(nameP);
      infoDiv.appendChild(scoreP);
      div.appendChild(infoDiv);
    }

    winnersList.appendChild(div);
  });
}

// احتفال بالفائز
function celebrateWinner() {
  // إضافة تأثيرات بصرية (اختياري)
  const winner = finalResults.rankings[0];
  console.log(`🎉 الفائز: ${winner.name} بـ ${winner.score} نقطة!`);

  // صوت احتفالي (اختياري)
  // يمكن إضافة صوت هنا
}

// زر اللعب مجدداً
playAgainBtn.addEventListener("click", () => {
  // إعادة تعيين اللعبة
  localStorage.clear();
  socket.emit("requestNewGame");
  window.location.href = "/";
});

// زر العودة للرئيسية
homeBtn.addEventListener("click", () => {
  localStorage.clear();
  window.location.href = "/";
});

// تهيئة الصفحة
loadFinalResults();
