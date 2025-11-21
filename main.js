// =======================================
//        SOCKET.IO INITIALISATION
// =======================================

const socket = io("http://localhost:3000");

// Récupère l'ID de room dans l'URL (si présent)
const urlParams = new URLSearchParams(window.location.search);
const roomFromUrl = urlParams.get("room");

let roomId = roomFromUrl || null;
let playerNameValue = null;
let lastPlayers = []; // on garde la dernière liste reçue

// =======================================
//             DOM ELEMENTS
// =======================================

// Screens
const screenHome = document.getElementById("screen-home");
const screenGame = document.getElementById("screen-game");

// Pseudo
const playerName = document.getElementById("player-name");
const btnValidateName = document.getElementById("btn-validate-name");
const pseudoStatus = document.getElementById("pseudo-status");

// Play section
const btnPlay = document.getElementById("btn-play");
const btnCopyLink = document.getElementById("btn-copy-link");

// Player count
const playerButtons = document.querySelectorAll(".player-btn");

// Game screen
const btnBack = document.getElementById("btn-back");
const gameInfo = document.getElementById("game-info");

// Counter
const counterBtn = document.getElementById("counter-btn");
const btnSubmitAnswer = document.getElementById("btn-submit-answer");
const answerFeedback = document.getElementById("answer-feedback");

// Opponents (noms + guesses)
const opp1NameEl = document.getElementById("opp1-name");
const opp2NameEl = document.getElementById("opp2-name");
const opp1GuessEl = document.getElementById("opp1-guess");
const opp2GuessEl = document.getElementById("opp2-guess");

// Canvas
const canvas = document.getElementById("board");
const ctx = canvas.getContext("2d");

// =======================================
//              GAME STATE
// =======================================

let currentPlayers = 1;
let currentCount = 0;
let currentSolution = 9;

// =======================================
//            SCREEN MANAGEMENT
// =======================================

function showHome() {
  screenHome.classList.remove("hidden");
  screenGame.classList.add("hidden");
}

function showGame() {
  screenHome.classList.add("hidden");
  screenGame.classList.remove("hidden");
  resizeCanvas();
  startNewGame();
}

// =======================================
//          PSEUDO VALIDATION
// =======================================

btnValidateName.addEventListener("click", () => {
  const pseudo = playerName.value.trim();

  if (!pseudo) {
    pseudoStatus.textContent = "Pseudo invalide.";
    pseudoStatus.style.color = "red";
    return;
  }

  playerNameValue = pseudo;
  pseudoStatus.textContent = "Pseudo validé : " + pseudo;
  pseudoStatus.style.color = "green";

  localStorage.setItem("pseudo", pseudo);

  // ✅ Si on a une room dans l’URL → on rejoint directement la partie
  if (roomId) {
    console.log("Je rejoins la room existante :", roomId);
    socket.emit("joinRoom", { roomId, pseudo }, (res) => {
      if (res.error) {
        alert(res.error);
        return;
      }
      showGame();
    });
    return;
  }

  // ✅ Sinon → on crée une nouvelle room (host)
  socket.emit("createRoom", pseudo, (_roomId) => {
    roomId = _roomId;
    console.log("Room créée :", roomId);

    localStorage.setItem("roomId", roomId);

    btnCopyLink.classList.remove("hidden");
    btnPlay.classList.remove("hidden");
  });
});

// =======================================
//                 PLAY
//  (utile surtout pour l’host ou si tu veux cliquer Play après pseudo)
// =======================================

btnPlay.addEventListener("click", () => {
  const pseudo = localStorage.getItem("pseudo");
  if (!pseudo) return alert("Valide un pseudo d’abord.");

  if (!roomId) roomId = localStorage.getItem("roomId");
  if (!roomId) return alert("Aucune room trouvée.");

  socket.emit("joinRoom", { roomId, pseudo }, (res) => {
    if (res.error) return alert(res.error);
    showGame();
  });
});

// =======================================
//          COPY ROOM LINK
// =======================================

btnCopyLink.addEventListener("click", async () => {
  if (!roomId) {
    alert("Pas de room encore créée.");
    return;
  }

  const frontUrl = window.location.origin; // ex: http://localhost:5500
  const fullLink = `${frontUrl}/?room=${roomId}`;

  await navigator.clipboard.writeText(fullLink);

  btnCopyLink.style.background = "#ccc";
  setTimeout(() => {
    btnCopyLink.style.background = "";
  }, 500);
});

// =======================================
//          PLAYER COUNT SELECT
// =======================================

playerButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    playerButtons.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    currentPlayers = parseInt(btn.dataset.players, 10);
  });
});

// Default
if (playerButtons.length > 0) {
  playerButtons[0].classList.add("active");
}

// =======================================
//             BACK BUTTON
// =======================================

