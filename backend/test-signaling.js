// Integration test for the signaling server.
// Simulates two peers: verifies room creation, join, the peer-ready trigger,
// bidirectional signal relay, and peer-disconnected notification.
const { io } = require('socket.io-client');

const URL = 'http://localhost:4000';
const log = (...a) => console.log(...a);
let failures = 0;
const assert = (cond, msg) => { if (!cond) { failures++; log('  ✗ FAIL:', msg); } else { log('  ✓', msg); } };

async function main() {
  // 1. Create a room over HTTP
  const res = await fetch(`${URL}/api/create-room`, { method: 'POST' });
  const { roomId, shareUrl } = await res.json();
  assert(!!roomId && roomId.length === 6, `room created: ${roomId}`);
  assert(shareUrl.includes(roomId), 'shareUrl contains roomId');

  // 2. Connect sender + receiver
  const sender = io(URL);
  const receiver = io(URL);
  await Promise.all([once(sender, 'connect'), once(receiver, 'connect')]);
  log('  ✓ both clients connected');

  // 3. Sender joins first → should be told it is waiting
  const senderJoined = once(sender, 'joined');
  sender.emit('join-room', { roomId });
  const sj = await senderJoined;
  assert(sj.waiting === true, 'sender joined, waiting for peer');

  // 4. Sender should get 'peer-ready' when receiver joins
  const peerReady = once(sender, 'peer-ready');
  const receiverJoined = once(receiver, 'joined');
  receiver.emit('join-room', { roomId });
  const [, rj] = await Promise.all([peerReady, receiverJoined]);
  assert(rj.waiting === false, 'receiver joined, not waiting');
  log('  ✓ sender received peer-ready');

  // 5. Signal relay: sender → receiver
  const recvGotSignal = once(receiver, 'signal');
  sender.emit('signal', { roomId, data: { sdp: 'fake-offer' } });
  const s1 = await recvGotSignal;
  assert(s1.data.sdp === 'fake-offer', 'receiver got sender signal');

  // 6. Signal relay: receiver → sender
  const sendGotSignal = once(sender, 'signal');
  receiver.emit('signal', { roomId, data: { sdp: 'fake-answer' } });
  const s2 = await sendGotSignal;
  assert(s2.data.sdp === 'fake-answer', 'sender got receiver signal');

  // 7. Disconnect notification
  const disc = once(sender, 'peer-disconnected');
  receiver.close();
  await disc;
  log('  ✓ sender notified of peer-disconnected');

  // 8. Third peer cannot join a full room
  const r2 = await fetch(`${URL}/api/create-room`, { method: 'POST' });
  const { roomId: room2 } = await r2.json();
  const a = io(URL), b = io(URL), c = io(URL);
  await Promise.all([once(a, 'connect'), once(b, 'connect'), once(c, 'connect')]);
  a.emit('join-room', { roomId: room2 }); await once(a, 'joined');
  b.emit('join-room', { roomId: room2 }); await once(b, 'joined');
  const full = once(c, 'room-full');
  c.emit('join-room', { roomId: room2 });
  await full;
  log('  ✓ third peer rejected with room-full');

  sender.close(); a.close(); b.close(); c.close();

  log(failures === 0 ? '\nALL SIGNALING TESTS PASSED ✅' : `\n${failures} TEST(S) FAILED ❌`);
  process.exit(failures === 0 ? 0 : 1);
}

function once(socket, event) {
  return new Promise((resolve) => socket.once(event, resolve));
}

main().catch((e) => { console.error('Test error:', e); process.exit(1); });
