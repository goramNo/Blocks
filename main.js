// =========================
// SOCKET.IO
// =========================
const socket = io("http://localhost:3000");

// =========================
// DOM
// =========================
const $ = (id) => document.getElementById(id);

const screenHome = $("screen-home");
const screenGame = $("screen-game");

const pseudoInput = $("player-name");
const pseudoBtn = $("btn-validate-name");
const pseudoStatus = $("pseudo-status");

const btnPlay = $("btn-play");
const btnCopyLink = $("btn-copy-link");
const btnBack = $("btn-back");

const btnStartGame = $("btn-start-game");
const waitingBanner = $("waiting-banner");

const playerButtons = document.querySelectorAll(".player-btn");
const playersSelect = $("players-select");

const gameInfo = $("game-info");
const gamePanels = $("game-panels");

const canvas = $("board");
const ctx = canvas.getContext("2d");

// =========================
// STATE
// =========================
let myName = null;
let currentRoom = null;

let players = [];
let guessesMap = {};
let revealed = false;
let currentCount = 0;
let currentSolution = null;

let answerFeedbackEl = null;
let newRoundBtnEl = null;

let hostId = null;
let round = 0;

let currentActiveBlocks = [];

// ✨ NOUVEAU: Nombre de joueurs et rounds sélectionnés
let selectedPlayerCount = 1;
let selectedMaxRounds = 5; // Par défaut 5 rounds

// =========================
// URL ROOM DETECTION
// =========================
const urlParams = new URLSearchParams(window.location.search);
const urlRoom = urlParams.get("room");

if (urlRoom) {
  btnPlay.classList.add("hidden");
  btnCopyLink.classList.add("hidden");
  if (playersSelect) playersSelect.classList.add("hidden");
}

// =========================
// HELPERS
// =========================
function getInviteLink(roomId) {
  return `${window.location.origin}${window.location.pathname}?room=${roomId}`;
}

function showToast(msg = "Lien copié ✅") {
  const existing = document.getElementById("toast");
  if (existing) existing.remove();

  const toast = document.createElement("div");
  toast.id = "toast";
  toast.textContent = msg;

  Object.assign(toast.style, {
    position: "fixed",
    top: "18px",
    left: "50%",
    transform: "translateX(-50%)",
    zIndex: 9999,
    background: "rgba(255,255,255,0.95)",
    color: "#0f172a",
    padding: "10px 16px",
    borderRadius: "12px",
    border: "1px solid rgba(148,163,184,0.6)",
    boxShadow: "0 10px 22px rgba(15,23,42,0.12)",
    fontWeight: "700",
    letterSpacing: "0.02em",
    opacity: "0",
    transition: "opacity .2s ease, transform .2s ease",
    backdropFilter: "blur(8px)"
  });

  document.body.appendChild(toast);

  requestAnimationFrame(() => {
    toast.style.opacity = "1";
    toast.style.transform = "translateX(-50%) translateY(4px)";
  });

  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateX(-50%) translateY(-6px)";
    setTimeout(() => toast.remove(), 220);
  }, 1200);
}

// =========================
// SCREENS
// =========================
function showHome() {
  screenHome.classList.remove("hidden");
  screenGame.classList.add("hidden");
}

function showGame() {
  screenHome.classList.add("hidden");
  screenGame.classList.remove("hidden");
  resizeCanvas();
  clearCanvas();
  renderPlayersDynamic();
}

showHome();

// =========================
// PLAYER SELECT
// =========================
playerButtons.forEach(btn => {
  btn.addEventListener("click", () => {
    playerButtons.forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    
    // ✨ Récupère le nombre de joueurs sélectionné
    selectedPlayerCount = parseInt(btn.getAttribute("data-players"));
    console.log("👥 Nombre de joueurs sélectionné:", selectedPlayerCount);
  });
});
if (playerButtons.length) {
  playerButtons[0].classList.add("active");
  selectedPlayerCount = parseInt(playerButtons[0].getAttribute("data-players")) || 1;
}

// ✨ NOUVEAU: ROUNDS SELECT
const roundButtons = document.querySelectorAll(".round-btn");
roundButtons.forEach(btn => {
  btn.addEventListener("click", () => {
    roundButtons.forEach(b => {
      b.classList.remove("active");
      b.style.border = "2px solid #e2e8f0";
      b.style.background = "white";
      b.style.color = "#0f172a";
    });
    btn.classList.add("active");
    btn.style.border = "2px solid #3b82f6";
    btn.style.background = "#3b82f6";
    btn.style.color = "white";
    
    selectedMaxRounds = parseInt(btn.getAttribute("data-rounds"));
    console.log("🎯 Nombre de rounds sélectionné:", selectedMaxRounds);
  });
});

