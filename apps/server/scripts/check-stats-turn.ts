import { createGame } from '../src/engine/index.js';
import { applyTurnTotal } from '../src/engine/turn.js';

let s = createGame(
  { mode: 'x01', startScore: 501, sets: 1, legsPerSet: 1, inMode: 'straight', outMode: 'double' },
  [
    { id: 'p1', name: 'A', isBot: false },
    { id: 'p2', name: 'B', isBot: false },
  ],
);

// p1 throws 3 turn-totals of 92 each => 276 over 9 darts. avg = 92.
// But user says: 92 in 9 darts shows as avg 92. So they had ONE 92-total turn.
s = applyTurnTotal(s, 'p1', { total: 92 }).state;
s = applyTurnTotal(s, 'p2', { total: 30 }).state;
s = applyTurnTotal(s, 'p1', { total: 0 }).state;
s = applyTurnTotal(s, 'p2', { total: 30 }).state;
s = applyTurnTotal(s, 'p1', { total: 0 }).state;
s = applyTurnTotal(s, 'p2', { total: 30 }).state;

if (s.modeState.mode === 'x01') {
  console.log('p1 dartsThrown:', s.modeState.dartsThrown['p1']);
  console.log('p1 scoredInLeg:', s.modeState.scoredInLeg['p1']);
  const avg = (s.modeState.scoredInLeg['p1']! / s.modeState.dartsThrown['p1']!) * 3;
  console.log('computed 3-dart avg:', avg.toFixed(2));
  console.log('first9Score:', s.modeState.first9Score['p1'], 'first9Darts:', s.modeState.first9Darts['p1']);
}
