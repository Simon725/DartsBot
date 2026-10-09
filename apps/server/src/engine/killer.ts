import type { GameState, KillerConfig, KillerModeState, Throw } from '@darts/shared';
import { rawScore, type ApplyThrowResult } from './types.js';

// Auto-assigns numbers 20, 19, 18, 17, ... starting from 20 going down,
// skipping any duplicates. Up to 8 players → numbers 20..13.
const ASSIGN_POOL = [20, 19, 18, 17, 16, 15, 14, 13];

export function createKillerState(config: KillerConfig, playerIds: string[]): KillerModeState {
  const assignedNumber: Record<string, number> = {};
  const lives: Record<string, number> = {};
  const isKiller: Record<string, boolean> = {};
  playerIds.forEach((id, i) => {
    assignedNumber[id] = ASSIGN_POOL[i] ?? 0;
    lives[id] = config.startingLives;
    isKiller[id] = false;
  });
  return {
    mode: 'killer',
    assignedNumber,
    lives,
    isKiller,
    startingLives: config.startingLives,
  };
}

export function applyKillerThrow(
  state: GameState,
  playerId: string,
  rawThrow: Pick<Throw, 'segment' | 'multiplier'>,
): ApplyThrowResult {
  if (state.modeState.mode !== 'killer') throw new Error('applyKillerThrow: wrong mode');
  const ms = state.modeState;
  const myNumber = ms.assignedNumber[playerId]!;
  const hitSegment = rawThrow.segment;
  const isDouble = rawThrow.multiplier === 2;

  let newIsKiller = { ...ms.isKiller };
  let newLives = { ...ms.lives };
  let action: 'become-killer' | 'kill' | 'self-kill' | 'miss' = 'miss';

  if (!ms.isKiller[playerId]) {
    if (hitSegment === myNumber && isDouble) {
      newIsKiller[playerId] = true;
      action = 'become-killer';
    }
  } else {
    // I'm a killer. Doubles on opponents' numbers remove their lives.
    if (isDouble) {
      const target = state.players.find(
        (p) => ms.assignedNumber[p.id] === hitSegment && newLives[p.id]! > 0,
      );
      if (target) {
        if (target.id === playerId) {
          // hit own double again — lose a life (self-kill rule, classic).
          newLives[playerId] = Math.max(0, newLives[playerId]! - 1);
          action = 'self-kill';
        } else {
          newLives[target.id] = Math.max(0, newLives[target.id]! - 1);
          action = 'kill';
        }
      }
    }
  }

  const completedThrow: Throw = {
    segment: hitSegment,
    multiplier: rawThrow.multiplier,
    score: rawScore(rawThrow),
    isValid: action !== 'miss',
  };
  const currentThrows = [...state.currentThrows, completedThrow];
  let modeState: KillerModeState = {
    ...ms,
    isKiller: newIsKiller,
    lives: newLives,
  };
  let next: GameState = { ...state, currentThrows, modeState };

  const alive = state.players.filter((p) => newLives[p.id]! > 0);
  const gameWon = alive.length === 1 && state.players.length > 1;
  let turnOver = false;

  if (gameWon) {
    next = {
      ...next,
      status: 'finished',
      winner: alive[0]!.id,
      currentThrows: [],
    };
    turnOver = true;
  } else if (currentThrows.length >= 3 || newLives[playerId] === 0) {
    // Advance to next player who still has lives. A player who self-kills
    // down to 0 lives loses the rest of their turn immediately.
    let idx = state.currentPlayerIndex;
    for (let i = 0; i < state.players.length; i++) {
      idx = (idx + 1) % state.players.length;
      if (newLives[state.players[idx]!.id]! > 0) break;
    }
    next = { ...next, currentThrows: [], currentPlayerIndex: idx };
    turnOver = true;
  }
  return { state: next, turnOver, gameWon };
}
