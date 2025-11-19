const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
require('dotenv').config(); // Load .env

const app = express();
const server = http.createServer(app);

app.use(cors());
app.use(express.json());

// Socket.io setup
const io = socketIo(server, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

// Store active rooms and messages
const rooms = new Map();
const messages = new Map(); // chat history per room

io.on('connection', (socket) => {
    console.log('New client connected:', socket.id);

    socket.on('join-room', ({ username, roomId }) => {
        socket.join(roomId);
        socket.username = username;
        socket.roomId = roomId;

        if (!rooms.has(roomId)) rooms.set(roomId, new Set());
        rooms.get(roomId).add(username);
        const onlineCount = rooms.get(roomId).size;

        socket.emit('chat-history', messages.get(roomId) || []);
        socket.to(roomId).emit('user-joined', { username, onlineCount });
        socket.emit('room-users', onlineCount);
    });

    socket.on('send-message', (message) => {
        const { roomId } = message;
        if (!messages.has(roomId)) messages.set(roomId, []);
        messages.get(roomId).push(message);
        io.to(roomId).emit('message', message);
    });

    socket.on('typing', ({ roomId, username }) => socket.to(roomId).emit('typing', { username }));
    socket.on('stop-typing', ({ roomId }) => socket.to(roomId).emit('stop-typing'));

    socket.on('leave-room', ({ username, roomId }) => handleUserLeave(socket, username, roomId));

    socket.on('disconnect', () => {
        const { username, roomId } = socket;
        if (username && roomId) handleUserLeave(socket, username, roomId);
        console.log('Client disconnected:', socket.id);
    });
});

function handleUserLeave(socket, username, roomId) {
    if (rooms.has(roomId)) {
        rooms.get(roomId).delete(username);
        const onlineCount = rooms.get(roomId).size;
        if (onlineCount === 0) rooms.delete(roomId);
        else socket.to(roomId).emit('user-left', { username, onlineCount });
    }
    socket.leave(roomId);
}

app.get('/', (req, res) => {
    res.json({ message: 'SecureChat Server Running', activeRooms: rooms.size });
});

// Giphy search
const fetch = require('node-fetch');
app.get('/giphy', async (req, res) => {
    const query = req.query.q || 'funny';
    const apiKey = process.env.GIPHY_API_KEY;
    try {
        const response = await fetch(`https://api.giphy.com/v1/gifs/search?api_key=${apiKey}&q=${query}&limit=10&rating=g`);
        const data = await response.json();
        res.json(data.data.map(g => g.images.fixed_height.url));
    } catch (err) {
        res.status(500).json({ error: 'Giphy API failed', details: err.message });
    }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
