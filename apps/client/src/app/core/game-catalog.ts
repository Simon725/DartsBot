import type { GameMode } from '@darts/shared';

export interface GameInfo {
  mode: GameMode;
  title: string;
  tagline: string;
  rules: string;
  kind: 'match' | 'practice';
}

export const GAME_CATALOG: readonly GameInfo[] = [
  {
    mode: 'x01',
    title: 'x01',
    tagline: 'Count down from 501 and finish on a double.',
    rules:
      'Each player starts on the same score and subtracts every throw. Go below zero, or leave yourself on 1 with double out, and the turn is bust.',
    kind: 'match',
  },
  {
    mode: 'cricket',
    title: 'Cricket',
    tagline: 'Close 15 to 20 and the bull.',
    rules:
      'Three marks close a number. Hit a number you closed while your opponent has not, and you score it. Close everything with the most points to win.',
    kind: 'match',
  },
  {
    mode: 'killer',
    title: 'Killer',
    tagline: 'Hit your double, then hunt the others.',
    rules:
      'Each player gets a number. Hit your own double to become a killer, then hit other players’ doubles to take their lives. Last one standing wins.',
    kind: 'match',
  },
  {
    mode: 'around-the-clock',
    title: 'Around the Clock',
    tagline: 'Hit 1 to 20 in order.',
    rules: 'Work your way from 1 to 20. Doubles and trebles count as one hit. First to finish wins.',
    kind: 'practice',
  },
  {
    mode: 'shanghai',
    title: 'Shanghai',
    tagline: 'One number per round. Single, double, treble.',
    rules:
      'Round one targets 1, round two targets 2, and so on. Only the round’s number scores. Hit its single, double and treble in one turn for an instant win.',
    kind: 'practice',
  },
  {
    mode: '121',
    title: '121',
    tagline: 'Endless checkout drill.',
    rules:
      'Start at 121 and check out on a double within the dart limit. Each success raises the target by one. Play solo until you stop.',
    kind: 'practice',
  },
];

export function findGame(mode: string | null | undefined): GameInfo | undefined {
  return GAME_CATALOG.find((game) => game.mode === mode);
}
