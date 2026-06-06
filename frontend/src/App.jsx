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

  console.log('App component rendered', { mode, connectionStatus });

  useEffect(() => {
    try {
      const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';
      const newSocket = io(backendUrl, {
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        reconnectionAttempts: 5
      });

      newSocket.on('connect', () => {
        console.log('Connected to signaling server');
        setConnectionStatus('connected');
      });

      newSocket.on('disconnect', () => {
        console.log('Disconnected from signaling server');
        setConnectionStatus('disconnected');
      });

      newSocket.on('error', (error) => {
        console.error('Socket error:', error);
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
    } catch (err) {
      console.error('Failed to initialize socket:', err);
      setConnectionStatus('disconnected');
    }
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
      <div style={{ minHeight: '100vh', background: 'linear-gradient(to bottom right, #2563eb, #1e3a8a)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
        <div style={{ background: 'white', borderRadius: '0.5rem', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)', padding: '2rem', maxWidth: '28rem', width: '100%' }}>
          <h1 style={{ fontSize: '1.875rem', fontWeight: 'bold', color: '#1f2937', marginBottom: '0.5rem', textAlign: 'center' }}>P2P Web Share</h1>
          <p style={{ color: '#4b5563', textAlign: 'center', marginBottom: '2rem' }}>Direct browser-to-browser file transfer</p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <button
              onClick={handleCreateRoom}
              disabled={connectionStatus !== 'connected'}
              style={{
                width: '100%',
                backgroundColor: connectionStatus === 'connected' ? '#2563eb' : '#9ca3af',
                color: 'white',
                fontWeight: 'bold',
                padding: '0.75rem 1rem',
                borderRadius: '0.5rem',
                border: 'none',
                cursor: connectionStatus === 'connected' ? 'pointer' : 'not-allowed',
                transition: 'all 0.2s'
              }}
              onMouseOver={(e) => {
                if (connectionStatus === 'connected') e.target.style.backgroundColor = '#1d4ed8';
              }}
              onMouseOut={(e) => {
                if (connectionStatus === 'connected') e.target.style.backgroundColor = '#2563eb';
              }}
            >
              {connectionStatus === 'connected' ? '📤 Share a File' : 'Connecting...'}
            </button>

            <div style={{ position: 'relative', margin: '1rem 0' }}>
              <div style={{ position: 'absolute', inset: '0', display: 'flex', alignItems: 'center' }}>
                <div style={{ width: '100%', borderTop: '1px solid #d1d5db' }}></div>
              </div>
              <div style={{ position: 'relative', display: 'flex', justifyContent: 'center', fontSize: '0.875rem' }}>
                <span style={{ paddingLeft: '0.5rem', paddingRight: '0.5rem', background: 'white', color: '#6b7280' }}>or</span>
              </div>
            </div>

            <div>
              <input
                type="text"
                placeholder="Enter room ID"
                value={roomId || ''}
                onChange={(e) => setRoomId(e.target.value.toUpperCase())}
                style={{
                  width: '100%',
                  padding: '0.5rem 1rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '0.5rem',
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
                onFocus={(e) => e.target.style.boxShadow = '0 0 0 2px #2563eb'}
                onBlur={(e) => e.target.style.boxShadow = 'none'}
              />
              <button
                onClick={handleJoinRoom}
                disabled={!roomId || connectionStatus !== 'connected'}
                style={{
                  width: '100%',
                  marginTop: '0.75rem',
                  backgroundColor: (!roomId || connectionStatus !== 'connected') ? '#9ca3af' : '#16a34a',
                  color: 'white',
                  fontWeight: 'bold',
                  padding: '0.75rem 1rem',
                  borderRadius: '0.5rem',
                  border: 'none',
                  cursor: (!roomId || connectionStatus !== 'connected') ? 'not-allowed' : 'pointer',
                  transition: 'all 0.2s'
                }}
                onMouseOver={(e) => {
                  if (!roomId || connectionStatus !== 'connected') return;
                  e.target.style.backgroundColor = '#15803d';
                }}
                onMouseOut={(e) => {
                  if (!roomId || connectionStatus !== 'connected') return;
                  e.target.style.backgroundColor = '#16a34a';
                }}
              >
                {connectionStatus === 'connected' ? '📥 Receive a File' : 'Connecting...'}
              </button>
            </div>
          </div>

          <div style={{ marginTop: '1.5rem', padding: '0.75rem', background: '#f3f4f6', borderRadius: '0.5rem' }}>
            <p style={{ fontSize: '0.875rem', color: '#4b5563' }}>
              <span style={{
                display: 'inline-block',
                width: '0.5rem',
                height: '0.5rem',
                borderRadius: '50%',
                marginRight: '0.5rem',
                backgroundColor: connectionStatus === 'connected' ? '#22c55e' : '#ef4444'
              }}></span>
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
