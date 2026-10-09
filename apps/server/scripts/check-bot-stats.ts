import { createGame, applyThrow } from '../src/engine/index.js';
import { botThrow } from '../src/engine/bot.js';

let s = createGame(
  { mode: 'x01', startScore: 501, sets: 1, legsPerSet: 1, inMode: 'straight', outMode: 'double' },
  [
    { id: 'b', name: 'Bot', isBot: true, botConfig: { targetAverage: 45, checkoutPercent: 12 } },
    { id: 'h', name: 'Hum', isBot: false },
  ],
);

console.log('initial p1 darts/score:',
  s.modeState.mode === 'x01' ? s.modeState.dartsThrown['b'] + '/' + s.modeState.scoredInLeg['b'] : 'n/a');

let turnCounter = 0;
while (turnCounter < 6 && s.status === 'active') {
  const cur = s.players[s.currentPlayerIndex];
  if (!cur) break;
  if (cur.isBot) {
    // throw 3 darts as bot
    for (let i = 0; i < 3 && s.players[s.currentPlayerIndex]?.id === 'b' && s.status === 'active'; i++) {
      const t = botThrow(s, 'b');
      s = applyThrow(s, 'b', t).state;
    }
  } else {
    // human throws 3x miss
    for (let i = 0; i < 3 && s.players[s.currentPlayerIndex]?.id === 'h' && s.status === 'active'; i++) {
      s = applyThrow(s, 'h', { segment: 0, multiplier: 1 }).state;
    }
  }
  turnCounter++;
  if (s.modeState.mode === 'x01') {
    console.log('after turn', turnCounter, '- bot darts/score:',
      s.modeState.dartsThrown['b'] + '/' + s.modeState.scoredInLeg['b'],
      'avg=' + ((s.modeState.scoredInLeg['b']! / Math.max(1, s.modeState.dartsThrown['b']!)) * 3).toFixed(2));
  }
}
