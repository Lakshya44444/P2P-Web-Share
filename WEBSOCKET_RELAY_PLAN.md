# WebSocket Relay Fallback - Optional Advanced Feature

## Problem
IITR WiFi and other networks block direct P2P connections (inbound). Users on these networks can't establish WebRTC connections.

## Solution: WebSocket Relay Fallback

### How It Works
```
Device A → WebSocket (Relay Server) ← Device B
    ↓
Encrypted file data through relay if P2P fails
```

### Implementation Steps

#### 1. Detect P2P Failure
```javascript
// In Sender.jsx or App.jsx
const detectP2PFailure = () => {
  const timeout = setTimeout(() => {
    if (!peerConnected && !isInitiator) {
      // Switch to WebSocket relay
      enableWebSocketRelay();
    }
  }, 5000); // 5 second timeout
};
```

#### 2. Backend Relay Server
```javascript
// Add to backend/server.js
io.on('connection', (socket) => {
  socket.on('relay-message', (data) => {
    // Forward encrypted file chunks through WebSocket
    io.to(data.roomId).emit('relay-chunk', {
      from: socket.peerId,
      chunk: data.chunk,
      hash: data.hash
    });
  });
});
```

#### 3. Frontend Relay Handler
```javascript
// In Sender.jsx
const sendViaRelay = (chunk) => {
  socket.emit('relay-message', {
    roomId,
    peerId,
    chunk,
    hash: calculateHash(chunk)
  });
};

// In Receiver.jsx
socket.on('relay-chunk', (data) => {
  receiveChunk(data.chunk, data.hash);
});
```

#### 4. Encryption (Important!)
```javascript
// Encrypt chunks before sending through relay
const encryptChunk = async (chunk, key) => {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    chunk
  );
  return { encrypted, iv };
};
```

### Pros & Cons

**Pros:**
- ✅ Works through any firewall
- ✅ Still maintains encryption
- ✅ Graceful fallback from P2P
- ✅ Server only relays, doesn't process files

**Cons:**
- ❌ Uses more server bandwidth
- ❌ Slower than direct P2P
- ❌ Server sees encrypted data (but can't decrypt)
- ❌ Additional complexity

### TURN Servers (Production Alternative)

Instead of custom relay, use TURN servers for production:

```javascript
// In Sender.jsx (App.jsx)
const peerConfig = {
  iceServers: [
    { urls: ['stun:stun.l.google.com:19302'] }, // STUN only
    // OR add TURN for production:
    {
      urls: ['turn:your-turn-server.com:3478'],
      username: 'user',
      credential: 'pass'
    }
  ]
};

const peer = new SimplePeer({ ...peerConfig });
```

Popular TURN server providers:
- Twillio (paid)
- Xirsys (free tier)
- Google TURN (free, limited)

### Recommendation

**For MARS submission (MVP)**:
- ❌ DON'T add WebSocket relay (adds complexity)
- ✅ DO record demo on localhost/mobile hotspot
- ✅ DO note the IITR firewall limitation in README

**For production deployment**:
- Use TURN servers + WebSocket relay fallback
- Add automatic P2P→Relay failover
- Encrypt all relay traffic
- Monitor server bandwidth

### Demo Workaround for IITR

```bash
# Option 1: Localhost (BEST FOR DEMO)
Terminal 1: cd backend && npm start
Terminal 2: cd frontend && npm run dev
Browser: localhost:5173 (2 tabs)

# Option 2: Mobile Hotspot
Device A: Connect to mobile hotspot
Device B: Connect to same hotspot
Test transfer (no firewall blocking)

# Option 3: Deploy & Test
Frontend: Deploy to Vercel
Backend: Deploy to Render
Test across the internet (some firewalls may block)
```

### When to Implement

**Good for learning:**
- Understand how relay architecture works
- Learn WebSocket vs WebRTC tradeoffs
- Advanced feature for future iterations

**Not needed for:**
- MVP submission ✅
- Learning WebRTC basics ✅
- Demonstrating P2P concept ✅

---

## Summary

The firewall issue is **network infrastructure level** - your app can't bypass it. But you can:

1. **For now**: Use localhost or mobile hotspot for demo
2. **For production**: Add TURN servers or WebSocket relay
3. **For learning**: Understand both P2P and relay architectures

**Current MVP**: ✅ Complete and working correctly
**Next iteration**: Can add relay as advanced feature

