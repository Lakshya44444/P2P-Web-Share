import { useState, useRef, useEffect } from 'react';
import SimplePeer from 'simple-peer';
import { calculateSHA256 } from '../utils/crypto';

function Receiver({ socket, roomId, peerId }) {
  const [peerConnected, setPeerConnected] = useState(false);
  const [transferStatus, setTransferStatus] = useState('waiting');
  const [progress, setProgress] = useState(0);
  const [fileName, setFileName] = useState('');
  const [fileSize, setFileSize] = useState(0);
  const [speed, setSpeed] = useState(0);
  const [error, setError] = useState(null);
  const peerRef = useRef(null);
  const chunksRef = useRef({});
  const totalChunksRef = useRef(0);
  const receivedBytesRef = useRef(0);
  const startTimeRef = useRef(null);
  const fileHashRef = useRef(null);
  const chunkHashesRef = useRef({});

  useEffect(() => {
    if (!socket) return;

    socket.emit('join-room', {
      roomId,
      peerId,
      isInitiator: false
    });

    socket.on('offer', (data) => {
      console.log('Received offer from peer');
      if (!peerRef.current) {
        initiatePeerConnection(true);
      }
      if (peerRef.current) {
        peerRef.current.signal(data.offer);
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
      setError('Sender disconnected');
    });

    socket.on('room-status', (data) => {
      console.log('Room status:', data);
    });

    return () => {
      socket.off('offer');
      socket.off('ice-candidate');
      socket.off('peer-disconnected');
      socket.off('room-status');
    };
  }, [socket, roomId, peerId]);

  function initiatePeerConnection(responder = false) {
    const peer = new SimplePeer({
      initiator: false,
      trickleICE: true,
      streams: []
    });

    peer.on('signal', (data) => {
      if (responder) {
        socket.emit('answer', {
          roomId,
          to: 'sender',
          answer: data
        });
      }
    });

    peer.on('connect', () => {
      console.log('Peer connection established');
      setPeerConnected(true);
      setError(null);
    });

    peer.on('data', (data) => {
      const message = JSON.parse(data.toString());

      if (message.type === 'file-chunk') {
        handleChunkReceived(message);
      } else if (message.type === 'transfer-complete') {
        handleTransferComplete(message);
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

  function handleChunkReceived(message) {
    const { chunkIndex, totalChunks, fileName: fname, fileSize: fsize, fileHash, chunkHash, chunkData } = message;

    if (!startTimeRef.current) {
      startTimeRef.current = Date.now();
      setTransferStatus('receiving');
      setFileName(fname);
      setFileSize(fsize);
      totalChunksRef.current = totalChunks;
      fileHashRef.current = fileHash;
    }

    chunksRef.current[chunkIndex] = chunkData;
    chunkHashesRef.current[chunkIndex] = chunkHash;
    receivedBytesRef.current += chunkData.length;

    const elapsedSeconds = (Date.now() - startTimeRef.current) / 1000;
    const speedMBps = (receivedBytesRef.current / (1024 * 1024)) / elapsedSeconds;
    setSpeed(speedMBps.toFixed(2));

    const progressPercent = Math.round((Object.keys(chunksRef.current).length / totalChunks) * 100);
    setProgress(progressPercent);

    // Send acknowledgment
    if (peerRef.current && peerRef.current.connected) {
      peerRef.current.send(JSON.stringify({
        type: 'chunk-ack',
        chunkIndex
      }));
    }
  }

  async function handleTransferComplete(message) {
    setTransferStatus('verifying');

    // Reconstruct the file
    const allChunks = [];
    for (let i = 0; i < totalChunksRef.current; i++) {
      if (chunksRef.current[i]) {
        allChunks.push(new Uint8Array(chunksRef.current[i]));
      }
    }

    const fileBlob = new Blob(allChunks);

    // Verify file hash
    const calculatedHash = await calculateSHA256(fileBlob);
    if (calculatedHash === fileHashRef.current) {
      console.log('File hash verified successfully');
      downloadFile(fileBlob, fileName);
      setTransferStatus('completed');
      setProgress(100);
    } else {
      console.error('File hash mismatch!');
      setError('File verification failed - hash mismatch');
      setTransferStatus('error');
    }
  }

  function downloadFile(blob, filename) {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-600 to-green-900 p-4 flex items-center justify-center">
      <div className="bg-white rounded-lg shadow-2xl p-8 max-w-2xl w-full">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-800 mb-2">📥 Receive a File</h1>
          <p className="text-gray-600">Room ID: <span className="font-bold text-green-600">{roomId}</span></p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border-2 border-red-200 rounded-lg text-red-700">
            {error}
          </div>
        )}

        {!peerConnected && transferStatus === 'waiting' && (
          <div className="mb-6 p-4 bg-yellow-50 border-2 border-yellow-200 rounded-lg text-yellow-700">
            ⏳ Waiting for sender to connect...
          </div>
        )}

        {peerConnected && transferStatus === 'waiting' && (
          <div className="mb-6 p-4 bg-green-50 border-2 border-green-200 rounded-lg text-green-700">
            ✅ Sender connected. Waiting for file transfer...
          </div>
        )}

        {transferStatus === 'receiving' && (
          <div className="space-y-4">
            <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
              <p className="text-gray-700 font-medium mb-2">Receiving File:</p>
              <p className="text-gray-600 mb-3">{fileName}</p>
              <p className="text-sm text-gray-500 mb-3">{(fileSize / 1024 / 1024).toFixed(2)} MB total</p>

              <div className="w-full bg-gray-200 rounded-full h-3">
                <div
                  className="bg-green-600 h-3 rounded-full transition-all"
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

        {transferStatus === 'verifying' && (
          <div className="space-y-4">
            <div className="p-4 bg-blue-50 border-2 border-blue-200 rounded-lg">
              <p className="text-blue-700 font-medium text-center">🔍 Verifying file integrity...</p>
            </div>
          </div>
        )}

        {transferStatus === 'completed' && (
          <div className="space-y-4">
            <div className="p-4 bg-green-50 border-2 border-green-200 rounded-lg">
              <p className="text-green-700 font-medium text-center">✅ File Downloaded Successfully!</p>
              <p className="text-green-700 text-center text-sm mt-2">File has been saved to your downloads.</p>
              <button
                onClick={() => location.reload()}
                className="w-full mt-4 bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg"
              >
                Receive Another File
              </button>
            </div>
          </div>
        )}

        {transferStatus === 'peer disconnected' && (
          <div className="space-y-4">
            <div className="p-4 bg-red-50 border-2 border-red-200 rounded-lg">
              <p className="text-red-700 font-medium text-center">❌ Sender Disconnected</p>
              <button
                onClick={() => location.reload()}
                className="w-full mt-3 bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg"
              >
                Start Over
              </button>
            </div>
          </div>
        )}

        {transferStatus === 'error' && (
          <div className="space-y-4">
            <div className="p-4 bg-red-50 border-2 border-red-200 rounded-lg">
              <p className="text-red-700 font-medium text-center">❌ Transfer Failed</p>
              <p className="text-red-700 text-center text-sm mt-2">{error}</p>
              <button
                onClick={() => location.reload()}
                className="w-full mt-3 bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg"
              >
                Start Over
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default Receiver;
