const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

let rooms = {}; // { roomId: { players: [], guesses: {} } }

function generateRoomId() {
    return Math.random().toString(36).substring(2, 8);
}

io.on("connection", (socket) => {
    console.log("Nouvelle connexion :", socket.id);

    // 🟢 Créer une partie
    socket.on("createRoom", (pseudo, callback) => {
        const roomId = generateRoomId();
        rooms[roomId] = {
            players: [{ id: socket.id, pseudo }],
            guesses: {}
        };

        socket.join(roomId);
        callback(roomId);
        io.to(roomId).emit("playersUpdate", rooms[roomId].players);
    });

    // 🟢 Rejoindre une partie
    socket.on("joinRoom", ({ roomId, pseudo }, callback) => {
        if (!rooms[roomId]) return callback({ error: "Partie introuvable" });

        rooms[roomId].players.push({ id: socket.id, pseudo });
        socket.join(roomId);

        callback({ success: true });

        io.to(roomId).emit("playersUpdate", rooms[roomId].players);
    });

    // 🟠 Envoi d’un guess (réponse)
    socket.on("sendGuess", ({ roomId, value }) => {
        if (!rooms[roomId]) return;

        rooms[roomId].guesses[socket.id] = value;

        io.to(roomId).emit("guessUpdate", rooms[roomId].guesses);
    });

    // 🔴 Déconnexion d’un joueur
    socket.on("disconnect", () => {
        for (const roomId in rooms) {
            rooms[roomId].players = rooms[roomId].players.filter(p => p.id !== socket.id);

            if (rooms[roomId].players.length === 0) {
                delete rooms[roomId];
            } else {
                io.to(roomId).emit("playersUpdate", rooms[roomId].players);
            }
        }
    });
});

server.listen(3000, () => {
    console.log("Serveur Socket.IO lancé sur http://localhost:3000");
});
