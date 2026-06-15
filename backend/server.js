// P2P Web Share signaling server: relays the WebRTC handshake between two
// browsers but never sees the file data, which flows directly peer-to-peer.

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
require('dotenv').config();

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
const PORT = process.env.PORT || 4000;

const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:5173',
  FRONTEND_URL,
];

const app = express();
app.use(cors({ origin: allowedOrigins }));
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: allowedOrigins, methods: ['GET', 'POST'] },
});

// roomId -> { createdAt, peers: [socketId, ...] }
const rooms = new Map();

function generateRoomId() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

app.get('/health', (req, res) => {
  res.json({ status: 'ok', rooms: rooms.size, timestamp: new Date().toISOString() });
});

app.post('/api/create-room', (req, res) => {
  let roomId = generateRoomId();
  while (rooms.has(roomId)) roomId = generateRoomId();
  rooms.set(roomId, { createdAt: Date.now(), peers: [] });
  res.json({ roomId, shareUrl: `${FRONTEND_URL}/?room=${roomId}` });
});

io.on('connection', (socket) => {
  socket.on('join-room', ({ roomId }) => {
    // Rooms are created lazily so a receiver can open a link even if the
    // server restarted after the sender created the room.
    if (!rooms.has(roomId)) {
      rooms.set(roomId, { createdAt: Date.now(), peers: [] });
    }
    const room = rooms.get(roomId);

    // Idempotent: ignore a repeat join from a socket already in the room
    // (e.g. React effects firing twice in dev).
    if (room.peers.includes(socket.id)) return;

    if (room.peers.length >= 2) {
      socket.emit('room-full');
      return;
    }

    socket.join(roomId);
    socket.data.roomId = roomId;
    room.peers.push(socket.id);

    if (room.peers.length === 2) {
      // Both peers present — tell the first-joiner (initiator) to make the offer.
      io.to(room.peers[0]).emit('peer-ready');
      socket.emit('joined', { waiting: false });
    } else {
      socket.emit('joined', { waiting: true });
    }
  });

  // Relay every SimplePeer signal (offer, answer, ICE candidates) to the
  // other peer in the room. The server doesn't inspect the payload.
  socket.on('signal', ({ roomId, data }) => {
    socket.to(roomId).emit('signal', { data });
  });

  socket.on('disconnect', () => {
    const roomId = socket.data.roomId;
    if (!roomId || !rooms.has(roomId)) return;

    const room = rooms.get(roomId);
    room.peers = room.peers.filter((id) => id !== socket.id);
    socket.to(roomId).emit('peer-disconnected');

    if (room.peers.length === 0) rooms.delete(roomId);
  });
});

server.listen(PORT, () => {
  console.log(`Signaling server listening on port ${PORT}`);
});
