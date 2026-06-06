# P2P Web Share - Architecture Documentation

## System Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    Internet / Network                        │
└─────────────────────────────────────────────────────────────┘
                    │                           │
        ┌───────────┴──────────────┬───────────┴──────────┐
        │                          │                      │
   ┌────▼────────┐           ┌────▼────────┐       ┌────▼────────┐
   │  Browser A  │           │ Signaling   │       │  Browser B  │
   │  (Sender)   │           │  Server     │       │ (Receiver)  │
   │             │◄─────────►│ (Node.js)   │◄─────►│             │
   │  React App  │ Socket.io │             │       │  React App  │
   └────┬────────┘           └─────────────┘       └────┬────────┘
        │                                               │
        │    Direct WebRTC Data Channel                │
        └───────────────────────────────────────────────┘
                 (File Data Only)
```

## Architecture Components

### 1. Frontend Layer (React.js + Vite)

**Location**: `frontend/`

```
frontend/
├── src/
│   ├── App.jsx                    # Main app component
│   ├── main.jsx                   # React entry point
│   ├── index.css                  # Tailwind styles
│   ├── components/
│   │   ├── Sender.jsx             # File sender UI
│   │   └── Receiver.jsx           # File receiver UI
│   └── utils/
│       └── crypto.js              # SHA-256 hashing utilities
├── index.html                     # HTML template
├── vite.config.js                 # Vite configuration
├── tailwind.config.js             # Tailwind CSS config
└── package.json                   # Dependencies
```

**Key Technologies**:
- **React 18**: Component-based UI framework
- **Vite**: Fast build tool and dev server
- **Tailwind CSS**: Utility-first CSS framework
- **Socket.io Client**: Real-time bidirectional communication
- **SimplePeer**: WebRTC wrapper library
- **Web Crypto API**: SHA-256 hashing

**Component Architecture**:

```
App
├── Initial Screen
│   ├── "Share a File" Button
│   └── "Receive a File" Input
├── Sender Component
│   ├── Room Display
│   ├── Copy Link Button
│   ├── File Drop Zone
│   ├── File Selection
│   └── Transfer Progress
└── Receiver Component
    ├── Connection Status
    ├── File Reception Info
    ├── Hash Verification
    └── Download Trigger
```

### 2. Backend Layer (Node.js + Express.js)

**Location**: `backend/`

```
backend/
├── server.js                      # Main server file
├── package.json                   # Dependencies
└── .env                          # Environment variables
```

**Key Technologies**:
- **Express.js**: Web framework
- **Socket.io**: Real-time communication
- **CORS**: Cross-origin resource sharing
- **dotenv**: Environment variable management

**API Endpoints**:

```
GET /health
  Response: { status: "ok", timestamp: "..." }
  Purpose: Health check

POST /api/create-room
  Response: { roomId: "XXXXX", shareUrl: "..." }
  Purpose: Create new sharing room
```

**Socket.io Events**:

```
Emitted by Client:
  - join-room: { roomId, peerId, isInitiator }
  - offer: { roomId, to, offer }
  - answer: { roomId, to, answer }
  - ice-candidate: { roomId, candidate }

Emitted by Server:
  - room-status: { status, peers }
  - peer-joined: { peerId, peers }
  - offer: { from, offer }
  - answer: { from, answer }
  - ice-candidate: { from, candidate }
  - peer-disconnected: { peerId }
```

### 3. Signaling Flow

**WebRTC Handshake Process**:

```
┌─────────────┐                      ┌──────────────┐
│  Sender     │                      │  Receiver    │
│  (Browser)  │                      │  (Browser)   │
└──────┬──────┘                      └──────┬───────┘
       │                                    │
       │─ join-room(roomId) ────────────────►│
       │                                    │
       │◄─── peer-joined ────────────────────│
       │                                    │
       │─ offer ────────────────────────────►│
       │                (via Server)        │
       │                                    │
       │◄─── answer ────────────────────────│
       │                (via Server)        │
       │                                    │
       │◄─ ice-candidate (multiple) ──────►│
       │                (via Server)        │
       │                                    │
       ├──────── Direct WebRTC Connection ──┤
       │         (DTLS Encrypted)           │
       │                                    │
```

**Key Points**:
- Signaling server only handles offer/answer/ICE
- File data never touches signaling server
- Direct peer connection after handshake
- DTLS encryption for data in transit

### 4. File Transfer Protocol

**Chunk-Based Transfer**:

```
Chunk Format:
{
  type: "file-chunk",
  chunkIndex: 0,
  totalChunks: 100,
  fileName: "document.pdf",
  fileSize: 5242880,
  fileHash: "sha256...",
  chunkHash: "sha256...",
  chunkData: [Array of bytes]
}

Completion Signal:
{
  type: "transfer-complete",
  fileHash: "sha256...",
  fileName: "document.pdf"
}

