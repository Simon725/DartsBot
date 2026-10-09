import type { AroundTheClockModeState, GameState, Throw } from '@darts/shared';
import { rawScore, type ApplyThrowResult } from './types.js';

export function createAtcState(playerIds: string[]): AroundTheClockModeState {
  const target: Record<string, number> = {};
  for (const id of playerIds) target[id] = 1;
  return { mode: 'around-the-clock', target };
}

export function applyAtcThrow(
  state: GameState,
  playerId: string,
  rawThrow: Pick<Throw, 'segment' | 'multiplier'>,
): ApplyThrowResult {
  if (state.modeState.mode !== 'around-the-clock') {
    throw new Error('applyAtcThrow: not an ATC game');
  }
  const ms = state.modeState;
  const target = ms.target[playerId]!;
  const segment = rawThrow.segment;
  const hit = segment === target;
  const completedThrow: Throw = {
    segment,
    multiplier: rawThrow.multiplier,
    score: rawScore(rawThrow),
    isValid: hit,
  };

  const newTarget = hit ? target + 1 : target;
  const gameWon = newTarget > 20;
  const newTargetMap = { ...ms.target, [playerId]: newTarget };
  const currentThrows = [...state.currentThrows, completedThrow];

  let next: GameState = {
    ...state,
    currentThrows,
    modeState: { ...ms, target: newTargetMap },
  };
  let turnOver = false;

  if (gameWon) {
    next = { ...next, status: 'finished', winner: playerId, currentThrows: [] };
    turnOver = true;
  } else if (currentThrows.length >= 3) {
    next = {
      ...next,
      currentThrows: [],
      currentPlayerIndex: (state.currentPlayerIndex + 1) % state.players.length,
    };
    turnOver = true;
  }
  return { state: next, turnOver, gameWon };
}
