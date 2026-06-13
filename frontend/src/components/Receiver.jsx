import { useState, useRef, useEffect } from 'react';
import SimplePeer from 'simple-peer';
import { calculateSHA256, formatBytes } from '../utils/crypto';

const TYPE_CONTROL = 0; // message prefix: JSON control message

function Receiver({ socket, roomId }) {
  const [status, setStatus] = useState('connecting'); // connecting | ready | receiving | verifying | done | error
  const [progress, setProgress] = useState(0);
  const [speed, setSpeed] = useState(0);
  const [meta, setMeta] = useState(null); // { name, size, hash, totalChunks }
  const [error, setError] = useState(null);

  const peerRef = useRef(null);
  const chunksRef = useRef([]);
  const receivedRef = useRef(0);
  const startRef = useRef(null);
  const metaRef = useRef(null);

  useEffect(() => {
    if (!socket) return;

    socket.emit('join-room', { roomId });

    const onSignal = ({ data }) => {
      if (!peerRef.current) createPeer();
      peerRef.current.signal(data);
    };
    const onPeerDisconnected = () => {
      if (metaRef.current && status !== 'done') {
        setError('The sender disconnected before the transfer finished.');
        setStatus('error');
      } else if (!metaRef.current) {
        setError('The sender disconnected.');
        setStatus('error');
      }
    };
    const onRoomFull = () => {
      setError('This room is full (it already has two people).');
      setStatus('error');
    };

    socket.on('signal', onSignal);
    socket.on('peer-disconnected', onPeerDisconnected);
    socket.on('room-full', onRoomFull);

    return () => {
      socket.off('signal', onSignal);
      socket.off('peer-disconnected', onPeerDisconnected);
      socket.off('room-full', onRoomFull);
      if (peerRef.current) peerRef.current.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket, roomId]);

  function createPeer() {
    const peer = new SimplePeer({ initiator: false, trickle: true });

    peer.on('signal', (data) => socket.emit('signal', { roomId, data }));
    peer.on('connect', () => {
      setStatus((s) => (s === 'connecting' ? 'ready' : s));
      setError(null);
    });
    peer.on('data', onData);
    peer.on('error', (err) => setError(`Connection error: ${err.message}`));

    peerRef.current = peer;
  }

  function onData(data) {
    // Every message is framed with a 1-byte type prefix (see Sender).
    const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);

    if (bytes[0] === TYPE_CONTROL) {
      const msg = JSON.parse(new TextDecoder().decode(bytes.subarray(1)));
      if (msg.type === 'header') {
        metaRef.current = msg;
        setMeta(msg);
        chunksRef.current = [];
        receivedRef.current = 0;
        startRef.current = Date.now();
        setStatus('receiving');
      } else if (msg.type === 'done') {
        finish();
      }
      return;
    }

    // File chunk. SCTP delivers messages reliably and in order.
    const chunk = bytes.subarray(1);
    chunksRef.current.push(chunk);
    receivedRef.current += chunk.length;

    const m = metaRef.current;
    if (m) {
      const elapsed = (Date.now() - startRef.current) / 1000;
      setProgress(Math.round((receivedRef.current / m.size) * 100));
      setSpeed(elapsed > 0 ? (receivedRef.current / (1024 * 1024) / elapsed).toFixed(2) : 0);
    }
  }

  async function finish() {
    setStatus('verifying');
    const blob = new Blob(chunksRef.current);

    // Verify integrity: the receiver re-hashes the reassembled file and
    // compares against the hash the sender computed before transfer.
    const hash = await calculateSHA256(blob);
    if (hash !== metaRef.current.hash) {
      setError('Integrity check failed — the file hash does not match. Nothing was saved.');
      setStatus('error');
      return;
    }

    download(blob, metaRef.current.name);
    setProgress(100);
    setStatus('done');
  }

  function download(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-600 to-emerald-900 p-4 flex items-center justify-center">
      <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-xl w-full">
        <h1 className="text-2xl font-bold text-gray-800 mb-1">📥 Receive a File</h1>
        <p className="text-gray-500 mb-6">
          Room <span className="font-mono font-semibold text-emerald-600">{roomId}</span>
        </p>

        {error && (
          <div className="mb-5 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>
        )}

        {status === 'connecting' && (
          <div className="p-3 bg-amber-50 text-amber-700 rounded-lg text-sm font-medium">
            ⏳ Connecting to the sender…
          </div>
        )}

        {status === 'ready' && (
          <div className="p-3 bg-green-50 text-green-700 rounded-lg text-sm font-medium">
            ✅ Connected. Waiting for the sender to start the transfer…
          </div>
        )}

        {(status === 'receiving' || status === 'verifying' || status === 'done') && meta && (
          <div className="p-4 bg-gray-50 rounded-xl border border-gray-200">
            <div className="flex justify-between text-sm mb-1">
              <span className="text-gray-700 font-medium truncate pr-2">{meta.name}</span>
              <span className="text-gray-500 shrink-0">{formatBytes(meta.size)}</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden mt-2">
              <div className="bg-emerald-600 h-3 rounded-full transition-all" style={{ width: `${progress}%` }} />
            </div>
            <div className="flex justify-between mt-2 text-sm text-gray-600">
              <span>{progress}%</span>
              <span>{speed} MB/s</span>
            </div>

            {status === 'verifying' && (
              <p className="mt-3 text-center text-blue-700 text-sm font-medium">🔍 Verifying SHA-256…</p>
            )}
            {status === 'done' && (
              <div className="mt-4 text-center">
                <p className="text-green-700 font-medium">✅ Verified &amp; downloaded!</p>
                <p className="text-gray-400 text-xs mt-1">Check your Downloads folder.</p>
                <button onClick={() => location.reload()} className="mt-3 bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2 rounded-lg text-sm font-medium">
                  Receive Another File
                </button>
              </div>
            )}
          </div>
        )}

        {status === 'error' && (
          <button onClick={() => location.reload()} className="w-full mt-4 bg-emerald-600 hover:bg-emerald-700 text-white py-2.5 rounded-lg font-medium">
            Try Again
          </button>
        )}
      </div>
    </div>
  );
}

export default Receiver;
