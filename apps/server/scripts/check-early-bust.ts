/**
 * Early-bust dart counting: if bot has remaining=50 and throws T20 (60) on dart 1,
 * does dartsThrown become 1 or 3?
 */
import { createGame, applyThrow } from '../src/engine/index.js';

let s = createGame(
  { mode: 'x01', startScore: 50, sets: 1, legsPerSet: 1, inMode: 'straight', outMode: 'double' },
  [
    { id: 'b', name: 'Bot', isBot: false },
    { id: 'h', name: 'Hum', isBot: false },
  ],
);
// Dart 1: T20=60, remaining 50 -> bust on dart 1.
s = applyThrow(s, 'b', { segment: 20, multiplier: 3 }).state;
if (s.modeState.mode === 'x01') {
  const ms = s.modeState;
  console.log('after dart-1 bust:');
  console.log('  dartsThrown:', ms.dartsThrown['b']);
  console.log('  remaining:', ms.scores['b']);
  console.log('  currentPlayerIndex:', s.currentPlayerIndex);
}