// =========================
// PSEUDO VALIDATION
// =========================
pseudoBtn.addEventListener("click", () => {
  const name = pseudoInput.value.trim();
  if (name.length < 3) {
    pseudoStatus.textContent = "Pseudo trop court.";
    pseudoStatus.style.color = "red";
    return;
  }

  myName = name;
  pseudoStatus.textContent = `Pseudo validé : ${name}`;
  pseudoStatus.style.color = "green";

  pseudoInput.disabled = true;
  pseudoBtn.disabled = true;

  if (urlRoom) {
    pseudoStatus.textContent = `Connexion à la partie...`;
    pseudoStatus.style.color = "#2563eb";
    joinRoom(urlRoom);
  } else {
    btnPlay.classList.remove("hidden");
    if (playersSelect) playersSelect.classList.remove("hidden");
  }
});

// =========================
// CREATE ROOM (PLAY)
// =========================
btnPlay.addEventListener("click", async () => {
  if (!myName) {
    pseudoStatus.textContent = "Entre ton pseudo avant de jouer.";
    pseudoStatus.style.color = "red";
    return;
  }

  if (currentRoom) {
    showGame();
    return;
  }

  btnPlay.disabled = true;

  // ✨ Envoie le nombre de joueurs ET le nombre de rounds au serveur
  socket.emit("createRoom", { 
    name: myName, 
    maxPlayers: selectedPlayerCount,
    maxRounds: selectedMaxRounds 
  }, async ({ roomId }) => {
    currentRoom = roomId;

    window.history.replaceState({}, "", `?room=${roomId}`);

    btnCopyLink.classList.remove("hidden");

    const invite = getInviteLink(roomId);

    try {
      await navigator.clipboard.writeText(invite);
      pseudoStatus.textContent = "Room créée ✅ lien copié !";
      pseudoStatus.style.color = "green";
      showToast("Lien de la partie copié ✅");
    } catch {}

    btnPlay.disabled = false;
    showGame();
  });
});

// =========================
// JOIN ROOM
// =========================
function joinRoom(roomId) {
  socket.emit("joinRoom", { roomId, name: myName }, (res) => {
    if (res?.error) {
      pseudoStatus.textContent = res.error;
      pseudoStatus.style.color = "red";
      return;
    }
    currentRoom = roomId;
    showGame();
  });
}

// =========================
// COPY LINK
// =========================
btnCopyLink.addEventListener("click", async () => {
  if (!currentRoom) {
    pseudoStatus.textContent = "Crée une room avant de copier.";
    pseudoStatus.style.color = "red";
    return;
  }
  const link = getInviteLink(currentRoom);
  await navigator.clipboard.writeText(link);

  btnCopyLink.style.background = "#d1fae5";
  setTimeout(() => (btnCopyLink.style.background = ""), 400);

  showToast("Lien copié dans le presse-papier ✅");
});

// =========================
// BACK
// =========================
btnBack.addEventListener("click", () => showHome());

// =========================
// START GAME (host only)
// =========================
btnStartGame.addEventListener("click", () => {
  if (!currentRoom) return;
  socket.emit("startGame", { roomId: currentRoom });
});

// =========================
// DYNAMIC CARDS RENDER
// =========================
function renderPlayersDynamic() {
  if (!gamePanels) return;
  gamePanels.innerHTML = "";
  
  // ✨ Centre les cartes en mode solo
  const maxPlayers = players[0]?.maxPlayers || 3;
  if (maxPlayers === 1) {
    gamePanels.style.display = "flex";
    gamePanels.style.justifyContent = "center";
    gamePanels.style.alignItems = "flex-start";
  } else {
    gamePanels.style.display = "flex";
    gamePanels.style.justifyContent = "space-around";
    gamePanels.style.alignItems = "flex-start";
  }

  const me = players.find(p => p.id === socket.id);
  const others = players.filter(p => p.id !== socket.id);
  
  if (maxPlayers === 1) {
    // Mode solo : uniquement la carte du joueur centrée
    gamePanels.appendChild(buildAnswerCard(me));
  } else if (maxPlayers === 2) {
    // Mode 2 joueurs : adversaire à gauche, moi à droite
    const leftOpp = others[0] || null;
    gamePanels.appendChild(leftOpp ? buildOpponentCard(leftOpp) : buildEmptyOpponentCard());
    gamePanels.appendChild(buildAnswerCard(me));
  } else {
    // Mode 3 joueurs : adversaire gauche, moi centre, adversaire droite
    const leftOpp = others[0] || null;
    const rightOpp = others[1] || null;
    
    gamePanels.appendChild(leftOpp ? buildOpponentCard(leftOpp) : buildEmptyOpponentCard());
    gamePanels.appendChild(buildAnswerCard(me));
    gamePanels.appendChild(rightOpp ? buildOpponentCard(rightOpp) : buildEmptyOpponentCard());
  }
}