Acknowledgment:
{
  type: "chunk-ack",
  chunkIndex: 0
}
```

**Flow Diagram**:

```
1. Sender reads file
   ↓
2. Calculate SHA-256 hash of entire file
   ↓
3. Split file into 16KB chunks
   ↓
4. For each chunk:
   ├─ Calculate SHA-256 hash
   ├─ Send via WebRTC data channel
   └─ Wait for acknowledgment (optional)
   ↓
5. Send transfer-complete signal
   ↓
6. Receiver reconstructs chunks
   ↓
7. Verify complete file hash
   ↓
8. Trigger auto-download
```

### 5. Data Flow Architecture

**Complete Request-Response Cycle**:

```
User Action: Click "Share a File"
    ↓
HTTP POST /api/create-room
    ↓
Backend generates Room ID
    ↓
Response: { roomId, shareUrl }
    ↓
Frontend updates UI with share link
    ↓
User waits for receiver
    ↓
Receiver opens share link
    ↓
Socket.io join-room event
    ↓
Signaling server broadcasts peer-joined
    ↓
WebRTC handshake begins
    ↓
offer/answer/ice-candidate exchange
    ↓
Direct P2P connection established
    ↓
User drags file into drop zone
    ↓
File hash calculated (SHA-256)
    ↓
Click "Start Transfer"
    ↓
File split into 16KB chunks
    ↓
Chunks sent via WebRTC data channel
    ↓
Receiver reconstructs chunks
    ↓
Receiver calculates hash
    ↓
Hashes match → Auto-download
    ↓
Success notification
```

## Security Architecture

### Data Protection

```
┌─────────────────────────────────────────┐
│         Browser (Sender)                │
│  ┌──────────────────────────────────┐   │
│  │ File on Disk                     │   │
│  └──────────────────────────────────┘   │
│                ↓                        │
│  ┌──────────────────────────────────┐   │
│  │ Read into Memory (FileReader API)│   │
│  └──────────────────────────────────┘   │
│                ↓                        │
│  ┌──────────────────────────────────┐   │
│  │ Calculate SHA-256 Hash           │   │
│  │ (Web Crypto API)                 │   │
│  └──────────────────────────────────┘   │
│                ↓                        │
│  ┌──────────────────────────────────┐   │
│  │ Split into 16KB Chunks           │   │
│  └──────────────────────────────────┘   │
│                ↓                        │
│  ┌──────────────────────────────────┐   │
│  │ Send via WebRTC Data Channel     │   │
│  │ (Encrypted with DTLS)            │   │
│  └──────────────────────────────────┘   │
└─────────────────────────────────────────┘
             ↓↓↓ Network ↓↓↓
┌─────────────────────────────────────────┐
│         Browser (Receiver)              │
│  ┌──────────────────────────────────┐   │
│  │ Receive via WebRTC Data Channel  │   │
│  │ (Decrypted DTLS)                 │   │
│  └──────────────────────────────────┘   │
│                ↓                        │
│  ┌──────────────────────────────────┐   │
│  │ Store Chunks in Memory           │   │
│  └──────────────────────────────────┘   │
│                ↓                        │
│  ┌──────────────────────────────────┐   │
│  │ Verify SHA-256 Hash              │   │
│  │ (Web Crypto API)                 │   │
│  └──────────────────────────────────┘   │
│                ↓                        │
│  ┌──────────────────────────────────┐   │
│  │ Reconstruct File from Chunks     │   │
│  └──────────────────────────────────┘   │
│                ↓                        │
│  ┌──────────────────────────────────┐   │
│  │ Trigger Auto-Download            │   │
│  │ (Download API)                   │   │
│  └──────────────────────────────────┘   │
│                ↓                        │
│  ┌──────────────────────────────────┐   │
│  │ File in Downloads Folder         │   │
│  └──────────────────────────────────┘   │
└─────────────────────────────────────────┘
```

### Encryption & Hashing

```
SHA-256 Verification:
┌──────────────────────────────────┐
│ Original File (Sender)           │
│ Size: 5MB                        │
│ Hash: abc123...                  │
└──────────────────────────────────┘
            ↓
        16KB Chunks
            ↓
    [Chunk 0] [Chunk 1] ... [Chunk N]
            ↓
   Each chunk hashed separately
            ↓
    Sent via WebRTC (DTLS encrypted)
            ↓
┌──────────────────────────────────┐
│ Received Chunks (Receiver)       │
│ Reconstructed File               │
│ Hash: abc123...                  │
└──────────────────────────────────┘
            ↓
        Match? YES ✓
            ↓
       Auto-Download
```

## Room Management

**Room Lifecycle**:

```
1. Create Phase
   - Server generates room ID
   - Room created in memory
   - Initial peer count: 0
   - Status: WAITING_FOR_PEER

