import { useState, useRef, useEffect } from 'react';
import SimplePeer from 'simple-peer';
import { calculateSHA256 } from '../utils/crypto';

function Sender({ socket, roomId, peerId }) {
  const [file, setFile] = useState(null);
  const [transferStatus, setTransferStatus] = useState('idle');
  const [progress, setProgress] = useState(0);
  const [speed, setSpeed] = useState(0);
  const [peerConnected, setPeerConnected] = useState(false);
  const [error, setError] = useState(null);
  const peerRef = useRef(null);
  const dataChannelRef = useRef(null);
  const startTimeRef = useRef(null);
  const sentBytesRef = useRef(0);
  const fileHashRef = useRef(null);
  const chunkHashes = useRef({});

  const CHUNK_SIZE = 16 * 1024; // 16KB chunks

  useEffect(() => {
    if (!socket) return;

    socket.on('peer-joined', () => {
      console.log('Peer joined, initiating connection');
      initiatePeerConnection();
    });

    socket.on('answer', (data) => {
      console.log('Received answer from peer');
      if (peerRef.current) {
        peerRef.current.signal(data.answer);
      }
    });

    socket.on('ice-candidate', (data) => {
      console.log('Received ICE candidate');
      if (peerRef.current) {
        peerRef.current.signal(data.candidate);
      }
    });

    socket.on('peer-disconnected', () => {
      setPeerConnected(false);
      setTransferStatus('peer disconnected');
      setError('Peer disconnected');
    });

    return () => {
      socket.off('peer-joined');
      socket.off('answer');
      socket.off('ice-candidate');
      socket.off('peer-disconnected');
    };
  }, [socket]);

  function initiatePeerConnection() {
    const peer = new SimplePeer({
      initiator: true,
      trickleICE: true,
      streams: []
    });

    peer.on('signal', (data) => {
      socket.emit('offer', {
        roomId,
        to: 'receiver',
        offer: data
      });
    });

    peer.on('connect', () => {
      console.log('Peer connection established');
      setPeerConnected(true);
      setError(null);
    });

    peer.on('data', (data) => {
      const message = JSON.parse(data.toString());
      if (message.type === 'chunk-ack') {
        console.log(`Chunk ${message.chunkIndex} acknowledged`);
      }
    });

    peer.on('error', (err) => {
      console.error('Peer error:', err);
      setError(`Connection error: ${err.message}`);
      setPeerConnected(false);
    });

    peer.on('close', () => {
      console.log('Peer connection closed');
      setPeerConnected(false);
    });

    peerRef.current = peer;
  }

  async function handleFileSelect(e) {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      if (selectedFile.size > 50 * 1024 * 1024) {
        setError('File size must be less than 50MB');
        return;
      }
      setFile(selectedFile);
      setError(null);
      fileHashRef.current = await calculateSHA256(selectedFile);
      console.log('File hash:', fileHashRef.current);
    }
  }

  function handleDragOver(e) {
    e.preventDefault();
    e.stopPropagation();
  }

  function handleDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      const event = { target: { files: [droppedFile] } };
      handleFileSelect(event);
    }
  }

  async function startTransfer() {
    if (!file || !peerRef.current || !peerRef.current.connected) {
      setError('File not selected or peer not connected');
      return;
    }

    setTransferStatus('transferring');
    setProgress(0);
    setSpeed(0);
    startTimeRef.current = Date.now();
    sentBytesRef.current = 0;
    chunkHashes.current = {};

    const fileBuffer = await file.arrayBuffer();
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);

    for (let i = 0; i < totalChunks; i++) {
      const start = i * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, file.size);
      const chunk = fileBuffer.slice(start, end);
      const chunkData = new Uint8Array(chunk);
      const chunkHash = await calculateSHA256Chunk(chunkData);

      chunkHashes.current[i] = chunkHash;

      const message = JSON.stringify({
        type: 'file-chunk',
        chunkIndex: i,
        totalChunks,
        fileName: file.name,
        fileSize: file.size,
        fileHash: fileHashRef.current,
        chunkHash,
        chunkData: Array.from(chunkData)
      });

      peerRef.current.send(message);
      sentBytesRef.current += chunkData.length;

      const elapsedSeconds = (Date.now() - startTimeRef.current) / 1000;
      const speedMBps = (sentBytesRef.current / (1024 * 1024)) / elapsedSeconds;
      setSpeed(speedMBps.toFixed(2));
      setProgress(Math.round((sentBytesRef.current / file.size) * 100));

      // Small delay to avoid overwhelming the data channel
      await new Promise(resolve => setTimeout(resolve, 10));
    }

    // Send completion signal
    peerRef.current.send(JSON.stringify({
      type: 'transfer-complete',
      fileHash: fileHashRef.current,
      fileName: file.name
    }));

    setTransferStatus('completed');
  }

  async function calculateSHA256Chunk(data) {
    const buffer = data.buffer;
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  function copyRoomLink() {
    const link = `${window.location.origin}?room=${roomId}`;
    navigator.clipboard.writeText(link);
    alert('Room link copied to clipboard!');
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-600 to-blue-900 p-4 flex items-center justify-center">
      <div className="bg-white rounded-lg shadow-2xl p-8 max-w-2xl w-full">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-800 mb-2">📤 Share a File</h1>
          <p className="text-gray-600">Room ID: <span className="font-bold text-blue-600">{roomId}</span></p>
        </div>

        <div className="mb-6 p-4 bg-blue-50 rounded-lg border-2 border-blue-200">
          <p className="text-sm text-gray-700 mb-3">Share this link with the recipient:</p>
          <div className="flex gap-2">
            <input
              type="text"
              readOnly
              value={`${window.location.origin}?room=${roomId}`}
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg bg-white text-sm"
            />
            <button
              onClick={copyRoomLink}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium"
            >
              Copy
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border-2 border-red-200 rounded-lg text-red-700">
            {error}
          </div>
        )}

        {!peerConnected && transferStatus === 'idle' && (
          <div className="mb-6 p-4 bg-yellow-50 border-2 border-yellow-200 rounded-lg text-yellow-700">
            ⏳ Waiting for receiver to connect...
          </div>
        )}

        {peerConnected && (
          <div className="mb-6 p-4 bg-green-50 border-2 border-green-200 rounded-lg text-green-700">
            ✅ Peer connected and ready
          </div>
        )}

        {transferStatus === 'idle' && (
          <div
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            className="border-3 border-dashed border-blue-400 rounded-lg p-8 text-center cursor-pointer hover:bg-blue-50 transition"
          >
            <div className="text-5xl mb-3">📁</div>
            <p className="text-gray-700 font-medium mb-2">Drag and drop a file here</p>
            <p className="text-gray-500 text-sm mb-4">or click to select (max 50MB)</p>
            <input
              type="file"
              onChange={handleFileSelect}
              className="hidden"
              id="file-input"
            />
            <label htmlFor="file-input" className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-medium cursor-pointer inline-block">
              Select File
            </label>
          </div>
        )}

        {file && transferStatus === 'idle' && (
          <div className="mt-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
            <p className="text-gray-700 font-medium mb-2">Selected File:</p>
            <div className="flex justify-between items-center mb-4">
              <span className="text-gray-600">{file.name}</span>
              <span className="text-gray-600">{(file.size / 1024 / 1024).toFixed(2)} MB</span>
            </div>
            <button
              onClick={startTransfer}
              disabled={!peerConnected}
              className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white font-bold py-3 px-4 rounded-lg transition"
            >
              {peerConnected ? '🚀 Start Transfer' : 'Waiting for peer...'}
            </button>
          </div>
        )}

        {transferStatus === 'transferring' && (
          <div className="mt-6 space-y-4">
            <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
              <p className="text-gray-700 font-medium mb-3">{file.name}</p>
              <div className="w-full bg-gray-200 rounded-full h-3">
                <div
                  className="bg-blue-600 h-3 rounded-full transition-all"
                  style={{ width: `${progress}%` }}
                ></div>
              </div>
              <div className="flex justify-between mt-2 text-sm text-gray-600">
                <span>{progress}%</span>
                <span>{speed} MB/s</span>
              </div>
            </div>
          </div>
        )}

        {transferStatus === 'completed' && (
          <div className="mt-6 p-4 bg-green-50 border-2 border-green-200 rounded-lg">
            <p className="text-green-700 font-medium text-center">✅ Transfer Complete!</p>
            <button
              onClick={() => location.reload()}
              className="w-full mt-3 bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg"
            >
              Share Another File
            </button>
          </div>
        )}

        {transferStatus === 'peer disconnected' && (
          <div className="mt-6 p-4 bg-red-50 border-2 border-red-200 rounded-lg">
            <p className="text-red-700 font-medium text-center">❌ Peer Disconnected</p>
            <button
              onClick={() => location.reload()}
              className="w-full mt-3 bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg"
            >
              Start Over
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default Sender;