function buildOpponentCard(player) {
  const card = document.createElement("div");
  card.className = "player-card opponent-card";
  card.style.cssText = `
    background: linear-gradient(135deg, #ffffff 0%, #f8fafc 100%);
    border-radius: 16px;
    padding: 20px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.08);
    border: 2px solid #e2e8f0;
    min-width: 200px;
    transition: all 0.3s ease;
  `;

  const head = document.createElement("div");
  head.className = "player-head";
  head.style.cssText = `
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 16px;
  `;

  const avatar = document.createElement("div");
  avatar.className = "player-avatar";
  avatar.textContent = (player.name || "?")[0].toUpperCase();
  avatar.style.cssText = `
    width: 48px;
    height: 48px;
    border-radius: 50%;
    background: linear-gradient(135deg, #3b82f6, #2563eb);
    color: white;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 700;
    font-size: 20px;
    box-shadow: 0 4px 8px rgba(59, 130, 246, 0.3);
  `;

  const nameWrapper = document.createElement("div");
  nameWrapper.style.cssText = `flex: 1;`;

  const name = document.createElement("div");
  name.className = "player-name";
  name.textContent = player.name || "Adversaire";
  name.style.cssText = `
    font-weight: 700;
    font-size: 16px;
    color: #0f172a;
    margin-bottom: 4px;
  `;

  const score = document.createElement("div");
  score.className = "player-score";
  score.textContent = `${player.score ?? 0} pts`;
  score.style.cssText = `
    font-size: 13px;
    color: #64748b;
    font-weight: 600;
  `;

  nameWrapper.appendChild(name);
  nameWrapper.appendChild(score);
  head.appendChild(avatar);
  head.appendChild(nameWrapper);

  const guessBox = document.createElement("div");
  guessBox.className = "guess-box";
  const g = guessesMap[player.id];
  
  if (!revealed) {
    // Mode caché : effet de flou
    guessBox.textContent = g !== undefined ? "●●●" : "?";
    guessBox.style.cssText = `
      background: linear-gradient(135deg, #f1f5f9, #e2e8f0);
      border: 2px dashed #cbd5e1;
      border-radius: 12px;
      padding: 24px;
      text-align: center;
      font-size: 28px;
      font-weight: 700;
      color: #94a3b8;
      letter-spacing: 4px;
    `;
  } else {
    // Mode révélé : affiche le nombre
    guessBox.textContent = g ?? "?";
    const isCorrect = g === currentSolution;
    guessBox.style.cssText = `
      background: ${isCorrect ? 'linear-gradient(135deg, #10b981, #059669)' : 'linear-gradient(135deg, #ef4444, #dc2626)'};
      border: 2px solid ${isCorrect ? '#059669' : '#dc2626'};
      border-radius: 12px;
      padding: 24px;
      text-align: center;
      font-size: 36px;
      font-weight: 700;
      color: white;
      box-shadow: 0 4px 12px ${isCorrect ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'};
      animation: reveal 0.4s ease;
    `;
  }

  card.appendChild(head);
  card.appendChild(guessBox);

  return card;
}

function buildEmptyOpponentCard() {
  const card = document.createElement("div");
  card.className = "player-card opponent-card";
  card.style.cssText = `
    background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
    border-radius: 16px;
    padding: 20px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.05);
    border: 2px dashed #cbd5e1;
    min-width: 200px;
    opacity: 0.6;
  `;

  const head = document.createElement("div");
  head.className = "player-head";
  head.style.cssText = `
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 16px;
  `;

  const avatar = document.createElement("div");
  avatar.className = "player-avatar";
  avatar.textContent = "?";
  avatar.style.cssText = `
    width: 48px;
    height: 48px;
    border-radius: 50%;
    background: #cbd5e1;
    color: white;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 700;
    font-size: 20px;
  `;

  const nameWrapper = document.createElement("div");
  nameWrapper.style.cssText = `flex: 1;`;

  const name = document.createElement("div");
  name.className = "player-name";
  name.textContent = "En attente...";
  name.style.cssText = `
    font-weight: 700;
    font-size: 16px;
    color: #94a3b8;
    margin-bottom: 4px;
  `;

  const score = document.createElement("div");
  score.className = "player-score";
  score.textContent = "0 pts";
  score.style.cssText = `
    font-size: 13px;
    color: #cbd5e1;
    font-weight: 600;
  `;

  nameWrapper.appendChild(name);
  nameWrapper.appendChild(score);
  head.appendChild(avatar);
  head.appendChild(nameWrapper);

  const guessBox = document.createElement("div");
  guessBox.className = "guess-box";
  guessBox.textContent = "?";
  guessBox.style.cssText = `
    background: #f1f5f9;
    border: 2px dashed #cbd5e1;
    border-radius: 12px;
    padding: 24px;
    text-align: center;
    font-size: 28px;
    font-weight: 700;
    color: #cbd5e1;
  `;

  card.appendChild(head);
  card.appendChild(guessBox);

  return card;
}

