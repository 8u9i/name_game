const socket = io();

// Constants
const LOCALSTORAGE_GAME_KEYS = ['gameData', 'scoresCalculated', 'finalResults', 'playerName'];

// عناصر الصفحة
const winnersList = document.getElementById("winnersList");
const playAgainBtn = document.getElementById("playAgainBtn");
const homeBtn = document.getElementById("homeBtn");

// البيانات المحلية
let finalResults = null;

// Track socket connection
socket.on('connect', () => {
  console.log('Socket connected');
});

socket.on('disconnect', () => {
  console.log('Socket disconnected');
});

// Utility function
function showError(message) {
  const errorDiv = document.createElement('div');
  errorDiv.className = 'fixed top-4 left-1/2 transform -translate-x-1/2 bg-red-500 text-white px-6 py-3 rounded-lg shadow-lg z-50';
  errorDiv.textContent = message;
  document.body.appendChild(errorDiv);
  
  setTimeout(() => {
    errorDiv.remove();
  }, 3000);
}

function cleanupGameData() {
  try {
    // Remove all game-related data from localStorage
    LOCALSTORAGE_GAME_KEYS.forEach(key => {
      localStorage.removeItem(key);
    });
    console.log('Game data cleaned up');
  } catch (error) {
    console.error('Error cleaning up game data:', error);
  }
}

// تحميل النتائج النهائية
function loadFinalResults() {
  try {
    const storedData = localStorage.getItem("finalResults");
    if (!storedData) {
      showError('لا توجد بيانات النتائج النهائية');
      return;
    }
    
    finalResults = JSON.parse(storedData);
    
    // Validate data structure
    if (!finalResults || !finalResults.rankings || !Array.isArray(finalResults.rankings)) {
      showError('بيانات النتائج غير صالحة');
      return;
    }
    
    // Handle edge cases
    if (finalResults.rankings.length === 0) {
      showError('لا يوجد فائزون');
      return;
    }
    
    renderWinners();
    celebrateWinner();
  } catch (error) {
    console.error('Error loading final results:', error);
    showError('خطأ في تحميل النتائج النهائية');
  }
}

// رسم قائمة الفائزين
function renderWinners() {
  try {
    if (!finalResults || !finalResults.rankings) return;
    
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
      if (!player || !player.name) {
        console.warn('Invalid player data:', player);
        return;
      }
      
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
        avatar.textContent = player.name.charAt(0).toUpperCase();
        div.appendChild(avatar);

        const infoDiv = document.createElement("div");
        infoDiv.className = "flex-grow";

        const nameP = document.createElement("p");
        nameP.className = "text-gray-900 dark:text-gray-50 text-xl font-bold";
        nameP.textContent = player.name;

        const scoreP = document.createElement("p");
        scoreP.className = "text-gray-500 dark:text-gray-400";
        scoreP.textContent = `${player.score || 0} نقطة`;

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
        avatar.textContent = player.name.charAt(0).toUpperCase();
        div.appendChild(avatar);

        const infoDiv = document.createElement("div");
        infoDiv.className = "flex-grow";

        const nameP = document.createElement("p");
        nameP.className = "text-gray-900 dark:text-gray-50 text-xl font-bold";
        nameP.textContent = player.name;

        const scoreP = document.createElement("p");
        scoreP.className = "text-gray-500 dark:text-gray-400";
        scoreP.textContent = `${player.score || 0} نقطة`;

        infoDiv.appendChild(nameP);
        infoDiv.appendChild(scoreP);
        div.appendChild(infoDiv);
      }

      winnersList.appendChild(div);
    });
  } catch (error) {
    console.error('Error rendering winners:', error);
    showError('خطأ في عرض الفائزين');
  }
}

// احتفال بالفائز
function celebrateWinner() {
  try {
    if (!finalResults || !finalResults.rankings || finalResults.rankings.length === 0) {
      return;
    }
    
    // Handle tie scenario
    const winner = finalResults.rankings[0];
    const topScore = winner.score;
    const winners = finalResults.rankings.filter(p => p.score === topScore);
    
    if (winners.length > 1) {
      console.log(`🎉 تعادل! الفائزون: ${winners.map(w => w.name).join(', ')} بـ ${topScore} نقطة!`);
    } else {
      console.log(`🎉 الفائز: ${winner.name} بـ ${winner.score} نقطة!`);
    }
  } catch (error) {
    console.error('Error celebrating winner:', error);
  }
}

// زر اللعب مجدداً
playAgainBtn.addEventListener("click", () => {
  try {
    // Clean up game data
    cleanupGameData();
    
    // Navigate to home
    window.location.href = "/";
  } catch (error) {
    console.error('Error in play again:', error);
    showError('حدث خطأ');
  }
});

// زر العودة للرئيسية
homeBtn.addEventListener("click", () => {
  try {
    // Clean up game data
    cleanupGameData();
    
    // Navigate to home
    window.location.href = "/";
  } catch (error) {
    console.error('Error going home:', error);
    showError('حدث خطأ');
  }
});

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
  try {
    // Optional: Clean up after viewing results
  } catch (error) {
    console.error('Error cleaning up:', error);
  }
});

// تهيئة الصفحة
try {
  loadFinalResults();
} catch (error) {
  console.error('Error initializing page:', error);
  showError('خطأ في تهيئة الصفحة');
}
