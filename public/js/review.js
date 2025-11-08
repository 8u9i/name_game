const socket = io();

// عناصر الصفحة
const roundTitle = document.getElementById("roundTitle");
const votingMinutes = document.getElementById("votingMinutes");
const votingSeconds = document.getElementById("votingSeconds");
const votingCards = document.getElementById("votingCards");
const answersTable = document.getElementById("answersTable");
const nextRoundBtn = document.getElementById("nextRoundBtn");

// البيانات المحلية
let roundResults = null;
let myVotes = new Map(); // playerId -> {name: true/false, ...}
let votingTimer = 60; // 60 ثانية للتصويت

// تحميل نتائج الجولة
function loadRoundResults() {
  const storedData = localStorage.getItem("roundResults");
  if (storedData) {
    roundResults = JSON.parse(storedData);
    const letter = roundResults.letter;
    roundTitle.textContent = `نتائج جولة حرف ${letter}`;
    renderVotingCards();
    renderAnswersTable();
  }
}

// رسم بطاقات التصويت
function renderVotingCards() {
  votingCards.innerHTML = "";

  roundResults.answers.forEach((playerData, index) => {
    const card = document.createElement("div");
    card.className =
      index === 0
        ? "rounded-xl border border-primary/50 bg-primary/10 dark:bg-primary/20 p-4 sm:p-6 shadow-lg"
        : "rounded-xl border border-neutral-200 dark:border-neutral-600 bg-white dark:bg-neutral-800/50 p-4 sm:p-6 shadow";

    const header = document.createElement("div");
    header.className =
      "flex items-center justify-between border-b border-primary/30 pb-4";

    const title = document.createElement("h3");
    title.className =
      "text-lg font-bold text-neutral-800 dark:text-neutral-100";
    title.textContent = `تصويت على إجابات ${playerData.playerName}`;

    if (index === 0) {
      const badge = document.createElement("span");
      badge.className =
        "rounded-full bg-secondary px-3 py-1 text-xs font-bold text-neutral-800";
      badge.textContent = "الأسرع";
      header.appendChild(title);
      header.appendChild(badge);
    } else {
      header.appendChild(title);
    }

    card.appendChild(header);

    // الإجابات
    const answersDiv = document.createElement("div");
    answersDiv.className = "py-4";

    const dl = document.createElement("dl");
    dl.className = "space-y-3";

    const categories = [
      { key: "name", label: "اسم" },
      { key: "animal", label: "حيوان" },
      { key: "plant", label: "نبات" },
      { key: "thing", label: "جماد" },
      { key: "country", label: "بلد" },
    ];

    categories.forEach((cat) => {
      const answer = playerData.answers[cat.key];
      if (!answer || answer.trim() === "") return;

      const div = document.createElement("div");
      div.className =
        "flex flex-wrap items-center justify-between gap-x-6 gap-y-2 py-2";

      const dt = document.createElement("dt");
      dt.className =
        "text-sm font-medium leading-normal text-neutral-600 dark:text-neutral-200";
      dt.textContent = answer;

      const dd = document.createElement("dd");
      dd.className =
        "flex items-center gap-2 text-sm leading-normal text-neutral-800 dark:text-neutral-100";

      // زر الموافقة
      const approveBtn = document.createElement("button");
      approveBtn.className =
        "flex h-8 w-8 items-center justify-center rounded-full bg-success/20 text-success transition-transform hover:scale-110";
      approveBtn.innerHTML =
        '<span class="material-symbols-outlined text-base">thumb_up</span>';
      approveBtn.onclick = () =>
        vote(playerData.playerId, cat.key, true, approveBtn, rejectBtn);

      // زر الرفض
      const rejectBtn = document.createElement("button");
      rejectBtn.className =
        "flex h-8 w-8 items-center justify-center rounded-full bg-danger/20 text-danger transition-transform hover:scale-110";
      rejectBtn.innerHTML =
        '<span class="material-symbols-outlined text-base">thumb_down</span>';
      rejectBtn.onclick = () =>
        vote(playerData.playerId, cat.key, false, approveBtn, rejectBtn);

      dd.appendChild(approveBtn);
      dd.appendChild(rejectBtn);

      div.appendChild(dt);
      div.appendChild(dd);
      dl.appendChild(div);
    });

    answersDiv.appendChild(dl);
    card.appendChild(answersDiv);
    votingCards.appendChild(card);
  });
}