function buildAnswerCard(me) {
  const card = document.createElement("div");
  card.className = "player-card answer-card";
  card.style.cssText = `
    background: linear-gradient(135deg, #ffffff 0%, #f0f9ff 100%);
    border-radius: 16px;
    padding: 24px;
    box-shadow: 0 8px 24px rgba(37, 99, 235, 0.15);
    border: 2px solid #3b82f6;
    min-width: 250px;
    transform: scale(1.05);
  `;

  if (me && me.name) {
    const playerHead = document.createElement("div");
    playerHead.className = "player-head";
    playerHead.style.cssText = `
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 16px;
      padding-bottom: 16px;
      border-bottom: 2px solid #e0f2fe;
    `;

    const avatar = document.createElement("div");
    avatar.className = "player-avatar";
    avatar.textContent = me.name[0].toUpperCase();
    avatar.style.cssText = `
      width: 52px;
      height: 52px;
      border-radius: 50%;
      background: linear-gradient(135deg, #3b82f6, #2563eb);
      color: white;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      font-size: 22px;
      box-shadow: 0 4px 12px rgba(59, 130, 246, 0.4);
    `;

    const nameWrapper = document.createElement("div");
    nameWrapper.style.cssText = `flex: 1;`;

    const name = document.createElement("div");
    name.className = "player-name";
    name.textContent = me.name;
    name.style.cssText = `
      font-weight: 700;
      font-size: 17px;
      color: #0f172a;
      margin-bottom: 4px;
    `;

    const score = document.createElement("div");
    score.textContent = `${me.score ?? 0} pts`;
    score.style.cssText = `
      font-size: 14px;
      color: #3b82f6;
      font-weight: 700;
    `;

    nameWrapper.appendChild(name);
    nameWrapper.appendChild(score);
    playerHead.appendChild(avatar);
    playerHead.appendChild(nameWrapper);
    card.appendChild(playerHead);
  }

  const title = document.createElement("div");
  title.className = "player-card-title";
  title.textContent = "Combien de Blocks ?";
  title.style.cssText = `
    font-size: 15px;
    font-weight: 700;
    color: #64748b;
    text-align: center;
    margin-bottom: 16px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  `;

  const body = document.createElement("div");
  body.className = "player-card-body";
  body.style.cssText = `
    display: flex;
    flex-direction: column;
    gap: 12px;
    align-items: center;
  `;

  const counter = document.createElement("button");
  counter.id = "counter-btn";
  counter.className = "counter-btn";
  counter.textContent = currentCount;
  counter.style.cssText = `
    width: 120px;
    height: 120px;
    border-radius: 16px;
    background: linear-gradient(135deg, #3b82f6, #2563eb);
    color: white;
    font-size: 48px;
    font-weight: 700;
    border: none;
    cursor: pointer;
    box-shadow: 0 8px 20px rgba(59, 130, 246, 0.35);
    transition: all 0.2s ease;
  `;

  counter.addEventListener("click", () => {
    if (revealed || round === 0) return;
    currentCount++;
    counter.textContent = currentCount;
    counter.style.transform = "scale(0.95)";
    setTimeout(() => counter.style.transform = "scale(1)", 100);
  });

  counter.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    if (revealed || round === 0) return;
    if (currentCount > 0) currentCount--;
    counter.textContent = currentCount;
    counter.style.transform = "scale(0.95)";
    setTimeout(() => counter.style.transform = "scale(1)", 100);
  });

  const submit = document.createElement("button");
  submit.id = "btn-submit-answer";
  submit.textContent = "✓ Valider";
  submit.style.cssText = `
    padding: 12px 32px;
    border-radius: 999px;
    background: linear-gradient(90deg, #10b981, #059669);
    color: white;
    font-weight: 700;
    border: none;
    cursor: pointer;
    font-size: 15px;
    box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);
    transition: all 0.2s ease;
  `;

  submit.addEventListener("click", () => {
    if (!currentRoom || revealed || round === 0) return;
    
    // ✨ Vérification console
    console.log("🎯 Envoi réponse:", currentCount);
    
    socket.emit("sendGuess", { roomId: currentRoom, guess: currentCount });

    if (answerFeedbackEl) {
      answerFeedbackEl.textContent = "✓ Réponse envoyée";
      answerFeedbackEl.style.color = "#10b981";
    }
    
    submit.disabled = true;
    submit.style.opacity = "0.5";
    submit.style.cursor = "not-allowed";
    submit.textContent = "✓ Envoyé";
  });

  const feedback = document.createElement("div");
  feedback.id = "answer-feedback";
  feedback.textContent = "";
  feedback.style.cssText = `
    color: #64748b;
    font-size: 14px;
    font-weight: 600;
    text-align: center;
    min-height: 20px;
  `;
  answerFeedbackEl = feedback;

  const newRoundBtn = document.createElement("button");
  newRoundBtn.id = "btn-new-round";
  newRoundBtn.textContent = "🔄 Nouvelle manche";
  newRoundBtn.style.cssText = `
    display: none;
    margin-top: 12px;
    padding: 12px 28px;
    border-radius: 999px;
    border: none;
    cursor: pointer;
    font-weight: 700;
    font-size: 15px;
    color: white;
    background: linear-gradient(90deg, #3b82f6, #2563eb);
    box-shadow: 0 6px 16px rgba(59, 130, 246, 0.4);
    transition: all 0.2s ease;
    width: 100%;
  `;
  
  newRoundBtn.addEventListener("mouseenter", () => {
    newRoundBtn.style.transform = "translateY(-2px)";
    newRoundBtn.style.boxShadow = "0 8px 20px rgba(59, 130, 246, 0.5)";
  });
  
  newRoundBtn.addEventListener("mouseleave", () => {
    newRoundBtn.style.transform = "translateY(0)";
    newRoundBtn.style.boxShadow = "0 6px 16px rgba(59, 130, 246, 0.4)";
  });

  newRoundBtn.addEventListener("click", () => {
    if (!currentRoom) {
      console.error("❌ Pas de room active");
      return;
    }
    
    console.log("🔄 Lancement nouvelle manche...");
    socket.emit("newRound", { roomId: currentRoom });
    
    // Cache le bouton immédiatement
    newRoundBtn.style.display = "none";
  });

  newRoundBtnEl = newRoundBtn;

  body.appendChild(counter);
  body.appendChild(submit);
  body.appendChild(feedback);
  body.appendChild(newRoundBtn);

  card.appendChild(title);
  card.appendChild(body);

  return card;
}

