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

  // Submit one turn total 121, a declared 3-dart checkout.
  sock.emit('game:throw-turn', { gameId, playerId: 'p1', total: 121, checkoutDarts: 3 });
  await new Promise(r => setTimeout(r, 200));

  console.log('after total checkout:', JSON.stringify({
    status: lastState?.status,
    modeState: lastState?.modeState,
    winner: lastState?.winner,
    finishedEvent: finished?.winner?.name ?? null,
  }, null, 2));

  // 121 never finishes any more: a checkout bumps the target and the drill continues.
  const ok =
    lastState?.status === 'active' &&
    lastState?.modeState?.checkouts === 1 &&
    lastState?.modeState?.currentTarget === 122 &&
    lastState?.modeState?.totalDartsThrown === 3 &&
    finished === null;
  console.log(ok ? 'PASS: checkouts=1, target=122, 3 darts thrown, still active' : 'FAIL: unexpected state after checkout');
  sock.disconnect();
  process.exit(ok ? 0 : 1);
});

setTimeout(() => { console.error('timeout'); process.exit(2); }, 5000);
