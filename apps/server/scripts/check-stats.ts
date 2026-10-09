import { createGame, applyThrow } from '../src/engine/index.js';

let s = createGame(
  { mode: 'x01', startScore: 501, sets: 1, legsPerSet: 1, inMode: 'straight', outMode: 'double' },
  [
    { id: 'p1', name: 'A', isBot: false },
    { id: 'p2', name: 'B', isBot: false },
  ],
);

// p1 throws 3 full turns of 30+1+1 = 32 each => 96 over 9 darts.
for (let turn = 0; turn < 3; turn++) {
  s = applyThrow(s, 'p1', { segment: 10, multiplier: 3 }).state; // 30
  s = applyThrow(s, 'p1', { segment: 1, multiplier: 1 }).state;  // 1
  s = applyThrow(s, 'p1', { segment: 1, multiplier: 1 }).state;  // 1 → turn ends
  s = applyThrow(s, 'p2', { segment: 1, multiplier: 1 }).state;
  s = applyThrow(s, 'p2', { segment: 1, multiplier: 1 }).state;
  s = applyThrow(s, 'p2', { segment: 1, multiplier: 1 }).state;
}

if (s.modeState.mode === 'x01') {
  console.log('p1 dartsThrown:', s.modeState.dartsThrown['p1']);
  console.log('p1 scoredInLeg:', s.modeState.scoredInLeg['p1']);
  console.log('p1 first9Darts:', s.modeState.first9Darts['p1']);
  console.log('p1 first9Score:', s.modeState.first9Score['p1']);
  const avg = (s.modeState.scoredInLeg['p1']! / s.modeState.dartsThrown['p1']!) * 3;
  console.log('computed avg:', avg.toFixed(2));
}