// التصويت
function vote(playerId, category, approve, approveBtn, rejectBtn) {
  if (!myVotes.has(playerId)) {
    myVotes.set(playerId, {});
  }

  const playerVotes = myVotes.get(playerId);
  playerVotes[category] = approve;

  // تحديث الأزرار
  if (approve) {
    approveBtn.classList.add("ring-2", "ring-success");
    rejectBtn.classList.remove("ring-2", "ring-danger");
  } else {
    rejectBtn.classList.add("ring-2", "ring-danger");
    approveBtn.classList.remove("ring-2", "ring-success");
  }

  // التحقق إذا انتهى التصويت
  checkVotingComplete();
}

// التحقق من اكتمال التصويت
function checkVotingComplete() {
  let allVoted = true;

  roundResults.answers.forEach((playerData) => {
    const playerVotes = myVotes.get(playerData.playerId);
    if (!playerVotes) {
      allVoted = false;
      return;
    }

    const categories = ["name", "animal", "plant", "thing", "country"];
    categories.forEach((cat) => {
      const answer = playerData.answers[cat];
      if (answer && answer.trim() !== "" && playerVotes[cat] === undefined) {
        allVoted = false;
      }
    });
  });

  if (allVoted) {
    submitAllVotes();
  }
}

// إرسال جميع الأصوات
function submitAllVotes() {
  myVotes.forEach((votes, playerId) => {
    socket.emit("voteAnswers", { playerId, votes });
  });

  nextRoundBtn.disabled = true;
  nextRoundBtn.innerHTML = "<span>تم إرسال أصواتك! في انتظار الآخرين...</span>";
}

// رسم جدول الإجابات
function renderAnswersTable() {
  answersTable.innerHTML = "";

  roundResults.answers.forEach((playerData, index) => {
    const tr = document.createElement("tr");
    tr.className = index === 0 ? "bg-primary/10 dark:bg-primary/20" : "";

    const nameCell = document.createElement("td");
    nameCell.className =
      "h-[72px] whitespace-nowrap px-4 py-2 text-sm font-bold text-neutral-800 dark:text-neutral-100";
    nameCell.textContent =
      index === 0 ? `${playerData.playerName} (الأول)` : playerData.playerName;
    tr.appendChild(nameCell);

    ["name", "animal", "plant", "thing", "country"].forEach((cat) => {
      const cell = document.createElement("td");
      cell.className =
        "h-[72px] whitespace-nowrap px-4 py-2 text-sm font-normal text-neutral-600 dark:text-neutral-200";
      cell.textContent = playerData.answers[cat] || "-";
      tr.appendChild(cell);
    });

    const scoreCell = document.createElement("td");
    scoreCell.className =
      "h-[72px] whitespace-nowrap px-4 py-2 text-sm font-bold text-neutral-800 dark:text-neutral-100";
    scoreCell.textContent = "0"; // سيتم تحديثها بعد التصويت
    tr.appendChild(scoreCell);

    answersTable.appendChild(tr);
  });
}

// العد التنازلي للتصويت
function startVotingTimer() {
  const interval = setInterval(() => {
    votingTimer--;

    const minutes = Math.floor(votingTimer / 60);
    const seconds = votingTimer % 60;

    votingMinutes.textContent = minutes.toString().padStart(2, "0");
    votingSeconds.textContent = seconds.toString().padStart(2, "0");

    if (votingTimer <= 0) {
      clearInterval(interval);
      // إرسال الأصوات تلقائياً
      if (myVotes.size > 0) {
        submitAllVotes();
      }
    }
  }, 1000);
}

// عند حساب النقاط
socket.on("scoresCalculated", (data) => {
  // تحديث الجدول بالنقاط
  data.roundScores.forEach(({ playerId, score }) => {
    const playerIndex = roundResults.answers.findIndex(
      (p) => p.playerId === playerId
    );
    if (playerIndex !== -1) {
      const row = answersTable.children[playerIndex];
      const scoreCell = row.lastElementChild;
      scoreCell.textContent = score;
    }
  });

  nextRoundBtn.disabled = false;
  nextRoundBtn.innerHTML =
    '<span>الجولة التالية</span><span class="material-symbols-outlined">arrow_back</span>';
});

// الانتقال للجولة التالية
nextRoundBtn.addEventListener("click", () => {
  // سيتم التعامل معه من السيرفر
});

// عند بدء الجولة التالية
socket.on("nextRound", () => {
  window.location.href = "choose-letter.html";
});

// عند انتهاء اللعبة
socket.on("gameEnded", (data) => {
  localStorage.setItem("finalResults", JSON.stringify(data));
  window.location.href = "final-results.html";
});

// تهيئة الصفحة
loadRoundResults();
startVotingTimer();
