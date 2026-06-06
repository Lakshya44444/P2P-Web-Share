# P2P Web Share - Direct Browser-to-Browser File Transfer

A lightweight, decentralized P2P file sharing web application using WebRTC, React.js, and Node.js. Transfer files directly between browsers without relying on central servers.

## 🎯 Key Features

### Core MVP Features
- **Share Room Creation**: Drag-and-drop zone to upload files and generate unique Room IDs
- **Signaling Handshake**: Node.js + Socket.io backend for WebRTC coordination
- **Direct P2P Transfer**: Files transferred directly over WebRTC data channels
- **SHA-256 Verification**: Cryptographic hashing ensures zero data corruption
- **Real-time Progress**: Live transfer percentage, speed (MB/s), and connection status
- **Graceful Disconnect Handling**: Smooth handling of connection drops
- **Auto-Download**: Automatic file download on successful transfer completion
- **File Size Support**: Up to 50MB for standard browser memory

### Technical Highlights
- No central server processes, reads, or stores file data
- Secure WebRTC peer-to-peer connections
- Web Crypto API for hash verification
- Socket.io for signaling
- Responsive Tailwind CSS UI

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React.js + Vite + Tailwind CSS |
| P2P Communication | WebRTC (SimplePeer) |
| Signaling Backend | Node.js + Express.js + Socket.io |
| Hashing | Web Crypto API (SHA-256) |

## 📋 Prerequisites

- Node.js 14.0+
- npm or yarn
- Modern web browser with WebRTC support

## 🚀 Installation & Setup

### 1. Clone Repository
```bash
git clone <repository-url>
cd project_mars_webd
```

### 2. Backend Setup

```bash
cd backend
npm install
```

Create `.env` file in backend directory:
```env
PORT=3001
FRONTEND_URL=http://localhost:5173
NODE_ENV=development
```

Start the backend server:
```bash
npm run dev
```

Backend will run on `http://localhost:3001`

### 3. Frontend Setup

```bash
cd frontend
npm install
```

Create `.env` file in frontend directory:
```env
VITE_BACKEND_URL=http://localhost:3001
```

Start the development server:
```bash
npm run dev
```

Frontend will run on `http://localhost:5173`

## 🎮 Usage

### Sending a File

1. Open `http://localhost:5173` in your browser
2. Click **"📤 Share a File"**
3. Wait for the receiver to connect
4. Drag and drop a file (max 50MB) or click to select
5. Click **"🚀 Start Transfer"**
6. Share the displayed room link with the recipient

### Receiving a File

1. Open the shared room link or go to `http://localhost:5173?room=ROOMID`
2. The receiver will automatically join the room
3. Wait for the transfer to complete
4. File downloads automatically after verification

## 📊 Architecture

### Backend (Signaling Server)

```
Node.js + Express.js + Socket.io
├── /health - Health check endpoint
├── /api/create-room - Create new room (POST)
└── Socket.io Events:
    ├── join-room - Join peer to room
    ├── offer - Send WebRTC offer
    ├── answer - Send WebRTC answer
    ├── ice-candidate - Send ICE candidates
    └── disconnect - Handle disconnection
```

### Frontend (React)

```
src/
├── App.jsx - Main app component with room selection
├── components/
│   ├── Sender.jsx - File sender component
│   └── Receiver.jsx - File receiver component
└── utils/
    └── crypto.js - SHA-256 hashing utilities
```

### Data Flow

1. **Room Creation**: Sender creates room via HTTP POST
2. **Peer Joining**: Both peers join via Socket.io
3. **WebRTC Handshake**: Exchange offer/answer via signaling server
4. **File Transfer**: Direct P2P data channel communication
5. **Hash Verification**: SHA-256 verification on completion
6. **Auto-Download**: File automatically downloaded to receiver

## 🔒 Security Considerations

- No file data passes through signaling server
- SHA-256 verification prevents data corruption
- WebRTC encryption (DTLS) for data in transit
- No authentication required for MVP (add auth for production)

## 🧪 Testing

### Local Testing
1. Open two browser windows/tabs to `http://localhost:5173`
2. One initiates share, one receives
3. Test file transfer with various file sizes

### Cross-Network Testing
1. Deploy backend to a public server
2. Update `VITE_BACKEND_URL` in frontend `.env`
3. Deploy frontend or access via tunnel
4. Share room link across network

## 📦 Building for Production

### Frontend Build
```bash
cd frontend
npm run build
```
Output: `frontend/dist/` ready for Vercel/Netlify

### Backend Deployment
Deploy `backend/` to Render, Railway, or similar service

### Environment Variables (Production)
```env
# Backend
PORT=3001
FRONTEND_URL=https://yourdomain.com
NODE_ENV=production

# Frontend
VITE_BACKEND_URL=https://api.yourdomain.com
```

## 🚢 Deployment

### Frontend (Vercel/Netlify)
```bash
vercel --prod
# or
netlify deploy --prod
```

### Backend (Render/Railway)
1. Push code to GitHub
2. Connect repository to Render/Railway
3. Set environment variables
4. Deploy on platform

## 🎨 UI Features

- **Modern Gradient Design**: Tailwind CSS with blue/green gradients
- **Real-time Feedback**: Progress bars, speed indicators, status messages
- **Drag-and-Drop**: Intuitive file selection
- **Responsive Design**: Works on desktop and tablet
- **Error Handling**: Clear error messages and recovery options

## 📈 Performance Metrics

- **Chunk Size**: 16KB per transmission
- **Transfer Speed**: Real-time MB/s calculation
- **Memory Efficient**: Streamed chunk processing
- **Latency**: Minimal (direct P2P after handshake)

## 🐛 Troubleshooting

### "Connecting..." Status Stuck
- Verify backend is running
- Check CORS configuration
- Ensure VITE_BACKEND_URL matches backend URL

### WebRTC Connection Fails
- Check browser WebRTC support
- Verify firewall/NAT settings
- Try different networks/regions

### File Hash Mismatch
- Check network stability
- Retry transfer
- Verify file not corrupted before sending

### CORS Errors
- Update backend CORS origins
- Ensure frontend URL matches backend allowlist

## 📚 Advanced Features (Optional)

### Potential Extensions
- Multi-peer support (mesh swarming)
- Large file support (>500MB) via Streams API + OPFS
- Zero-knowledge encryption (AES-GCM)
- Connection recovery (auto-resume on disconnect)

## 📝 License

MIT License - Feel free to use, modify, and distribute

## 👤 Author

[Your Name/Team]

## 📞 Support

For issues and questions, please open a GitHub issue or contact the development team.
