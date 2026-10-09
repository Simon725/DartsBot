import { io } from 'socket.io-client';

const URL = 'http://localhost:3000';

async function testMode(name, config, throws, players = [
  { id: 'p1', name: 'Alice', isBot: false },
  { id: 'p2', name: 'Bob', isBot: false },
]) {
  const sock = io(URL, { forceNew: true });
  return new Promise((resolve, reject) => {
    let lastState = null;
    sock.on('connect_error', (e) => reject(new Error(`connect_error: ${e.message}`)));
    sock.on('game:state', ({ state }) => { lastState = state; });
    sock.on('connect', async () => {
      try {
        const ack = await sock.emitWithAck('game:create', { config, players });
        if ('error' in ack) throw new Error(`create failed: ${ack.error}`);
        const gameId = ack.gameId;
        for (const [playerId, t] of throws) {
          sock.emit('game:throw', { gameId, playerId, throw: t });
          await new Promise((r) => setTimeout(r, 30));
        }
        await new Promise((r) => setTimeout(r, 200));
        console.log(`✓ ${name}:`, JSON.stringify({
          mode: lastState?.modeState?.mode,
          status: lastState?.status,
          winner: lastState?.winner ?? null,
        }));
        sock.disconnect();
        resolve(lastState);
      } catch (err) {
        sock.disconnect();
        reject(err);
      }
    });
    setTimeout(() => { sock.disconnect(); reject(new Error('timeout')); }, 5000);
  });
}

const T = (s, m = 1) => ['p1', { segment: s, multiplier: m, score: s * m, isValid: true }];
const T2 = (s, m = 1) => ['p2', { segment: s, multiplier: m, score: s * m, isValid: true }];

try {
  await testMode('x01-501', {
    mode: 'x01', startScore: 501, sets: 1, legsPerSet: 1,
    inMode: 'straight', outMode: 'double',
  }, [T(20, 3), T(20, 3), T(20, 3)]);

  await testMode('cricket', { mode: 'cricket' }, [T(20, 3), T(19, 3), T(18, 3)]);

  await testMode('atc', { mode: 'around-the-clock' }, [T(1), T(2), T(3)]);

  await testMode('shanghai-7', { mode: 'shanghai', rounds: 7 },
    [T(1, 1), T(1, 2), T(1, 3)]); // instant Shanghai

  await testMode('killer', { mode: 'killer', startingLives: 3 },
    [T(20, 2), T(20, 1), T(20, 1)]);

  // 121 is a solo human drill — one player, dartLimit required.
  await testMode('121', { mode: '121', dartLimit: 9 },
    [T(17, 3), T(18, 3), T(8, 2)],
    [{ id: 'p1', name: 'Alice', isBot: false }]);

  console.log('\nAll modes smoke-tested OK.');
  process.exit(0);
} catch (err) {
  console.error('FAIL:', err.message);
  process.exit(1);
}