// =========================
// SOCKET LISTENERS
// =========================

function showResultPopup(isCorrect, solution) {
  // Crée l'overlay de résultat
  const overlay = document.createElement("div");
  overlay.id = "result-overlay";
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.85);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    z-index: 9999;
    backdrop-filter: blur(10px);
    animation: fadeIn 0.3s ease;
  `;
  
  const resultContainer = document.createElement("div");
  resultContainer.style.cssText = `
    text-align: center;
    animation: bounceIn 0.5s ease;
  `;
  
  // Emoji et texte selon le résultat
  const emoji = document.createElement("div");
  emoji.style.cssText = `
    font-size: 100px;
    margin-bottom: 20px;
    animation: pulse 1s ease infinite;
  `;
  emoji.textContent = isCorrect ? "🎉" : "😢";
  
  const resultText = document.createElement("div");
  resultText.style.cssText = `
    font-size: 48px;
    font-weight: 900;
    color: white;
    margin-bottom: 16px;
    text-shadow: 0 0 30px ${isCorrect ? 'rgba(16, 185, 129, 0.8)' : 'rgba(239, 68, 68, 0.8)'};
  `;
  resultText.textContent = isCorrect ? "CORRECT !" : "PERDU !";
  
  const solutionText = document.createElement("div");
  solutionText.style.cssText = `
    font-size: 24px;
    color: rgba(255, 255, 255, 0.8);
    font-weight: 600;
  `;
  solutionText.textContent = `La réponse était : ${solution}`;
  
  // Animations CSS
  const style = document.createElement("style");
  style.textContent = `
    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }
    @keyframes bounceIn {
      0% { transform: scale(0.3); opacity: 0; }
      50% { transform: scale(1.05); }
      70% { transform: scale(0.9); }
      100% { transform: scale(1); opacity: 1; }
    }
    @keyframes pulse {
      0%, 100% { transform: scale(1); }
      50% { transform: scale(1.1); }
    }
  `;
  document.head.appendChild(style);
  
  resultContainer.appendChild(emoji);
  resultContainer.appendChild(resultText);
  resultContainer.appendChild(solutionText);
  overlay.appendChild(resultContainer);
  document.body.appendChild(overlay);
  
  // Disparaît après 3 secondes
  setTimeout(() => {
    overlay.style.animation = "fadeOut 0.3s ease";
    overlay.style.opacity = "0";
    setTimeout(() => {
      overlay.remove();
      style.remove();
    }, 300);
  }, 3000);
}

// ✨ NOUVEAU: Gestion du compte à rebours
socket.on("countdown", ({ seconds }) => {
  console.log("⏱️ Compte à rebours reçu:", seconds);
  
  // Cache le bouton et le banner
  btnStartGame.classList.add("hidden");
  waitingBanner.classList.add("hidden");
  
  // Affiche le compte à rebours
  showCountdown(seconds);
});

function showCountdown(seconds) {
  // Crée l'overlay de compte à rebours
  const overlay = document.createElement("div");
  overlay.id = "countdown-overlay";
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.8);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 9999;
    backdrop-filter: blur(8px);
  `;
  
  const countdownNumber = document.createElement("div");
  countdownNumber.id = "countdown-number";
  countdownNumber.style.cssText = `
    font-size: 120px;
    font-weight: 900;
    color: white;
    text-shadow: 0 0 40px rgba(59, 130, 246, 0.8);
    animation: countdownPulse 1s ease-in-out;
  `;
  
  // Animation CSS
  const style = document.createElement("style");
  style.textContent = `
    @keyframes countdownPulse {
      0% { transform: scale(0.5); opacity: 0; }
      50% { transform: scale(1.2); opacity: 1; }
      100% { transform: scale(1); opacity: 1; }
    }
  `;
  document.head.appendChild(style);
  
  overlay.appendChild(countdownNumber);
  document.body.appendChild(overlay);
  
  let currentSeconds = seconds;
  countdownNumber.textContent = currentSeconds;
  
  const interval = setInterval(() => {
    currentSeconds--;
    
    if (currentSeconds > 0) {
      countdownNumber.textContent = currentSeconds;
      countdownNumber.style.animation = "none";
      setTimeout(() => {
        countdownNumber.style.animation = "countdownPulse 1s ease-in-out";
      }, 10);
    } else {
      countdownNumber.textContent = "GO!";
      countdownNumber.style.color = "#10b981";
      countdownNumber.style.textShadow = "0 0 40px rgba(16, 185, 129, 0.8)";
      
      setTimeout(() => {
        overlay.remove();
        style.remove();
      }, 800);
      
      clearInterval(interval);
    }
  }, 1000);
}

