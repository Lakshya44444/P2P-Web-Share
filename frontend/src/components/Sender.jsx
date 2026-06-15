import { useState, useRef, useEffect } from 'react';
import SimplePeer from 'simple-peer';
import { calculateSHA256, formatBytes } from '../utils/crypto';
import { Logo, Upload, Copy, Check, Spinner, Warn, File as FileIcon, Send } from './icons';

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

  const shareUrl = `${window.location.origin}/?room=${roomId}`;

  return (
    <div className="app-bg min-h-screen p-4 flex items-center justify-center">
      <div className="w-full max-w-xl animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2.5">
            <span className="grid place-items-center w-9 h-9 rounded-xl bg-indigo-100 text-indigo-600 ring-1 ring-indigo-200">
              <Logo className="w-5 h-5" />
            </span>
            <div>
              <p className="text-slate-800 font-semibold leading-tight">Sending</p>
              <p className="text-slate-500 text-xs">Room <span className="font-mono text-indigo-600">{roomId}</span></p>
            </div>
          </div>
          <span className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full ring-1 ${peerConnected ? 'bg-emerald-100 text-emerald-700 ring-emerald-200' : 'bg-amber-100 text-amber-700 ring-amber-200'}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${peerConnected ? 'bg-emerald-500' : 'bg-amber-500 animate-pulse'}`} />
            {peerConnected ? 'Receiver connected' : 'Waiting for receiver'}
          </span>
        </div>

        <div className="bg-white rounded-3xl shadow-xl ring-1 ring-slate-200/70 p-7">
          {/* Share link */}
          <label className="block text-sm font-medium text-slate-600 mb-2">Share this link with the receiver</label>
          <div className="flex gap-2">
            <input
              readOnly
              value={shareUrl}
              onFocus={(e) => e.target.select()}
              className="flex-1 px-3 py-2.5 border border-slate-300 rounded-xl bg-slate-50 text-slate-700 text-sm"
            />
            <button
              onClick={copyLink}
              className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-medium text-white transition ${copied ? 'bg-emerald-600' : 'bg-indigo-600 hover:bg-indigo-700'}`}
            >
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>

          {error && (
            <div className="mt-5 flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
              <Warn className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* File picker */}
          {(status === 'waiting' || status === 'hashing' || status === 'ready') && (
            <>
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
                className="mt-5 border-2 border-dashed border-slate-300 rounded-2xl p-8 text-center hover:border-indigo-400 hover:bg-indigo-50/40 transition"
              >
                <img
                  src="/illustrations/paper-plane.svg"
                  alt=""
                  className="h-24 mx-auto mb-2 select-none pointer-events-none"
                  onError={(e) => { e.currentTarget.style.display = 'none'; }}
                />
                <p className="text-slate-700 font-medium">Drag &amp; drop a file here</p>
                <p className="text-slate-400 text-sm mb-4">or choose one — up to 50 MB</p>
                <input id="file-input" type="file" className="hidden" onChange={(e) => onFileChosen(e.target.files[0])} />
                <label htmlFor="file-input" className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl text-sm font-medium cursor-pointer transition">
                  Choose File
                </label>
              </div>

              {file && (
                <div className="mt-5 p-4 bg-slate-50 rounded-2xl border border-slate-200">
                  <div className="flex items-center gap-3">
                    <span className="grid place-items-center w-10 h-10 rounded-xl bg-white text-indigo-600 ring-1 ring-slate-200 shrink-0">
                      <FileIcon className="w-5 h-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-slate-800 font-medium truncate">{file.name}</p>
                      <p className="text-slate-400 text-xs">{formatBytes(file.size)}</p>
                    </div>
                  </div>
                  <div className="mt-2 flex items-center gap-1.5 text-xs text-slate-400">
                    {status === 'hashing' ? (
                      <><Spinner className="w-3.5 h-3.5" /> Computing SHA-256…</>
                    ) : fileHash ? (
                      <span className="font-mono truncate">SHA-256: {fileHash}</span>
                    ) : null}
                  </div>
                  <button
                    onClick={startTransfer}
                    disabled={!peerConnected || status === 'hashing'}
                    className="w-full mt-3 flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white font-semibold py-3 rounded-xl transition"
                  >
                    <Send className="w-4 h-4" />
                    {peerConnected ? 'Send File' : 'Waiting for receiver…'}
                  </button>
                </div>
              )}
            </>
          )}

          {/* Transfer progress */}
          {(status === 'transferring' || status === 'done') && (
            <div className="mt-5 p-4 bg-slate-50 rounded-2xl border border-slate-200">
              <div className="flex items-center justify-between mb-3">
                <span className="text-slate-700 font-medium truncate pr-2">{file?.name}</span>
                <span className="text-slate-400 text-xs shrink-0">{formatBytes(file?.size || 0)}</span>
              </div>
              <div className="w-full bg-slate-200 rounded-full h-2.5 overflow-hidden">
                <div className="bg-gradient-to-r from-indigo-500 to-sky-500 h-2.5 rounded-full transition-all" style={{ width: `${progress}%` }} />
              </div>
              <div className="flex justify-between mt-2 text-sm">
                <span className="font-semibold text-slate-700">{progress}%</span>
                <span className="text-slate-500">{speed} MB/s</span>
              </div>
              {status === 'done' && (
                <div className="mt-4 flex flex-col items-center text-center">
                  <span className="grid place-items-center w-11 h-11 rounded-full bg-emerald-100 text-emerald-600 mb-2">
                    <Check className="w-6 h-6" />
                  </span>
                  <p className="text-slate-700 font-medium">Sent — the receiver is verifying &amp; saving.</p>
                  <button onClick={() => location.reload()} className="mt-3 bg-slate-900 hover:bg-slate-800 text-white px-5 py-2.5 rounded-xl text-sm font-medium">
                    Share Another File
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default Sender;
