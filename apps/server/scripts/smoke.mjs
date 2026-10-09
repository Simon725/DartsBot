import { io } from 'socket.io-client';

const URL = 'http://localhost:3000';

const sock = io(URL);

const states = [];
let finished = null;

sock.on('connect', async () => {
  console.log('connected', sock.id);
  sock.on('game:state', ({ state }) => {
    states.push(state);
  });
  sock.on('game:finished', (payload) => {
    finished = payload;
  });

  const ack = await sock.emitWithAck('game:create', {
    config: {
      mode: 'x01',
      startScore: 501,
      sets: 1,
      legsPerSet: 1,
      inMode: 'straight',
      outMode: 'double',
    },
    players: [
      { id: 'p1', name: 'Alice', isBot: false },
      { id: 'p2', name: 'BotPro', isBot: true, botDifficulty: 'pro' },
    ],
  });
  console.log('create ack:', ack);
  if ('error' in ack) {
    process.exit(1);
  }
  const gameId = ack.gameId;

  // Simulate Alice finishing 501 with three turns of T20/T20/Bull-ish.
  const throws = [
    // turn 1: T20, T20, T20 → -180 = 321
    { segment: 20, multiplier: 3, score: 60, isValid: true },
    { segment: 20, multiplier: 3, score: 60, isValid: true },
    { segment: 20, multiplier: 3, score: 60, isValid: true },
    // After Alice's turn, bot will throw 3 darts. We wait a bit.
  ];

  for (const t of throws) {
    sock.emit('game:throw', { gameId, playerId: 'p1', throw: t });
    await new Promise((r) => setTimeout(r, 50));
  }
  // Let bot finish its turn (3 darts, 800ms delay then per-dart immediate).
  await new Promise((r) => setTimeout(r, 2500));

  console.log('state count:', states.length);
  const last = states[states.length - 1];
  console.log('current scores:', last?.scores);
  console.log('current player index:', last?.currentPlayerIndex);
  console.log('legs:', last?.legs);
  console.log('finished:', finished?.winner?.name ?? 'no');
  sock.disconnect();
  process.exit(0);
});

sock.on('connect_error', (e) => {
  console.error('connect error', e.message);
  process.exit(1);
});

setTimeout(() => {
  console.error('timeout');
  process.exit(2);
}, 10000);
