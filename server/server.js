const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

const PORT = 3000;

// rooms = {
//   [roomId]: {
//     hostId,
//     players: [{id,name,score}],
//     guesses: { socketId: number },
//     revealed: false,
//     solution: number,
//     round: 0, // 0=lobby
//     activeBlocks: [array of indices]
//   }
// }
const rooms = {};

function makeRoomId() {
  return Math.random().toString(36).slice(2, 8);
}

// ✨ NOUVELLE FONCTION: Génère une grille aléatoire
function generateRandomGrid() {
  const totalCells = 24; // 6 colonnes × 4 lignes
  const minBlocks = 3;
  const maxBlocks = 12;
  
  // Nombre aléatoire de blocs
  const numBlocks = Math.floor(Math.random() * (maxBlocks - minBlocks + 1)) + minBlocks;
  
  const activeBlocks = [];
  const available = Array.from({ length: totalCells }, (_, i) => i);
  
  // Sélection aléatoire sans doublons
  for (let i = 0; i < numBlocks; i++) {
    const randomIndex = Math.floor(Math.random() * available.length);
    activeBlocks.push(available[randomIndex]);
    available.splice(randomIndex, 1);
  }
  
  return activeBlocks.sort((a, b) => a - b);
}

function broadcastRoom(roomId) {
  const room = rooms[roomId];
  if (!room) return;
  
  io.to(roomId).emit("roomState", {
    roomId,
    hostId: room.hostId,
    players: room.players,
    guesses: room.guesses,
    revealed: room.revealed,
    solution: room.solution,
    round: room.round,
    maxPlayers: room.maxPlayers,
    maxRounds: room.maxRounds // ✨ Ajouté
  });
}

io.on("connection", (socket) => {
  console.log("connect:", socket.id);

  socket.on("createRoom", ({ name, maxPlayers, maxRounds }, cb) => {
    const roomId = makeRoomId();
    
    // ✨ Stocke le nombre max de joueurs et de rounds
    const maxP = maxPlayers || 3;
    const maxR = maxRounds || 5;
    
    rooms[roomId] = {
      hostId: socket.id,
      players: [{ id: socket.id, name, score: 0, maxPlayers: maxP }],
      guesses: {},
      revealed: false,
      solution: null,
      round: 0,
      activeBlocks: [],
      maxPlayers: maxP,
      maxRounds: maxR // ✨ Ajouté
    };
    socket.join(roomId);
    cb({ roomId });
    broadcastRoom(roomId);
  });

  socket.on("joinRoom", ({ roomId, name }, cb) => {
    const room = rooms[roomId];
    if (!room) return cb({ error: "Partie introuvable" });
    
    const existing = room.players.find(p => p.id === socket.id);
    if (!existing) {
      room.players.push({ id: socket.id, name, score: 0 });
    }
    
    socket.join(roomId);
    cb({ ok: true });
    broadcastRoom(roomId);
  });

  // Host lance la partie (round 1)
  socket.on("startGame", ({ roomId }) => {
    const room = rooms[roomId];
    if (!room) return;
    if (socket.id !== room.hostId) return;
    
    console.log("🚀 startGame - Envoi countdown"); // ✨ Debug
    
    // ✨ Envoie le signal de compte à rebours
    io.to(roomId).emit("countdown", { seconds: 3 });
    
    // ✨ Démarre le round après 5 secondes (3s countdown + 1s "GO!" + 1s buffer)
    setTimeout(() => {
      room.round = 1;
      room.revealed = false;
      room.guesses = {};
      
      // Génère une nouvelle grille
      room.activeBlocks = generateRandomGrid();
      room.solution = room.activeBlocks.length;
      
      console.log(`✅ Round 1 démarré - Solution: ${room.solution}`); // ✨ Debug
      
      // Envoie la grille aux clients
      io.to(roomId).emit("newRoundStart", {
        round: room.round,
        players: room.players,
        activeBlocks: room.activeBlocks
      });
      
      broadcastRoom(roomId);
    }, 5000); // ✨ 5 secondes pour laisser le temps au "GO!"
  });

  socket.on("sendGuess", ({ roomId, guess }) => {
    const room = rooms[roomId];
    if (!room || room.round === 0 || room.revealed) return;
    
    room.guesses[socket.id] = guess;
    io.to(roomId).emit("guessUpdate", room.guesses);
    
    // si tout le monde a répondu → reveal auto
    if (Object.keys(room.guesses).length === room.players.length) {
      room.revealed = true;
      
      // scoring simple: +1 si exact
      room.players = room.players.map(p => {
        const g = room.guesses[p.id];
        if (g === room.solution) return { ...p, score: (p.score || 0) + 1 };
        return p;
      });
      
      io.to(roomId).emit("revealRound", {
        solution: room.solution,
        players: room.players
      });
      
      broadcastRoom(roomId);
    }
  });

  socket.on("newRound", ({ roomId }) => {
    const room = rooms[roomId];
    if (!room) return;
    if (socket.id !== room.hostId) return;
    
    // ✨ Vérifie si la partie est terminée
    if (room.round >= room.maxRounds) {
      console.log(`🏁 Partie terminée - ${room.round}/${room.maxRounds} rounds`);
      
      // Envoie le signal de fin de partie
      io.to(roomId).emit("gameOver", {
        players: room.players,
        maxRounds: room.maxRounds
      });
      
      return;
    }
    
    // ✨ Envoie le signal de compte à rebours
    io.to(roomId).emit("countdown", { seconds: 3 });
    
    // ✨ Démarre le nouveau round après 5 secondes (3s countdown + 1s "GO!" + 1s buffer)
    setTimeout(() => {
      room.round += 1;
      room.revealed = false;
      room.guesses = {};
      
      // Génère une nouvelle grille
      room.activeBlocks = generateRandomGrid();
      room.solution = room.activeBlocks.length;
      
      // Envoie la nouvelle grille
      io.to(roomId).emit("newRoundStart", {
        round: room.round,
        players: room.players,
        activeBlocks: room.activeBlocks
      });
      
      broadcastRoom(roomId);
    }, 5000); // ✨ 5 secondes pour laisser le temps au "GO!"
  });

  socket.on("disconnect", () => {
    console.log("disconnect:", socket.id);
    
    for (const roomId of Object.keys(rooms)) {
      const room = rooms[roomId];
      room.players = room.players.filter(p => p.id !== socket.id);
      delete room.guesses[socket.id];
      
      // si host part → on donne host au premier joueur
      if (room.hostId === socket.id) {
        room.hostId = room.players[0]?.id || null;
      }
      
      if (room.players.length === 0) {
        delete rooms[roomId];
      } else {
        broadcastRoom(roomId);
      }
    }
  });
});

server.listen(PORT, () => {
  console.log(`🚀 Server listening on http://localhost:${PORT}`);
});