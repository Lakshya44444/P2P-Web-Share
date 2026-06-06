const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: [
      'http://localhost:3000',
      'http://localhost:5173',
      process.env.FRONTEND_URL || 'http://localhost:3000'
    ],
    methods: ['GET', 'POST']
  }
});

app.use(cors());
app.use(express.json());

const rooms = new Map();
const userSockets = new Map();

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.post('/api/create-room', (req, res) => {
  const roomId = generateRoomId();
  rooms.set(roomId, {
    createdAt: Date.now(),
    peers: []
  });
  res.json({ roomId, shareUrl: `${process.env.FRONTEND_URL || 'http://localhost:3000'}?room=${roomId}` });
});

io.on('connection', (socket) => {
  console.log('New client connected:', socket.id);

  socket.on('join-room', (data) => {
    const { roomId, peerId, isInitiator } = data;

    if (!rooms.has(roomId)) {
      socket.emit('error', { message: 'Room not found' });
      return;
    }

    const room = rooms.get(roomId);
    userSockets.set(peerId, socket.id);

    socket.join(roomId);
    socket.roomId = roomId;
    socket.peerId = peerId;
    socket.isInitiator = isInitiator;

    if (room.peers.length === 0) {
      room.peers.push({ peerId, socketId: socket.id, isInitiator });
      socket.emit('room-status', { status: 'waiting-for-peer', peers: room.peers });
    } else if (room.peers.length === 1) {
      room.peers.push({ peerId, socketId: socket.id, isInitiator });
      io.to(roomId).emit('peer-joined', { peerId, peers: room.peers });
    } else {
      socket.emit('error', { message: 'Room is full' });
      socket.leave(roomId);
    }
  });

  socket.on('offer', (data) => {
    const { roomId, to, offer } = data;
    io.to(roomId).emit('offer', { from: socket.peerId, offer });
  });

  socket.on('answer', (data) => {
    const { roomId, to, answer } = data;
    io.to(roomId).emit('answer', { from: socket.peerId, answer });
  });

  socket.on('ice-candidate', (data) => {
    const { roomId, candidate } = data;
    socket.to(roomId).emit('ice-candidate', { from: socket.peerId, candidate });
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
    if (socket.roomId) {
      const room = rooms.get(socket.roomId);
      if (room) {
        room.peers = room.peers.filter(p => p.socketId !== socket.id);
        socket.to(socket.roomId).emit('peer-disconnected', { peerId: socket.peerId });

        if (room.peers.length === 0) {
          rooms.delete(socket.roomId);
        }
      }
    }
    userSockets.delete(socket.peerId);
  });

  socket.on('error', (error) => {
    console.error('Socket error:', error);
  });
});

function generateRoomId() {
  return Math.random().toString(36).substring(2, 11).toUpperCase();
}

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Signaling server running on port ${PORT}`);
});
