const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const rateLimit = require("express-rate-limit");

const app = express();

// ✅ CORS sécurisé (uniquement ton domaine)
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? 'https://dracks.online' 
    : ['http://localhost:3000', 'http://127.0.0.1:3000'],
  credentials: true
}));

// ✅ Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Max 100 requêtes
  message: 'Trop de requêtes, réessayez plus tard'
});
app.use(limiter);

const server = http.createServer(app);
const io = new Server(server, {
  cors: { 
    origin: process.env.NODE_ENV === 'production'
      ? 'https://dracks.online'
      : ['http://localhost:3000', 'http://127.0.0.1:3000'],
    credentials: true
  }
});

const PORT = process.env.PORT || 3000;

const rooms = {};

// ✅ Fonction de validation
function validateString(str, minLen = 1, maxLen = 20) {
  return typeof str === 'string' && str.trim().length >= minLen && str.length <= maxLen;
}

function validateNumber(num, min, max) {
  return typeof num === 'number' && num >= min && num <= max && Number.isInteger(num);
}

function makeRoomId() {
  return Math.random().toString(36).slice(2, 8);
}

function generateRandomGrid() {
  const totalCells = 24;
  const minBlocks = 3;
  const maxBlocks = 12;
  
  const numBlocks = Math.floor(Math.random() * (maxBlocks - minBlocks + 1)) + minBlocks;
  
  const activeBlocks = [];
  const available = Array.from({ length: totalCells }, (_, i) => i);
  
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
    maxRounds: room.maxRounds
  });
}

io.on("connection", (socket) => {
  console.log("connect:", socket.id);

  socket.on("createRoom", ({ name, maxPlayers, maxRounds }, cb) => {
    // ✅ VALIDATION
    if (!validateString(name, 3, 20)) {
      return cb({ error: "Pseudo invalide (3-20 caractères)" });
    }
    
    if (!validateNumber(maxPlayers, 1, 3)) {
      return cb({ error: "Nombre de joueurs invalide (1-3)" });
    }
    
    if (!validateNumber(maxRounds, 3, 20)) {
      return cb({ error: "Nombre de rounds invalide (3-20)" });
    }
    
    const roomId = makeRoomId();
    const maxP = maxPlayers || 3;
    const maxR = maxRounds || 5;
    
    rooms[roomId] = {
      hostId: socket.id,
      players: [{ id: socket.id, name: name.trim(), score: 0, maxPlayers: maxP }],
      guesses: {},
      revealed: false,
      solution: null,
      round: 0,
      activeBlocks: [],
      maxPlayers: maxP,
      maxRounds: maxR
    };
    socket.join(roomId);
    cb({ roomId });
    broadcastRoom(roomId);
  });

  socket.on("joinRoom", ({ roomId, name }, cb) => {
    // ✅ VALIDATION
    if (!validateString(name, 3, 20)) {
      return cb({ error: "Pseudo invalide (3-20 caractères)" });
    }
    
    if (!validateString(roomId, 6, 6)) {
      return cb({ error: "Room ID invalide" });
    }
    
    const room = rooms[roomId];
    if (!room) return cb({ error: "Partie introuvable" });
    
    if (room.players.length >= room.maxPlayers) {
      return cb({ error: "Partie complète" });
    }
    
    const existing = room.players.find(p => p.id === socket.id);
    if (!existing) {
      room.players.push({ id: socket.id, name: name.trim(), score: 0 });
    }
    
    socket.join(roomId);
    cb({ ok: true });
    broadcastRoom(roomId);
  });

  socket.on("startGame", ({ roomId }) => {
    const room = rooms[roomId];
    if (!room) return;
    
    // ✅ Seul l'hôte peut démarrer
    if (socket.id !== room.hostId) {
      console.warn(`⚠️ ${socket.id} tente de start sans être host`);
      return;
    }
    
    console.log("🚀 startGame - Envoi countdown");
    
    io.to(roomId).emit("countdown", { seconds: 3 });
    
    setTimeout(() => {
      room.round = 1;
      room.revealed = false;
      room.guesses = {};
      
      room.activeBlocks = generateRandomGrid();
      room.solution = room.activeBlocks.length;
      
      console.log(`✅ Round 1 démarré - Solution: ${room.solution}`);
      
      // ⚠️ NE JAMAIS envoyer activeBlocks au client !
      io.to(roomId).emit("newRoundStart", {
        round: room.round,
        players: room.players
        // activeBlocks retiré pour éviter la triche
      });
      
      broadcastRoom(roomId);
    }, 5000);
  });

  socket.on("sendGuess", ({ roomId, guess }) => {
    const room = rooms[roomId];
    if (!room || room.round === 0 || room.revealed) return;
    
    // ✅ VALIDATION stricte
    if (!validateNumber(guess, 0, 24)) {
      console.warn(`⚠️ Guess invalide de ${socket.id}: ${guess}`);
      return;
    }
    
    // ✅ Empêche de voter plusieurs fois
    if (room.guesses[socket.id] !== undefined) {
      console.warn(`⚠️ ${socket.id} tente de voter plusieurs fois`);
      return;
    }
    
    room.guesses[socket.id] = guess;
    io.to(roomId).emit("guessUpdate", room.guesses);
    
    if (Object.keys(room.guesses).length === room.players.length) {
      room.revealed = true;
      
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
    
    // ✅ Seul l'hôte peut lancer un nouveau round
    if (socket.id !== room.hostId) {
      console.warn(`⚠️ ${socket.id} tente newRound sans être host`);
      return;
    }
    
    if (room.round >= room.maxRounds) {
      console.log(`🏁 Partie terminée - ${room.round}/${room.maxRounds} rounds`);
      
      io.to(roomId).emit("gameOver", {
        players: room.players,
        maxRounds: room.maxRounds
      });
      
      return;
    }
    
    io.to(roomId).emit("countdown", { seconds: 3 });
    
    setTimeout(() => {
      room.round += 1;
      room.revealed = false;
      room.guesses = {};
      
      room.activeBlocks = generateRandomGrid();
      room.solution = room.activeBlocks.length;
      
      // ⚠️ NE JAMAIS envoyer activeBlocks !
      io.to(roomId).emit("newRoundStart", {
        round: room.round,
        players: room.players
      });
      
      broadcastRoom(roomId);
    }, 5000);
  });

  socket.on("disconnect", () => {
    console.log("disconnect:", socket.id);
    
    for (const roomId of Object.keys(rooms)) {
      const room = rooms[roomId];
      room.players = room.players.filter(p => p.id !== socket.id);
      delete room.guesses[socket.id];
      
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

app.use(express.static('../'));

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/../index.html');
});

server.listen(PORT, () => {
  console.log(`🚀 Server listening on http://localhost:${PORT}`);
});