socket.on("roomState", (state) => {
  players = state.players;
  revealed = state.revealed;
  hostId = state.hostId;
  round = state.round;

  console.log("🎮 Room State:", { players, round, hostId, myId: socket.id });

  if (round === 0) {
    clearCanvas();
    if (socket.id === hostId) {
      console.log("✅ Je suis l'hôte, affichage du bouton Start");
      btnStartGame.classList.remove("hidden");
      waitingBanner.classList.add("hidden");
    } else {
      console.log("⏳ Je ne suis pas l'hôte, affichage du banner");
      btnStartGame.classList.add("hidden");
      waitingBanner.classList.remove("hidden");
    }
  } else {
    btnStartGame.classList.add("hidden");
    waitingBanner.classList.add("hidden");
  }

  renderPlayersDynamic();
  updateInfo(round);
});

socket.on("guessUpdate", (guesses) => {
  guessesMap = guesses;
  renderPlayersDynamic();
});

socket.on("revealRound", ({ solution, players: newPlayers }) => {
  revealed = true;
  currentSolution = solution;
  players = newPlayers;

  console.log("🎉 Révélation - Solution:", solution, "| Je suis l'hôte ?", socket.id === hostId);

  // ✨ Vérifie si le joueur a gagné ou perdu
  const myGuess = guessesMap[socket.id];
  const isCorrect = myGuess === solution;
  
  // Affiche le popup de résultat
  showResultPopup(isCorrect, solution);

  // ✨ IMPORTANT: Rafraîchir les cartes AVANT d'afficher le feedback
  renderPlayersDynamic();

  // Maintenant on peut accéder au feedback et au bouton qui viennent d'être recréés
  const feedback = document.getElementById("answer-feedback");
  const newRoundBtn = document.getElementById("btn-new-round");

  if (feedback) {
    feedback.textContent = `La bonne réponse était ${solution}.`;
    feedback.style.color = "#2563eb";
  }

  // ✨ Relance automatique après 5 secondes (uniquement pour l'hôte)
  if (socket.id === hostId) {
    console.log("⏰ Relance automatique dans 5 secondes...");
    
    setTimeout(() => {
      console.log("🔄 Lancement automatique nouvelle manche");
      socket.emit("newRound", { roomId: currentRoom });
    }, 5000);
  } else {
    console.log("⏳ Pas l'hôte, attente du prochain round");
  }
});

socket.on("newRoundStart", ({ round: srvRound, players: newPlayers, activeBlocks }) => {
  console.log("🎮 Nouveau round:", srvRound, "| Blocs actifs:", activeBlocks?.length);
  
  round = srvRound;
  players = newPlayers;
  guessesMap = {};
  revealed = false;
  currentSolution = null;
  currentCount = 0; // ✨ Reset le compteur

  currentActiveBlocks = activeBlocks || [];

  if (answerFeedbackEl) {
    answerFeedbackEl.textContent = "";
    answerFeedbackEl.style.color = "#6b7280";
  }

  if (newRoundBtnEl) {
    newRoundBtnEl.style.display = "none";
  }

  renderPlayersDynamic();
  updateInfo(round);
  
  drawGridFlash1s();
});

// ✨ NOUVEAU: Gestion de la fin de partie
socket.on("gameOver", ({ players: finalPlayers, maxRounds }) => {
  console.log("🏁 Partie terminée !");
  showFinalScoreboard(finalPlayers, maxRounds);
});