btnBack.addEventListener("click", () => {
  showHome();
});

// =======================================
//                COUNTER
// =======================================

function updateCounterDisplay() {
  counterBtn.textContent = currentCount;
}

counterBtn.addEventListener("click", () => {
  currentCount++;
  updateCounterDisplay();
});

counterBtn.addEventListener("contextmenu", (e) => {
  e.preventDefault();
  if (currentCount > 0) currentCount--;
  updateCounterDisplay();
});

// =======================================
//            SOCKET: PLAYERS UPDATE
// =======================================

socket.on("playersUpdate", (players) => {
  console.log("Players:", players);
  lastPlayers = players;

  // Trouver "moi"
  const me = players.find((p) => p.id === socket.id);
  const others = players.filter((p) => p.id !== socket.id);

  // Top bar : ton pseudo + nb joueurs connectés
  const nameForInfo = me ? me.pseudo : "???";
  gameInfo.textContent = `${nameForInfo} • ${players.length} joueur(s) connectés`;

  // Cartes adversaires
  opp1NameEl.textContent = others[0] ? others[0].pseudo : "En attente…";
  opp2NameEl.textContent = others[1] ? others[1].pseudo : "En attente…";
});

// =======================================
//           SOCKET: GUESS UPDATE
// =======================================

socket.on("guessUpdate", (guesses) => {
  console.log("Guesses:", guesses);

  const me = lastPlayers.find((p) => p.id === socket.id);
  const others = lastPlayers.filter((p) => p.id !== socket.id);

  // Adversaire 1
  if (others[0]) {
    const g1 = guesses[others[0].id];
    opp1GuessEl.textContent = g1 !== undefined ? g1 : "?";
    opp1GuessEl.classList.add("blurred");
    opp1GuessEl.classList.remove("revealed");
  } else {
    opp1GuessEl.textContent = "?";
    opp1GuessEl.classList.remove("blurred", "revealed");
  }

  // Adversaire 2
  if (others[1]) {
    const g2 = guesses[others[1].id];
    opp2GuessEl.textContent = g2 !== undefined ? g2 : "?";
    opp2GuessEl.classList.add("blurred");
    opp2GuessEl.classList.remove("revealed");
  } else {
    opp2GuessEl.textContent = "?";
    opp2GuessEl.classList.remove("blurred", "revealed");
  }
});



// =======================================
//           SEND GUESS (VALIDE)
// =======================================

btnSubmitAnswer.addEventListener("click", () => {
  if (!roomId) {
    answerFeedback.textContent = "Pas de room active.";
    answerFeedback.style.color = "red";
    return;
  }

  socket.emit("sendGuess", {
    roomId,
    value: currentCount,
  });

  answerFeedback.textContent = "Réponse envoyée.";
  answerFeedback.style.color = "#6b7280";
});

// =======================================
//             CANVAS / GRILLE
// =======================================

function resizeCanvas() {
  const wrapper = document.getElementById("grid-wrapper");
  if (!wrapper) return;
  const rect = wrapper.getBoundingClientRect();

  canvas.width = rect.width - 40;
  canvas.height = rect.height - 40;
}

function clearCanvas() {
  ctx.fillStyle = "#111";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

const GRID_COLS = 6;
const GRID_ROWS = 4;

function drawGrid() {
  clearCanvas();

  const margin = 40;
  const w = canvas.width - margin * 2;
  const h = canvas.height - margin * 2;

  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 2;

  ctx.strokeRect(margin, margin, w, h);

  const colStep = w / GRID_COLS;
  const rowStep = h / GRID_ROWS;

  for (let c = 1; c < GRID_COLS; c++) {
    const x = margin + colStep * c;
    ctx.beginPath();
    ctx.moveTo(x, margin);
    ctx.lineTo(x, margin + h);
    ctx.stroke();
  }

  for (let r = 1; r < GRID_ROWS; r++) {
    const y = margin + rowStep * r;
    ctx.beginPath();
    ctx.moveTo(margin, y);
    ctx.lineTo(margin + w, y);
    ctx.stroke();
  }
}

function startNewGame() {
  currentCount = 0;
  updateCounterDisplay();
  drawGrid();
}

// =======================================
//                INIT
// =======================================

// Si on a déjà pseudo + room dans l’URL → auto-join direct
const storedPseudo = localStorage.getItem("pseudo");

if (roomId && storedPseudo) {
  playerNameValue = storedPseudo;
  playerName.value = storedPseudo;
  pseudoStatus.textContent = "Connexion à la room...";
  pseudoStatus.style.color = "#6b7280";

  socket.emit("joinRoom", { roomId, pseudo: storedPseudo }, (res) => {
    if (res.error) {
      alert(res.error);
      showHome();
      return;
    }
    showGame();
  });
} else {
  // Sinon, on reste sur l'accueil
  showHome();
}
