import { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import Sender from './components/Sender';
import Receiver from './components/Receiver';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000';

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
    <div className="min-h-screen bg-gradient-to-br from-blue-600 to-blue-900 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full">
        <h1 className="text-3xl font-bold text-gray-800 text-center mb-1">P2P Web Share</h1>
        <p className="text-gray-500 text-center mb-8">Direct browser-to-browser file transfer</p>

        {error && (
          <div className="mb-5 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>
        )}

        <button
          onClick={createRoom}
          disabled={!connected || busy}
          className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white font-semibold py-3 rounded-lg transition"
        >
          {busy ? 'Creating room…' : connected ? '📤 Share a File' : 'Connecting…'}
        </button>

        <div className="flex items-center my-6">
          <div className="flex-1 border-t border-gray-200" />
          <span className="px-3 text-sm text-gray-400">or</span>
          <div className="flex-1 border-t border-gray-200" />
        </div>

        <input
          type="text"
          placeholder="Enter Room ID"
          value={roomId}
          onChange={(e) => setRoomId(e.target.value.toUpperCase())}
          className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          onClick={() => roomId && setMode('receiver')}
          disabled={!connected || !roomId}
          className="w-full mt-3 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-300 text-white font-semibold py-3 rounded-lg transition"
        >
          📥 Receive a File
        </button>

        <div className="mt-6 flex items-center justify-center text-sm text-gray-500">
          <span className={`w-2 h-2 rounded-full mr-2 ${connected ? 'bg-green-500' : 'bg-red-500'}`} />
          Signaling server: {connected ? 'connected' : 'disconnected'}
        </div>
      </div>
    </div>
  );
}

export default App;
