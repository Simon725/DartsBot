/**
 * Verify: bot scores 95 on turn 1, busts turns 2 and 3 -> first9Darts stays at 3,
 * first9Score stays at 95 -> displayed 1st-9 avg = 95.
 */
import { createGame, applyThrow } from '../src/engine/index.js';

let s = createGame(
  { mode: 'x01', startScore: 501, sets: 1, legsPerSet: 1, inMode: 'straight', outMode: 'double' },
  [
    { id: 'b', name: 'Bot', isBot: false },
    { id: 'h', name: 'Hum', isBot: false },
  ],
);

// Turn 1: T19 + T19 + S(1) = 57+57+ ... actually let's pick 95 cleanly.
// T20 (60) + S19 + S16 = 60 + 19 + 16 = 95
s = applyThrow(s, 'b', { segment: 20, multiplier: 3 }).state;
s = applyThrow(s, 'b', { segment: 19, multiplier: 1 }).state;
s = applyThrow(s, 'b', { segment: 16, multiplier: 1 }).state;
// Hum's turn (3 misses to pass back)
s = applyThrow(s, 'h', { segment: 0, multiplier: 1 }).state;
s = applyThrow(s, 'h', { segment: 0, multiplier: 1 }).state;
s = applyThrow(s, 'h', { segment: 0, multiplier: 1 }).state;
// Turn 2: bust by scoring more than remaining-1 e.g. start at 406, throw T20 T20 T20 (180) -> 226 left, no bust. We need a real bust.
// Force bust: throw scores until remaining=2 (then S20 busts). Skip: just bust by throwing T20 when remaining=50: 50-60 < 0.
// Simpler: throw T20 T20 with remaining=406 -> 286. Hmm hard to bust without big setup.
// Let's switch: bust by leaving 1 (double-out). Remaining=406, throw 60+60+285... no.
// Easiest path: directly construct a bust. Score 405 in setup so remaining=1 isn't needed; let's instead just throw a turn that bursts to 0 without double.
// remaining=406 after turn 1. Throw T20+T20+S46... S20+S20+S20 = 60. Nope.
// Force bust by going under 0 in one turn: turn3 remaining=346 ish, throw 3xT20=180, fine.
// Easier: use a separate game with low remaining to demonstrate.
console.log('after turn 1 (bot scored 95):');
if (s.modeState.mode === 'x01') {
  const ms = s.modeState;
  console.log('  dartsThrown:', ms.dartsThrown['b'], 'scoredInLeg:', ms.scoredInLeg['b']);
  console.log('  first9Darts:', ms.first9Darts['b'], 'first9Score:', ms.first9Score['b']);
}

// Make a small-remaining state to easily bust.
let s2 = createGame(
  { mode: 'x01', startScore: 50, sets: 1, legsPerSet: 1, inMode: 'straight', outMode: 'double' },
  [
    { id: 'b', name: 'Bot', isBot: false },
    { id: 'h', name: 'Hum', isBot: false },
  ],
);
// Turn 1 (bot): S20 + S20 + S10 = 50 but no double-out so BUST!
s2 = applyThrow(s2, 'b', { segment: 20, multiplier: 1 }).state;
s2 = applyThrow(s2, 'b', { segment: 20, multiplier: 1 }).state;
s2 = applyThrow(s2, 'b', { segment: 10, multiplier: 1 }).state;
console.log('\nbust turn -> stats:');
if (s2.modeState.mode === 'x01') {
  const ms = s2.modeState;
  console.log('  dartsThrown:', ms.dartsThrown['b'], 'scoredInLeg:', ms.scoredInLeg['b']);
  console.log('  first9Darts:', ms.first9Darts['b'], 'first9Score:', ms.first9Score['b']);
  console.log('  remaining:', ms.scores['b']);
}
