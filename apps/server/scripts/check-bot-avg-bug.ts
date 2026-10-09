/**
 * Reproduce user report: beginner bot (targetAverage 45) throws 9 darts in x01.
 * They say avg shows 95 but only 65 actually scored.
 *
 * Hypothesis: engine math is correct -> avg should be ~ scoredInLeg/darts*3,
 * proportional to actual points. Anything else points at a state bug.
 */
import { createGame, applyThrow } from '../src/engine/index.js';
import { botThrow } from '../src/engine/bot.js';
import { BOT_PRESETS } from '@darts/shared';

const seed = Number(process.argv[2] ?? Date.now()) >>> 0;
let rngState = seed;
function rng(): number {
  // xorshift32 for reproducibility
  rngState ^= rngState << 13;
  rngState ^= rngState >>> 17;
  rngState ^= rngState << 5;
  return (rngState >>> 0) / 0xffffffff;
}

let s = createGame(
  { mode: 'x01', startScore: 501, sets: 1, legsPerSet: 1, inMode: 'straight', outMode: 'double' },
  [
    { id: 'b', name: 'BeginnerBot', isBot: true, botConfig: BOT_PRESETS.beginner },
    { id: 'h', name: 'Hum', isBot: false },
  ],
);

const log: string[] = [];
function snap(label: string) {
  if (s.modeState.mode !== 'x01') return;
  const ms = s.modeState;
  const darts = ms.dartsThrown['b'] ?? 0;
  const scored = ms.scoredInLeg['b'] ?? 0;
  const remaining = ms.scores['b'] ?? 0;
  const avg = darts === 0 ? 0 : (scored / darts) * 3;
  log.push(
    `${label} darts=${darts} scoredInLeg=${scored} remaining=${remaining} ` +
      `pointsActuallyTaken=${501 - remaining} computedAvg=${avg.toFixed(2)}`,
  );
}

snap('init');

// Run three bot turns of 3 darts each (the bot is first since added first).
for (let turn = 0; turn < 3; turn++) {
  // Bot turn
  for (let d = 0; d < 3 && s.players[s.currentPlayerIndex]?.id === 'b' && s.status === 'active'; d++) {
    const t = botThrow(s, 'b', { rng });
    const r = applyThrow(s, 'b', t);
    s = r.state;
    snap(`  bot t${turn + 1} d${d + 1} (${t.multiplier === 2 ? 'D' : t.multiplier === 3 ? 'T' : 'S'}${t.segment}=${t.score})`);
  }
  // Human throws 3 misses to pass the turn back.
  for (let d = 0; d < 3 && s.players[s.currentPlayerIndex]?.id === 'h' && s.status === 'active'; d++) {
    s = applyThrow(s, 'h', { segment: 0, multiplier: 1 }).state;
  }
}

console.log(`seed=${seed}`);
for (const l of log) console.log(l);