function showFinalScoreboard(finalPlayers, maxRounds) {
  // Trie les joueurs par score décroissant
  const sortedPlayers = [...finalPlayers].sort((a, b) => (b.score || 0) - (a.score || 0));
  
  const overlay = document.createElement("div");
  overlay.id = "scoreboard-overlay";
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.9);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 9999;
    backdrop-filter: blur(10px);
    animation: fadeIn 0.5s ease;
  `;
  
  const scoreboardContainer = document.createElement("div");
  scoreboardContainer.style.cssText = `
    background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
    border-radius: 24px;
    padding: 40px;
    max-width: 600px;
    width: 90%;
    box-shadow: 0 20px 60px rgba(0,0,0,0.5);
    animation: bounceIn 0.6s ease;
  `;
  
  // Titre
  const title = document.createElement("h2");
  title.textContent = "🏆 PARTIE TERMINÉE";
  title.style.cssText = `
    text-align: center;
    font-size: 36px;
    font-weight: 900;
    color: white;
    margin-bottom: 10px;
    text-shadow: 0 0 20px rgba(59, 130, 246, 0.6);
  `;
  
  const subtitle = document.createElement("p");
  subtitle.textContent = `${maxRounds} rounds joués`;
  subtitle.style.cssText = `
    text-align: center;
    color: rgba(255,255,255,0.6);
    font-size: 16px;
    margin-bottom: 30px;
  `;
  
  scoreboardContainer.appendChild(title);
  scoreboardContainer.appendChild(subtitle);
  
  // Tableau des scores
  sortedPlayers.forEach((player, index) => {
    const playerRow = document.createElement("div");
    playerRow.style.cssText = `
      display: flex;
      align-items: center;
      justify-content: space-between;
      background: ${index === 0 ? 'linear-gradient(90deg, rgba(251,191,36,0.2), transparent)' : 'rgba(255,255,255,0.05)'};
      border: 2px solid ${index === 0 ? '#fbbf24' : 'rgba(255,255,255,0.1)'};
      border-radius: 16px;
      padding: 16px 20px;
      margin-bottom: 12px;
      transition: all 0.3s ease;
    `;
    
    const leftSide = document.createElement("div");
    leftSide.style.cssText = `display: flex; align-items: center; gap: 16px;`;
    
    const rank = document.createElement("div");
    rank.textContent = index === 0 ? "🥇" : index === 1 ? "🥈" : index === 2 ? "🥉" : `#${index + 1}`;
    rank.style.cssText = `
      font-size: 24px;
      font-weight: 900;
      min-width: 40px;
    `;
    
    const avatar = document.createElement("div");
    avatar.textContent = (player.name || "?")[0].toUpperCase();
    avatar.style.cssText = `
      width: 48px;
      height: 48px;
      border-radius: 50%;
      background: linear-gradient(135deg, #3b82f6, #2563eb);
      color: white;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      font-size: 20px;
    `;
    
    const name = document.createElement("div");
    name.textContent = player.name || "Joueur";
    name.style.cssText = `
      color: white;
      font-weight: 700;
      font-size: 18px;
    `;
    
    const score = document.createElement("div");
    score.textContent = `${player.score || 0} pts`;
    score.style.cssText = `
      color: ${index === 0 ? '#fbbf24' : '#3b82f6'};
      font-weight: 900;
      font-size: 24px;
    `;
    
    leftSide.appendChild(rank);
    leftSide.appendChild(avatar);
    leftSide.appendChild(name);
    playerRow.appendChild(leftSide);
    playerRow.appendChild(score);
    
    scoreboardContainer.appendChild(playerRow);
  });
  
  // Bouton retour
  const backBtn = document.createElement("button");
  backBtn.textContent = "🏠 Retour au menu";
  backBtn.style.cssText = `
    width: 100%;
    margin-top: 30px;
    padding: 16px;
    border-radius: 12px;
    border: none;
    background: linear-gradient(90deg, #3b82f6, #2563eb);
    color: white;
    font-weight: 700;
    font-size: 16px;
    cursor: pointer;
    box-shadow: 0 8px 20px rgba(59, 130, 246, 0.4);
    transition: all 0.2s ease;
  `;
  
  backBtn.addEventListener("click", () => {
    overlay.remove();
    showHome();
    // Reset l'état
    currentRoom = null;
    round = 0;
    players = [];
  });
  
  scoreboardContainer.appendChild(backBtn);
  overlay.appendChild(scoreboardContainer);
  document.body.appendChild(overlay);
}

function updateInfo(r) {
  const n = players.length || 1;
  gameInfo.textContent = `${n} joueur(s) – Round ${r}`;
}

// =========================
// CANVAS GRID 3D ISOMETRIC
// =========================
function resizeCanvas() {
  const wrapper = $("grid-wrapper");
  if (!wrapper) return;
  const rect = wrapper.getBoundingClientRect();
  canvas.width = rect.width - 20;
  canvas.height = rect.height - 20;
}

function clearCanvas() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
}

