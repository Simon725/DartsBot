import type { GameState, Throw } from '../types.js';

export interface ApplyThrowResult {
  state: GameState;
  turnOver: boolean;
  gameWon: boolean;
}

export function rawScore(t: Pick<Throw, 'segment' | 'multiplier'>): number {
  return t.segment * t.multiplier;
}

export function advancePlayer(state: GameState): GameState {
  return {
    ...state,
    currentPlayerIndex: (state.currentPlayerIndex + 1) % state.players.length,
    currentThrows: [],
  };
}

export function appendThrow(state: GameState, t: Throw): GameState {
  return { ...state, currentThrows: [...state.currentThrows, t] };
}
