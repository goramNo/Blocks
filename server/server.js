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
//     round: 0 // 0=lobby
//   }
// }
const rooms = {};

function makeRoomId() {
  return Math.random().toString(36).slice(2, 8);
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
    round: room.round
  });
}

io.on("connection", (socket) => {
  console.log("connect:", socket.id);

  socket.on("createRoom", ({ name }, cb) => {
    const roomId = makeRoomId();

    rooms[roomId] = {
      hostId: socket.id,
      players: [{ id: socket.id, name, score: 0 }],
      guesses: {},
      revealed: false,
      solution: null,
      round: 0
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

    room.round = 1;
    room.revealed = false;
    room.guesses = {};
    room.solution = 9; // TODO: vraie solution plus tard

    io.to(roomId).emit("newRoundStart", {
      round: room.round,
      players: room.players
    });

    broadcastRoom(roomId);
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

    room.round += 1;
    room.revealed = false;
    room.guesses = {};
    room.solution = 9; // TODO: générer vraie grille

    io.to(roomId).emit("newRoundStart", {
      round: room.round,
      players: room.players
    });

    broadcastRoom(roomId);
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
  console.log("Server listening on", PORT);
});