function drawIsometricBlock(x, y, blockSize, color = "#3b82f6") {
  const height = blockSize * 0.8; // ✨ RÉDUIT de 1.5 à 0.8

  const isoX = (x - y) * (blockSize / 2);
  const isoY = (x + y) * (blockSize / 4);

  // Face gauche (sombre)
  ctx.fillStyle = shadeColor(color, -30);
  ctx.beginPath();
  ctx.moveTo(isoX, isoY);
  ctx.lineTo(isoX - blockSize / 2, isoY + blockSize / 4);
  ctx.lineTo(isoX - blockSize / 2, isoY + blockSize / 4 - height);
  ctx.lineTo(isoX, isoY - height);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.3)";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Face droite (moyenne)
  ctx.fillStyle = shadeColor(color, -10);
  ctx.beginPath();
  ctx.moveTo(isoX, isoY);
  ctx.lineTo(isoX + blockSize / 2, isoY + blockSize / 4);
  ctx.lineTo(isoX + blockSize / 2, isoY + blockSize / 4 - height);
  ctx.lineTo(isoX, isoY - height);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.3)";
  ctx.stroke();

  // Face dessus (claire avec dégradé)
  const gradient = ctx.createLinearGradient(
    isoX - blockSize / 2, isoY - blockSize / 4 - height,
    isoX + blockSize / 2, isoY + blockSize / 4 - height
  );
  gradient.addColorStop(0, shadeColor(color, 25));
  gradient.addColorStop(1, shadeColor(color, 5));
  
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.moveTo(isoX, isoY - height);
  ctx.lineTo(isoX - blockSize / 2, isoY + blockSize / 4 - height);
  ctx.lineTo(isoX, isoY + blockSize / 2 - height);
  ctx.lineTo(isoX + blockSize / 2, isoY + blockSize / 4 - height);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.2)";
  ctx.stroke();
}

function shadeColor(color, percent) {
  const num = parseInt(color.replace("#", ""), 16);
  const amt = Math.round(2.55 * percent);
  const R = Math.min(255, Math.max(0, (num >> 16) + amt));
  const G = Math.min(255, Math.max(0, ((num >> 8) & 0x00ff) + amt));
  const B = Math.min(255, Math.max(0, (num & 0x0000ff) + amt));
  return `#${(0x1000000 + R * 0x10000 + G * 0x100 + B).toString(16).slice(1)}`;
}

function drawIsometricFloor(cols, rows, blockSize, offsetX, offsetY) {
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const x = offsetX + col;
      const y = offsetY + row;

      const isoX = (x - y) * (blockSize / 2);
      const isoY = (x + y) * (blockSize / 4);

      const isLight = (col + row) % 2 === 0;
      const baseColor = isLight ? "#2a2a2a" : "#1f1f1f";
      
      const gradient = ctx.createLinearGradient(
        isoX - blockSize / 2, isoY,
        isoX + blockSize / 2, isoY + blockSize / 2
      );
      gradient.addColorStop(0, baseColor);
      gradient.addColorStop(1, shadeColor(baseColor, -8));
      
      ctx.fillStyle = gradient;

      ctx.beginPath();
      ctx.moveTo(isoX, isoY);
      ctx.lineTo(isoX - blockSize / 2, isoY + blockSize / 4);
      ctx.lineTo(isoX, isoY + blockSize / 2);
      ctx.lineTo(isoX + blockSize / 2, isoY + blockSize / 4);
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = "rgba(255,255,255,0.03)";
      ctx.lineWidth = 0.5;
      ctx.stroke();
    }
  }
}

function drawGridOnce(active = []) {
  const cols = 6;
  const rows = 4;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Fond plus simple
  ctx.fillStyle = "#0f0f0f";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const blockSize = Math.min(canvas.width / (cols + rows + 2), canvas.height / (rows + 3)) * 1.5; // ✨ Réduit de 1.8 à 1.5

  // Ajuste les offsets pour centrer la grille
  const offsetX = -cols / 2;
  const offsetY = -rows / 2;

  ctx.save();

  // ✨ Centre avec ajustement vertical (légèrement plus bas)
  ctx.translate(canvas.width / 2, canvas.height / 2 + blockSize * 0.2);

  // Dessine le sol
  drawIsometricFloor(cols, rows, blockSize, offsetX, offsetY);

  // Trie les blocs par profondeur
  const sortedBlocks = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const idx = r * cols + c;
      if (active.includes(idx)) {
        sortedBlocks.push({ row: r, col: c, depth: r + c, idx });
      }
    }
  }
  
  sortedBlocks.sort((a, b) => a.depth - b.depth);

  // Dessine les ombres
  ctx.globalAlpha = 0.25;
  for (const block of sortedBlocks) {
    const x = offsetX + block.col;
    const y = offsetY + block.row;
    const isoX = (x - y) * (blockSize / 2);
    const isoY = (x + y) * (blockSize / 4);
    
    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.ellipse(isoX, isoY + blockSize / 3.5, blockSize * 0.35, blockSize * 0.18, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1.0;

  // Dessine les blocs
  for (const block of sortedBlocks) {
    const x = offsetX + block.col;
    const y = offsetY + block.row;
    drawIsometricBlock(x, y, blockSize, "#3b82f6");
  }

  ctx.restore();
}

function drawGridFlash1s() {
  drawGridOnce(currentActiveBlocks);
  
  setTimeout(() => {
    clearCanvas();
  }, 1000);
}

window.addEventListener("resize", () => {
  if (!screenGame.classList.contains("hidden")) {
    resizeCanvas();
    if (currentActiveBlocks.length > 0 && !revealed) {
      clearCanvas();
    }
  }
});