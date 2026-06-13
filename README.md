# P2P Web Share

Direct, browser-to-browser file transfer. Drop a file, share a link, and the
recipient's browser connects **directly** to yours over WebRTC to stream the
file. A small Socket.io signaling server only helps the two browsers find each
other during the handshake — it never sees, stores, or relays any file data.

## How it works

```
  Sender browser  ──┐                              ┌──  Receiver browser
                    │   1. handshake (SDP + ICE)   │
                    └────────► Signaling ◄─────────┘
                               server (Socket.io)
                    │                              │
                    └──── 2. file data (WebRTC ────┘
                          data channel, direct P2P)
```

1. The sender creates a room and shares the link (`/?room=ABC123`).
2. When the receiver opens the link, both browsers exchange WebRTC offer/answer
   and ICE candidates through the signaling server.
3. Once connected, the file streams **directly** between the two browsers over
   an encrypted (DTLS) data channel. The server is no longer involved.

## Features

- **Drag-and-drop sharing** with a unique room link (files up to 50 MB).
- **Socket.io signaling** for the WebRTC handshake only — zero file data.
- **Direct P2P transfer** over a WebRTC data channel, streamed in 16 KB chunks
  with **backpressure** so the channel buffer never overflows.
- **SHA-256 integrity check**: the sender hashes the file up front; the receiver
  re-hashes the reassembled file and only saves it if the hashes match.
- **Live progress**: transfer percentage and speed (MB/s) on both ends.
- **Graceful disconnects**: closing a tab notifies the other side instead of
  hanging or crashing.
- **Auto-download**: the verified file is saved automatically on completion.

## Tech stack

| Layer            | Technology                          |
| ---------------- | ----------------------------------- |
| Frontend         | React + Vite + Tailwind CSS         |
| P2P transport    | WebRTC via [simple-peer]            |
| Signaling server | Node.js + Express + Socket.io       |

[simple-peer]: https://github.com/feross/simple-peer

## Project structure

```
backend/          Express + Socket.io signaling server
  server.js
frontend/         React app (Vite)
  src/
    App.jsx               Landing page + room creation/join
    components/
      Sender.jsx          Sends the file (WebRTC initiator)
      Receiver.jsx        Receives, verifies, downloads
    utils/crypto.js       SHA-256 + byte formatting
```

## Run locally

You need two terminals.

**1. Backend**
```bash
cd backend
npm install
npm start            # http://localhost:4000
```

**2. Frontend**
```bash
cd frontend
npm install
npm run dev          # http://localhost:5173
```

Open `http://localhost:5173`, click **Share a File**, copy the link, and open it
in a second browser tab (or another device). Pick a file and send it.

## Configuration

Environment variables (see `.env.example` in each folder):

| Variable           | Where    | Default                 |
| ------------------ | -------- | ----------------------- |
| `PORT`             | backend  | `4000`                  |
| `FRONTEND_URL`     | backend  | `http://localhost:5173` |
| `VITE_BACKEND_URL` | frontend | `http://localhost:4000` |

## Deployment

- **Frontend** → Vercel / Netlify. Build command `npm run build`, output `dist`.
  Set `VITE_BACKEND_URL` to your deployed backend URL.
- **Backend** → Render / Railway. Start command `npm start`. Set `FRONTEND_URL`
  to your deployed frontend URL.

## A note on networks

WebRTC needs a route between the two peers. On open networks and across the
internet this works directly. Some restrictive networks (e.g. locked-down
campus or corporate Wi-Fi) block peer-to-peer connections; in that case use a
mobile hotspot, or test both tabs on the same machine. Production deployments
typically add a **TURN server** to relay through such firewalls — that's a
deliberate next step, not part of this MVP.

## License

MIT
