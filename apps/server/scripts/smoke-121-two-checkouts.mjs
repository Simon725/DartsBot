import { io } from 'socket.io-client';

const URL = 'http://localhost:3000';
const sock = io(URL, { forceNew: true });

let lastState = null;
let finished = null;
const stateLog = [];

sock.on('connect_error', (e) => { console.error('connect error', e.message); process.exit(1); });
sock.on('game:state', ({ state }) => {
  lastState = state;
  if (state.modeState.mode === '121') {
    stateLog.push({
      target: state.modeState.currentTarget,
      remaining: state.modeState.remaining,
      dartsUsed: state.modeState.dartsUsed,
      checkouts: state.modeState.checkouts,
      status: state.status,
      currentThrows: state.currentThrows.length,
    });
  }
});
sock.on('game:finished', (p) => { finished = p; });

sock.on('connect', async () => {
  const ack = await sock.emitWithAck('game:create', {
    config: { mode: '121', dartLimit: 9 },
    players: [{ id: 'p1', name: 'Alice', isBot: false }],
  });
  if ('error' in ack) { console.error(ack.error); process.exit(1); }
  const gameId = ack.gameId;

  const T = (s, m) => ({ segment: s, multiplier: m, score: s * m, isValid: true });

  // First checkout: 121 via T17+T18+D8.
  sock.emit('game:throw', { gameId, playerId: 'p1', throw: T(17, 3) });
  await new Promise(r => setTimeout(r, 80));
  sock.emit('game:throw', { gameId, playerId: 'p1', throw: T(18, 3) });
  await new Promise(r => setTimeout(r, 80));
  sock.emit('game:throw', { gameId, playerId: 'p1', throw: T(8, 2) });
  await new Promise(r => setTimeout(r, 150));

  // Now target is 122. Second checkout: T18+T18+D7 = 54+54+14 = 122.
  sock.emit('game:throw', { gameId, playerId: 'p1', throw: T(18, 3) });
  await new Promise(r => setTimeout(r, 80));
  sock.emit('game:throw', { gameId, playerId: 'p1', throw: T(18, 3) });
  await new Promise(r => setTimeout(r, 80));
  sock.emit('game:throw', { gameId, playerId: 'p1', throw: T(7, 2) });
  await new Promise(r => setTimeout(r, 150));

  console.log('state log:');
  for (const s of stateLog) console.log('  ', s);
  console.log('final:', JSON.stringify({
    status: lastState?.status,
    modeState: lastState?.modeState,
    finishedEvent: finished?.winner?.name ?? null,
  }, null, 2));
  sock.disconnect();
  process.exit(0);
});

setTimeout(() => { console.error('timeout'); process.exit(2); }, 5000);
