import { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import SimplePeer from 'simple-peer';
import Sender from './components/Sender';
import Receiver from './components/Receiver';

function App() {
  const [socket, setSocket] = useState(null);
  const [roomId, setRoomId] = useState(null);
  const [peerId] = useState(generatePeerId());
  const [isInitiator, setIsInitiator] = useState(false);
  const [mode, setMode] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState('disconnected');

  useEffect(() => {
    const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';
    const newSocket = io(backendUrl);

    newSocket.on('connect', () => {
      console.log('Connected to signaling server');
      setConnectionStatus('connected');
    });

    newSocket.on('disconnect', () => {
      console.log('Disconnected from signaling server');
      setConnectionStatus('disconnected');
    });

    setSocket(newSocket);

    const params = new URLSearchParams(window.location.search);
    const room = params.get('room');
    if (room) {
      setRoomId(room);
      setIsInitiator(false);
      setMode('receiver');
    }

    return () => {
      newSocket.close();
    };
  }, []);

  function generatePeerId() {
    return `peer-${Math.random().toString(36).substring(2, 11)}`;
  }

  const handleCreateRoom = async () => {
    try {
      const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';
      const response = await fetch(`${backendUrl}/api/create-room`, { method: 'POST' });
      const data = await response.json();
      setRoomId(data.roomId);
      setIsInitiator(true);
      setMode('sender');

      if (socket) {
        socket.emit('join-room', {
          roomId: data.roomId,
          peerId,
          isInitiator: true
        });
      }
    } catch (error) {
      console.error('Failed to create room:', error);
      alert('Failed to create room. Make sure backend is running.');
    }
  };

  const handleJoinRoom = () => {
    if (socket && roomId) {
      socket.emit('join-room', {
        roomId,
        peerId,
        isInitiator: false
      });
    }
  };

  if (!mode) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-600 to-blue-900 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-2xl p-8 max-w-md w-full">
          <h1 className="text-3xl font-bold text-gray-800 mb-2 text-center">P2P Web Share</h1>
          <p className="text-gray-600 text-center mb-8">Direct browser-to-browser file transfer</p>

          <div className="space-y-4">
            <button
              onClick={handleCreateRoom}
              disabled={connectionStatus !== 'connected'}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-bold py-3 px-4 rounded-lg transition duration-200"
            >
              {connectionStatus === 'connected' ? '📤 Share a File' : 'Connecting...'}
            </button>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-300"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-white text-gray-500">or</span>
              </div>
            </div>

            <div>
              <input
                type="text"
                placeholder="Enter room ID"
                value={roomId || ''}
                onChange={(e) => setRoomId(e.target.value.toUpperCase())}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
              <button
                onClick={handleJoinRoom}
                disabled={!roomId || connectionStatus !== 'connected'}
                className="w-full mt-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white font-bold py-3 px-4 rounded-lg transition duration-200"
              >
                {connectionStatus === 'connected' ? '📥 Receive a File' : 'Connecting...'}
              </button>
            </div>
          </div>

          <div className="mt-6 p-3 bg-gray-100 rounded-lg">
            <p className="text-sm text-gray-600">
              <span className={`inline-block w-2 h-2 rounded-full mr-2 ${connectionStatus === 'connected' ? 'bg-green-500' : 'bg-red-500'}`}></span>
              Status: {connectionStatus}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return mode === 'sender' ? (
    <Sender socket={socket} roomId={roomId} peerId={peerId} />
  ) : (
    <Receiver socket={socket} roomId={roomId} peerId={peerId} />
  );
}

export default App;
