const socket = io();

// Constants
const CATEGORIES = ["name", "plant", "animal", "thing", "country"];
const RATE_LIMIT_DELAY = 1000;

// عناصر الصفحة
const roundTitle = document.getElementById("roundTitle");
const answersTable = document.getElementById("answersTable");
const nextRoundBtn = document.getElementById("nextRoundBtn");

// البيانات المحلية
let scoresData = null;
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
  showNotification('فقد الاتصال بالسيرفر');
});

socket.on('error', (message) => {
  showNotification(message || 'حدث خطأ');
});

socket.on('syncError', (message) => {
  showNotification(message || 'خطأ في المزامنة');
});

// Utility functions
function checkRateLimit() {
  const now = Date.now();
  if (now - lastRequestTime < RATE_LIMIT_DELAY) {
    showNotification('يرجى الانتظار قبل المحاولة مرة أخرى');
    return false;
  }
  lastRequestTime = now;
  return true;
}

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

// تحميل نتائج الجولة
function loadScoresData() {
  try {
    const storedData = localStorage.getItem("scoresCalculated");
    if (!storedData) {
      showNotification('لا توجد بيانات النتائج');
      return;
    }
    
    scoresData = JSON.parse(storedData);
    
    if (!scoresData || !scoresData.allAnswers) {
      showNotification('بيانات النتائج غير صالحة');
      return;
    }
    
    renderAnswersTable();
  } catch (error) {
    console.error('Error loading scores data:', error);
    showNotification('خطأ في تحميل بيانات النتائج');
  }
}

// رسم جدول الإجابات (removed voting system - server doesn't implement it)
function getCategoryLabel(category) {
  const labels = {
    name: "اسم",
    plant: "نبات",
    animal: "حيوان",
    thing: "جماد",
    country: "بلد"
  };
  return labels[category] || category;
}

function renderAnswersTable() {
  try {
    if (!scoresData || !scoresData.allAnswers) return;
    
    answersTable.innerHTML = "";

    scoresData.allAnswers.forEach((playerData, index) => {
      if (!playerData) return;
      
      const tr = document.createElement("tr");
      tr.className = index === 0 ? "bg-primary/10 dark:bg-primary/20" : "";

      const nameCell = document.createElement("td");
      nameCell.className =
        "h-[72px] whitespace-nowrap px-4 py-2 text-sm font-bold text-neutral-800 dark:text-neutral-100";
      nameCell.textContent = playerData.playerName || 'لاعب';
      tr.appendChild(nameCell);

      CATEGORIES.forEach((cat) => {
        const cell = document.createElement("td");
        cell.className =
          "h-[72px] whitespace-nowrap px-4 py-2 text-sm font-normal text-neutral-600 dark:text-neutral-200";
        cell.textContent = (playerData.answers && playerData.answers[cat]) || "-";
        tr.appendChild(cell);
      });

      // Find score for this player from roundScores
      let playerScore = 0;
      if (scoresData.roundScores) {
        const scoreEntry = scoresData.roundScores.find(s => s.playerId === playerData.playerId);
        if (scoreEntry) {
          playerScore = scoreEntry.score;
        }
      }

      const scoreCell = document.createElement("td");
      scoreCell.className =
        "h-[72px] whitespace-nowrap px-4 py-2 text-sm font-bold text-neutral-800 dark:text-neutral-100";
      scoreCell.textContent = playerScore;
      tr.appendChild(scoreCell);

      answersTable.appendChild(tr);
    });
  } catch (error) {
    console.error('Error rendering answers table:', error);
    showNotification('خطأ في عرض الإجابات');
  }
}

// الانتقال للجولة التالية
nextRoundBtn.addEventListener("click", () => {
  try {
    if (!isSocketConnected) {
      showNotification('لا يوجد اتصال بالسيرفر');
      return;
    }
    
    if (!checkRateLimit()) return;

    // Send finishedReviewing event to server
    socket.emit('finishedReviewing');
    
    nextRoundBtn.disabled = true;
    nextRoundBtn.innerHTML = '<span>في انتظار اللاعبين الآخرين...</span>';
  } catch (error) {
    console.error('Error in next round button:', error);
    showNotification('حدث خطأ');
  }
});

// Handle new round phase
socket.on("newRoundPhase", (data) => {
  try {
    if (!data) return;
    
    if (data.phase === 'choosing') {
      window.location.href = "choose-letter.html";
    }
  } catch (error) {
    console.error('Error handling newRoundPhase:', error);
  }
});

// عند انتهاء اللعبة
socket.on("gameEnded", (data) => {
  try {
    if (!data) return;
    
    localStorage.setItem("finalResults", JSON.stringify(data));
    window.location.href = "final-results.html";
  } catch (error) {
    console.error('Error handling gameEnded:', error);
  }
});

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
  loadScoresData();
} catch (error) {
  console.error('Error initializing page:', error);
  showNotification('خطأ في تهيئة الصفحة');
}
