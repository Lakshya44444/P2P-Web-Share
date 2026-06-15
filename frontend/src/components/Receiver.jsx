import { useState, useRef, useEffect } from 'react';
import SimplePeer from 'simple-peer';
import { calculateSHA256, formatBytes } from '../utils/crypto';
import { Logo, Check, Shield, Spinner, Warn, File as FileIcon } from './icons';

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
    <div className="app-bg min-h-screen p-4 flex items-center justify-center">
      <div className="w-full max-w-xl animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2.5">
            <span className="grid place-items-center w-9 h-9 rounded-xl bg-emerald-100 text-emerald-600 ring-1 ring-emerald-200">
              <Logo className="w-5 h-5" />
            </span>
            <div>
              <p className="text-slate-800 font-semibold leading-tight">Receiving</p>
              <p className="text-slate-500 text-xs">Room <span className="font-mono text-emerald-600">{roomId}</span></p>
            </div>
          </div>
          <span className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full ring-1 ${status === 'connecting' ? 'bg-amber-100 text-amber-700 ring-amber-200' : status === 'error' ? 'bg-red-100 text-red-700 ring-red-200' : 'bg-emerald-100 text-emerald-700 ring-emerald-200'}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${status === 'connecting' ? 'bg-amber-500 animate-pulse' : status === 'error' ? 'bg-red-500' : 'bg-emerald-500'}`} />
            {status === 'connecting' ? 'Connecting' : status === 'error' ? 'Disconnected' : 'Connected'}
          </span>
        </div>

        <div className="bg-white rounded-3xl shadow-xl ring-1 ring-slate-200/70 p-7">
          {error && (
            <div className="mb-5 flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
              <Warn className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {status === 'connecting' && (
            <div className="flex flex-col items-center text-center py-6">
              <Spinner className="w-8 h-8 text-amber-500 mb-3" />
              <p className="text-slate-600 font-medium">Connecting to the sender…</p>
            </div>
          )}

          {status === 'ready' && (
            <div className="flex flex-col items-center text-center py-4">
              <img
                src="https://illustrations.popsy.co/blue/remote-work.svg"
                alt=""
                className="h-28 mb-2 select-none pointer-events-none"
                onError={(e) => { e.currentTarget.style.display = 'none'; }}
              />
              <p className="text-slate-700 font-medium">Connected to the sender</p>
              <p className="text-slate-400 text-sm">Waiting for the transfer to start…</p>
            </div>
          )}

          {(status === 'receiving' || status === 'verifying' || status === 'done') && meta && (
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200">
              <div className="flex items-center gap-3 mb-3">
                <span className="grid place-items-center w-10 h-10 rounded-xl bg-white text-emerald-600 ring-1 ring-slate-200 shrink-0">
                  <FileIcon className="w-5 h-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-slate-800 font-medium truncate">{meta.name}</p>
                  <p className="text-slate-400 text-xs">{formatBytes(meta.size)}</p>
                </div>
              </div>
              <div className="w-full bg-slate-200 rounded-full h-2.5 overflow-hidden">
                <div className="bg-gradient-to-r from-emerald-500 to-teal-500 h-2.5 rounded-full transition-all" style={{ width: `${progress}%` }} />
              </div>
              <div className="flex justify-between mt-2 text-sm">
                <span className="font-semibold text-slate-700">{progress}%</span>
                <span className="text-slate-500">{speed} MB/s</span>
              </div>

              {status === 'verifying' && (
                <p className="mt-3 flex items-center justify-center gap-2 text-indigo-600 text-sm font-medium">
                  <Spinner className="w-4 h-4" /> Verifying SHA-256…
                </p>
              )}
              {status === 'done' && (
                <div className="mt-4 flex flex-col items-center text-center">
                  <span className="grid place-items-center w-11 h-11 rounded-full bg-emerald-100 text-emerald-600 mb-2">
                    <Check className="w-6 h-6" />
                  </span>
                  <p className="text-slate-700 font-medium">Verified &amp; downloaded</p>
                  <p className="text-slate-400 text-xs mt-1 flex items-center gap-1">
                    <Shield className="w-3.5 h-3.5" /> Integrity confirmed · check your Downloads folder
                  </p>
                  <button onClick={() => location.reload()} className="mt-3 bg-slate-900 hover:bg-slate-800 text-white px-5 py-2.5 rounded-xl text-sm font-medium">
                    Receive Another File
                  </button>
                </div>
              )}
            </div>
          )}

          {status === 'error' && (
            <button onClick={() => location.reload()} className="w-full mt-1 bg-slate-900 hover:bg-slate-800 text-white py-3 rounded-xl font-medium">
              Try Again
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default Receiver;
