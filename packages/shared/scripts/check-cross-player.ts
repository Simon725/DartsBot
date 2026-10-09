/**
 * Repro user report: human throws 100 (turn-total), bot throws 21 over 3 darts.
 * Expected: human scoredInLeg=100 dartsThrown=3; bot scoredInLeg=21 dartsThrown=3.
 * User sees: human avg=100 (100/3*3 ok), bot avg=121 (i.e. bot.scoredInLeg=121).
 */
import { createGame, applyThrow } from '../src/engine/index.js';
import { applyTurnTotal } from '../src/engine/turn.js';

let s = createGame(
  { mode: 'x01', startScore: 501, sets: 1, legsPerSet: 3, inMode: 'straight', outMode: 'double' },
  [
    { id: 'p1', name: 'Player 1', isBot: false },
    { id: 'b', name: 'Bot', isBot: true, botConfig: { targetAverage: 45, checkoutPercent: 12 } },
  ],
);

// Human turn: 100 total via turn-total.
s = applyTurnTotal(s, 'p1', { total: 100 }).state;
console.log('after human 100:');
console.log('  currentPlayerIndex:', s.currentPlayerIndex, 'players:', s.players.map(p => p.id));
if (s.modeState.mode === 'x01') {
  const ms = s.modeState;
  console.log('  p1 scored:', ms.scoredInLeg['p1'], 'darts:', ms.dartsThrown['p1']);
  console.log('  b  scored:', ms.scoredInLeg['b'],  'darts:', ms.dartsThrown['b']);
}

// Bot turn: 3 darts scoring 7+7+7=21 (S7 S7 S7).
s = applyThrow(s, 'b', { segment: 7, multiplier: 1 }).state;
s = applyThrow(s, 'b', { segment: 7, multiplier: 1 }).state;
s = applyThrow(s, 'b', { segment: 7, multiplier: 1 }).state;
console.log('after bot 21:');
if (s.modeState.mode === 'x01') {
  const ms = s.modeState;
  console.log('  p1 scored:', ms.scoredInLeg['p1'], 'darts:', ms.dartsThrown['p1']);
  console.log('  b  scored:', ms.scoredInLeg['b'],  'darts:', ms.dartsThrown['b']);
  console.log('  p1 avg:', ((ms.scoredInLeg['p1']! / ms.dartsThrown['p1']!) * 3).toFixed(2));
  console.log('  b  avg:', ((ms.scoredInLeg['b']!  / ms.dartsThrown['b']!)  * 3).toFixed(2));
  console.log('  p1 first9Darts:', ms.first9Darts['p1'], 'first9Score:', ms.first9Score['p1']);
  console.log('  b  first9Darts:', ms.first9Darts['b'],  'first9Score:', ms.first9Score['b']);
}
