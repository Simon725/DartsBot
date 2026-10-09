import { io } from 'socket.io-client';

const URL = 'http://localhost:3000';
const sock = io(URL, { forceNew: true });

let lastState = null;
let finished = null;

sock.on('connect_error', (e) => { console.error('connect error', e.message); process.exit(1); });
sock.on('game:state', ({ state }) => { lastState = state; });
sock.on('game:finished', (p) => { finished = p; });

sock.on('connect', async () => {
  console.log('connected', sock.id);
  const ack = await sock.emitWithAck('game:create', {
    config: { mode: '121', dartLimit: 9 },
    players: [{ id: 'p1', name: 'Alice', isBot: false }],
  });
  if ('error' in ack) { console.error(ack.error); process.exit(1); }
  const gameId = ack.gameId;
  console.log('game created', gameId);

  const T = (segment, multiplier) => ({ segment, multiplier, score: segment * multiplier, isValid: true });

  // Check out 121: T17 + T18 + D8 = 51 + 54 + 16 = 121
  sock.emit('game:throw', { gameId, playerId: 'p1', throw: T(17, 3) });
  await new Promise(r => setTimeout(r, 80));
  sock.emit('game:throw', { gameId, playerId: 'p1', throw: T(18, 3) });
  await new Promise(r => setTimeout(r, 80));
  sock.emit('game:throw', { gameId, playerId: 'p1', throw: T(8, 2) });
  await new Promise(r => setTimeout(r, 200));

  console.log('after first checkout:', JSON.stringify({
    status: lastState?.status,
    modeState: lastState?.modeState,
    winner: lastState?.winner,
    finishedEvent: finished?.winner?.name ?? null,
  }, null, 2));
  sock.disconnect();
  process.exit(0);
});

setTimeout(() => { console.error('timeout'); process.exit(2); }, 5000);
