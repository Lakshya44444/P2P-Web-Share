import { useState, useRef, useEffect } from 'react';
import SimplePeer from 'simple-peer';
import { calculateSHA256, formatBytes } from '../utils/crypto';

const CHUNK_SIZE = 16 * 1024; // 16 KB — safe max for WebRTC data channels
const BUFFER_HIGH = 1 * 1024 * 1024; // pause sending above 1 MB buffered
const BUFFER_LOW = 256 * 1024; // resume once buffer drains below 256 KB
const TYPE_CONTROL = 0; // message prefix: JSON control message
const TYPE_CHUNK = 1; // message prefix: file chunk

// Frame a control message as [TYPE_CONTROL, ...utf8(json)].
function control(obj) {
  const json = new TextEncoder().encode(JSON.stringify(obj));
  const out = new Uint8Array(json.length + 1);
  out[0] = TYPE_CONTROL;
  out.set(json, 1);
  return out;
}

function Sender({ socket, roomId }) {
  const [file, setFile] = useState(null);
  const [fileHash, setFileHash] = useState(null);
  const [status, setStatus] = useState('waiting'); // waiting | ready | hashing | transferring | done
  const [progress, setProgress] = useState(0);
  const [speed, setSpeed] = useState(0);
  const [peerConnected, setPeerConnected] = useState(false);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);

  const peerRef = useRef(null);

  useEffect(() => {
    if (!socket) return;

    // Both peers are in the room — we are the initiator, create the offer.
    const onPeerReady = () => createPeer();
    const onSignal = ({ data }) => peerRef.current && peerRef.current.signal(data);
    const onPeerDisconnected = () => {
      setPeerConnected(false);
      setError('The receiver disconnected.');
      if (status === 'transferring') setStatus('ready');
    };

    socket.on('peer-ready', onPeerReady);
    socket.on('signal', onSignal);
    socket.on('peer-disconnected', onPeerDisconnected);

    return () => {
      socket.off('peer-ready', onPeerReady);
      socket.off('signal', onSignal);
      socket.off('peer-disconnected', onPeerDisconnected);
      if (peerRef.current) peerRef.current.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket]);

  function createPeer() {
    if (peerRef.current) return;
    const peer = new SimplePeer({ initiator: true, trickle: true });

    peer.on('signal', (data) => socket.emit('signal', { roomId, data }));
    peer.on('connect', () => {
      setPeerConnected(true);
      setError(null);
      setStatus((s) => (s === 'waiting' ? 'ready' : s));
    });
    peer.on('error', (err) => setError(`Connection error: ${err.message}`));
    peer.on('close', () => setPeerConnected(false));

    peerRef.current = peer;
  }

  async function onFileChosen(selected) {
    if (!selected) return;
    if (selected.size > 50 * 1024 * 1024) {
      setError('File is larger than 50 MB. Please choose a smaller file.');
      return;
    }
    setError(null);
    setFile(selected);
    setStatus('hashing');
    const hash = await calculateSHA256(selected);
    setFileHash(hash);
    setStatus(peerConnected ? 'ready' : 'waiting');
  }

  // Wait until the data channel buffer drains, so we never overflow it.
  function waitForDrain(channel) {
    return new Promise((resolve) => {
      channel.bufferedAmountLowThreshold = BUFFER_LOW;
      const onLow = () => {
        channel.removeEventListener('bufferedamountlow', onLow);
        resolve();
      };
      channel.addEventListener('bufferedamountlow', onLow);
    });
  }

  async function startTransfer() {
    const peer = peerRef.current;
    if (!file || !peer || !peer.connected) {
      setError('No file selected or peer not connected.');
      return;
    }

    setStatus('transferring');
    setProgress(0);
    setSpeed(0);

    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
    // Every message is framed with a 1-byte type prefix so the receiver can
    // tell control messages from file chunks. (simple-peer delivers all
    // messages as binary, so we can't rely on string-vs-binary detection.)
    peer.send(control({ type: 'header', name: file.name, size: file.size, totalChunks, hash: fileHash }));

    const channel = peer._channel;
    const startTime = Date.now();
    let sent = 0;

    for (let i = 0; i < totalChunks; i++) {
      if (!peer.connected) {
        setError('Connection lost during transfer.');
        setStatus('ready');
        return;
      }

      const start = i * CHUNK_SIZE;
      const buffer = await file.slice(start, start + CHUNK_SIZE).arrayBuffer();
      const bytes = new Uint8Array(buffer);

      const framed = new Uint8Array(bytes.length + 1);
      framed[0] = TYPE_CHUNK;
      framed.set(bytes, 1);
      peer.send(framed);
      sent += bytes.length;

      // Backpressure: if the channel buffer is filling up, wait for it to drain.
      if (channel && channel.bufferedAmount > BUFFER_HIGH) {
        await waitForDrain(channel);
      }

      const elapsed = (Date.now() - startTime) / 1000;
      setProgress(Math.round((sent / file.size) * 100));
      setSpeed(elapsed > 0 ? (sent / (1024 * 1024) / elapsed).toFixed(2) : 0);
    }

    peer.send(control({ type: 'done' }));
    setProgress(100);
    setStatus('done');
  }

  function copyLink() {
    navigator.clipboard.writeText(`${window.location.origin}/?room=${roomId}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleDrop(e) {
    e.preventDefault();
    onFileChosen(e.dataTransfer.files[0]);
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-600 to-blue-900 p-4 flex items-center justify-center">
      <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-xl w-full">
        <h1 className="text-2xl font-bold text-gray-800 mb-1">📤 Share a File</h1>
        <p className="text-gray-500 mb-6">
          Room <span className="font-mono font-semibold text-blue-600">{roomId}</span>
        </p>

        {/* Share link */}
        <div className="mb-5 p-4 bg-blue-50 rounded-xl border border-blue-100">
          <p className="text-sm text-gray-600 mb-2">Send this link to the receiver:</p>
          <div className="flex gap-2">
            <input
              readOnly
              value={`${window.location.origin}/?room=${roomId}`}
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg bg-white text-sm"
            />
            <button onClick={copyLink} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
        </div>

        {/* Connection status */}
        <div className={`mb-5 p-3 rounded-lg text-sm font-medium ${peerConnected ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'}`}>
          {peerConnected ? '✅ Receiver connected' : '⏳ Waiting for the receiver to open the link…'}
        </div>

        {error && (
          <div className="mb-5 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>
        )}

        {/* File picker */}
        {(status === 'waiting' || status === 'hashing' || status === 'ready') && (
          <>
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              className="border-2 border-dashed border-blue-300 rounded-xl p-8 text-center hover:bg-blue-50 transition"
            >
              <div className="text-4xl mb-2">📁</div>
              <p className="text-gray-700 font-medium">Drag &amp; drop a file here</p>
              <p className="text-gray-400 text-sm mb-4">or pick one (max 50 MB)</p>
              <input id="file-input" type="file" className="hidden" onChange={(e) => onFileChosen(e.target.files[0])} />
              <label htmlFor="file-input" className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-lg text-sm font-medium cursor-pointer inline-block">
                Choose File
              </label>
            </div>

            {file && (
              <div className="mt-5 p-4 bg-gray-50 rounded-xl border border-gray-200">
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-700 font-medium truncate pr-2">{file.name}</span>
                  <span className="text-gray-500 shrink-0">{formatBytes(file.size)}</span>
                </div>
                {status === 'hashing' && <p className="text-xs text-gray-400">Computing SHA-256…</p>}
                {fileHash && <p className="text-xs text-gray-400 font-mono truncate">SHA-256: {fileHash}</p>}
                <button
                  onClick={startTransfer}
                  disabled={!peerConnected || status === 'hashing'}
                  className="w-full mt-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white font-semibold py-2.5 rounded-lg transition"
                >
                  {peerConnected ? '🚀 Send File' : 'Waiting for receiver…'}
                </button>
              </div>
            )}
          </>
        )}

        {/* Transfer progress */}
        {(status === 'transferring' || status === 'done') && (
          <div className="mt-2 p-4 bg-gray-50 rounded-xl border border-gray-200">
            <p className="text-gray-700 font-medium mb-3 truncate">{file?.name}</p>
            <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
              <div className="bg-blue-600 h-3 rounded-full transition-all" style={{ width: `${progress}%` }} />
            </div>
            <div className="flex justify-between mt-2 text-sm text-gray-600">
              <span>{progress}%</span>
              <span>{speed} MB/s</span>
            </div>
            {status === 'done' && (
              <div className="mt-4 text-center">
                <p className="text-green-700 font-medium">✅ Sent — receiver is verifying &amp; saving.</p>
                <button onClick={() => location.reload()} className="mt-3 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-lg text-sm font-medium">
                  Share Another File
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default Sender;
