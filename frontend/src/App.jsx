import { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import Sender from './components/Sender';
import Receiver from './components/Receiver';
import { Logo, Upload, Download, Shield, Link as LinkIcon } from './components/icons';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000';

// Accept either a bare room code ("WWFLEF") or a full pasted link
// ("http://localhost:5173/?room=WWFLEF") and return just the code.
function extractRoomCode(value) {
  const match = value.match(/room=([a-z0-9]+)/i);
  return (match ? match[1] : value).trim().toUpperCase();
}

function App() {
  const [socket, setSocket] = useState(null);
  const [roomId, setRoomId] = useState('');
  const [mode, setMode] = useState(null); // null | 'sender' | 'receiver'
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const s = io(BACKEND_URL, { reconnectionAttempts: 5 });
    s.on('connect', () => setConnected(true));
    s.on('disconnect', () => setConnected(false));
    setSocket(s);

    // If the URL has ?room=XXXX, this browser is the receiver.
    const room = new URLSearchParams(window.location.search).get('room');
    if (room) {
      setRoomId(room.toUpperCase());
      setMode('receiver');
    }

    return () => s.close();
  }, []);

  async function createRoom() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${BACKEND_URL}/api/create-room`, { method: 'POST' });
      const data = await res.json();
      setRoomId(data.roomId);
      setMode('sender');
      socket.emit('join-room', { roomId: data.roomId });
    } catch {
      setError('Could not reach the signaling server. Is the backend running?');
    } finally {
      setBusy(false);
    }
  }

  if (mode === 'sender') return <Sender socket={socket} roomId={roomId} />;
  if (mode === 'receiver') return <Receiver socket={socket} roomId={roomId} />;

  return (
    <div className="app-bg min-h-screen flex items-center justify-center p-4">
      <div className="relative w-full max-w-md animate-fade-in">
        {/* Brand */}
        <div className="flex items-center justify-center gap-2.5 mb-6">
          <span className="grid place-items-center w-10 h-10 rounded-xl bg-indigo-100 text-indigo-600 ring-1 ring-indigo-200">
            <Logo className="w-6 h-6" />
          </span>
          <span className="text-xl font-semibold tracking-tight text-slate-800">P2P Web Share</span>
        </div>

        <div className="bg-white rounded-3xl shadow-xl ring-1 ring-slate-200/70 p-7">
          <img
            src="https://illustrations.popsy.co/violet/communication.svg"
            alt="Two people sharing files directly"
            className="h-36 mx-auto mb-2 select-none pointer-events-none"
            onError={(e) => { e.currentTarget.style.display = 'none'; }}
          />
          <h1 className="text-2xl font-bold text-slate-900 text-center">Send files, peer to peer</h1>
          <p className="text-slate-500 text-center text-sm mt-1.5 mb-7">
            Files stream directly between browsers. The server only brokers the connection.
          </p>

          {error && (
            <div className="mb-5 flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
              {error}
            </div>
          )}

          <button
            onClick={createRoom}
            disabled={!connected || busy}
            className="group w-full flex items-center justify-center gap-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white font-semibold py-3.5 rounded-xl shadow-lg shadow-indigo-600/20 transition"
          >
            <Upload className="w-5 h-5" />
            {busy ? 'Creating room…' : connected ? 'Share a File' : 'Connecting…'}
          </button>

          <div className="flex items-center my-6">
            <div className="flex-1 border-t border-slate-200" />
            <span className="px-3 text-xs uppercase tracking-wider text-slate-400">or</span>
            <div className="flex-1 border-t border-slate-200" />
          </div>

          <label className="block text-sm font-medium text-slate-600 mb-1.5">Have a room code?</label>
          <div className="relative">
            <LinkIcon className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Enter Room ID or paste link"
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
              className="w-full pl-9 pr-3 py-2.5 border border-slate-300 rounded-xl text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          </div>
          <button
            onClick={() => {
              const code = extractRoomCode(roomId);
              if (code) {
                setRoomId(code);
                setMode('receiver');
              }
            }}
            disabled={!connected || !roomId}
            className="w-full mt-3 flex items-center justify-center gap-2.5 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 text-white font-semibold py-3.5 rounded-xl transition"
          >
            <Download className="w-5 h-5" />
            Receive a File
          </button>

          <div className="mt-6 flex items-center justify-center text-xs text-slate-500">
            <span className={`w-2 h-2 rounded-full mr-2 ${connected ? 'bg-emerald-500' : 'bg-red-500'}`} />
            Signaling server {connected ? 'connected' : 'disconnected'}
          </div>
        </div>

        {/* Trust line */}
        <div className="mt-5 flex items-center justify-center gap-2 text-xs text-slate-400">
          <Shield className="w-4 h-4" />
          End-to-end over WebRTC · SHA-256 verified · No file stored on the server
        </div>
      </div>
    </div>
  );
}

export default App;