2. Peer Join Phase
   - First peer joins → SINGLE_PEER
   - Second peer joins → FULL
   - More peers rejected with error

3. Transfer Phase
   - WebRTC handshake
   - Data transfer
   - Hash verification

4. Cleanup Phase
   - Peer disconnects
   - Room cleaned up if empty
   - New room created for next transfer
```

**Room Data Structure**:

```javascript
{
  roomId: "TSEPODYEE",
  createdAt: 1686054861234,
  peers: [
    {
      peerId: "peer-xxxxx",
      socketId: "socket-xxxxx",
      isInitiator: true
    },
    {
      peerId: "peer-yyyyy",
      socketId: "socket-yyyyy",
      isInitiator: false
    }
  ]
}
```

## Error Handling Architecture

```
Frontend Error Handling:
  ├─ Connection Errors
  │  ├─ Backend unreachable → Show "Connecting..."
  │  ├─ WebRTC failed → Show error message
  │  └─ Socket.io disconnected → Auto-reconnect
  ├─ File Errors
  │  ├─ File >50MB → Show size error
  │  ├─ Hash mismatch → Show verification failed
  │  └─ Transfer interrupted → Graceful disconnect msg
  └─ User Errors
     ├─ Room not found → Show error
     ├─ Room full → Show error
     └─ Invalid room ID → Show error

Backend Error Handling:
  ├─ Socket errors → Log and disconnect
  ├─ Invalid room → Send error event
  ├─ Invalid signal → Validate and forward
  └─ Connection drops → Broadcast to other peer
```

## Performance Characteristics

### Network Efficiency

```
Room Creation: 100ms
Peer Connection: 500ms - 2s (depends on NAT)
File Transfer (50MB): ~10s - 60s (depends on bandwidth)
  - Localhost: 10-30s
  - LAN: 30-60s
  - Internet: 1-5 minutes

Chunk Size: 16KB (balance between memory and latency)
Hash Verification: <1s per 50MB
```

### Memory Usage

```
Sender:
  - File in memory: Full file size
  - Chunks buffer: Max 16KB
  - Hashes: Minimal (SHA-256 output)
  Total: ~File size + overhead

Receiver:
  - Chunk buffer: 16KB per chunk
  - Chunks storage: Full file size (while accumulating)
  - Hashes: Minimal
  Total: ~File size + overhead

After Transfer:
  - Memory freed when file reconstructed
  - Only download in browser memory temporarily
```

## Scalability Considerations

### Current Limitations (MVP)

```
Single server instance:
  - ~1000 concurrent rooms (estimate)
  - ~2000 concurrent connections
  - No persistence
  - No clustering
  - No database
```

### Future Scaling (Optional)

```
To scale to 1M+ concurrent users:

1. Horizontal Scaling
   - Multiple Node.js instances
   - Load balancer (nginx, HAProxy)
   - Sticky sessions for Socket.io

2. Distributed State
   - Redis for room management
   - Pub/Sub for event broadcasting
   - Session store

3. WebRTC Optimization
   - STUN/TURN servers for NAT
   - Selective forwarding unit (SFU)
   - Media server (Janus, Kurento)

4. Infrastructure
   - Containerization (Docker)
   - Kubernetes orchestration
   - Auto-scaling policies
```

## Testing Architecture

```
Unit Tests:
  ✓ SHA-256 hashing
  ✓ Room ID generation
  ✓ Chunk validation

Integration Tests:
  ✓ API endpoints
  ✓ Socket.io events
  ✓ Frontend rendering

E2E Tests:
  ✓ Complete file transfer
  ✓ Disconnect recovery
  ✓ Cross-browser compatibility
  ✓ Various file sizes
```

## Deployment Architecture

```
Production Setup:

Frontend (Vercel):
  ├─ Git auto-deploy
  ├─ CDN distribution
  ├─ Edge caching
  └─ SSL/TLS

Backend (Render):
  ├─ Node.js runtime
  ├─ Auto-scaling
  ├─ Monitoring
  └─ SSL/TLS

Infrastructure:
  ├─ Custom domain
  ├─ DNS management
  ├─ Monitoring (optional)
  └─ Logging (optional)
```

## Security Best Practices

1. **HTTPS/TLS**: All connections encrypted
2. **CORS**: Whitelisted origins only
3. **WebRTC Security**: DTLS-SRTP encryption
4. **Input Validation**: All data validated
5. **Rate Limiting**: Prevent abuse (optional)
6. **No Data Retention**: No logs of files
7. **HTTPS Only**: No fallback to HTTP
8. **Security Headers**: HSTS, CSP, etc.

## Conclusion

The P2P Web Share architecture provides:
- ✅ Lightweight signaling-only backend
- ✅ Direct peer-to-peer file transfer
- ✅ Cryptographic verification
- ✅ Graceful error handling
- ✅ Scalable design
- ✅ Production-ready code
- ✅ Comprehensive documentation

