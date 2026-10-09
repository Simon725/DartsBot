import type { GameState, ShanghaiConfig, ShanghaiModeState, Throw } from '@darts/shared';
import { rawScore, type ApplyThrowResult } from './types.js';

export function createShanghaiState(
  config: ShanghaiConfig,
  playerIds: string[],
): ShanghaiModeState {
  const scores: Record<string, number> = {};
  for (const id of playerIds) scores[id] = 0;
  return {
    mode: 'shanghai',
    round: 1,
    rounds: config.rounds,
    scores,
    shanghaiWinnerId: null,
  };
}

function turnHasShanghai(throws: Throw[], target: number): boolean {
  if (throws.length < 3) return false;
  const hits = throws.filter((t) => t.segment === target);
  if (hits.length < 3) return false;
  const mults = new Set(hits.map((t) => t.multiplier));
  return mults.has(1) && mults.has(2) && mults.has(3);
}

export function applyShanghaiThrow(
  state: GameState,
  playerId: string,
  rawThrow: Pick<Throw, 'segment' | 'multiplier'>,
): ApplyThrowResult {
  if (state.modeState.mode !== 'shanghai') throw new Error('applyShanghaiThrow: wrong mode');
  const ms = state.modeState;
  const target = ms.round;
  const hit = rawThrow.segment === target;
  const added = hit ? rawScore(rawThrow) : 0;
  const completedThrow: Throw = {
    segment: rawThrow.segment,
    multiplier: rawThrow.multiplier,
    score: rawScore(rawThrow),
    isValid: hit,
  };
  const currentThrows = [...state.currentThrows, completedThrow];
  const newScores = {
    ...ms.scores,
    [playerId]: ms.scores[playerId]! + added,
  };

  const shanghaied = turnHasShanghai(currentThrows, target);
  let modeState: ShanghaiModeState = { ...ms, scores: newScores };
  let next: GameState = { ...state, currentThrows, modeState };
  let gameWon = false;
  let turnOver = false;

  if (shanghaied) {
    modeState = { ...modeState, shanghaiWinnerId: playerId };
    next = {
      ...next,
      modeState,
      status: 'finished',
      winner: playerId,
      currentThrows: [],
    };
    gameWon = true;
    turnOver = true;
  } else if (currentThrows.length >= 3) {
    const isLastPlayer = state.currentPlayerIndex === state.players.length - 1;
    const nextRound = isLastPlayer ? ms.round + 1 : ms.round;
    const lastRound = nextRound > ms.rounds;
    if (lastRound) {
      const top = Object.entries(newScores).reduce((a, b) => (b[1] > a[1] ? b : a));
      modeState = { ...modeState, round: ms.round };
      next = {
        ...next,
        modeState,
        status: 'finished',
        winner: top[0],
        currentThrows: [],
      };
      gameWon = true;
    } else {
      modeState = { ...modeState, round: nextRound };
      next = {
        ...next,
        modeState,
        currentThrows: [],
        currentPlayerIndex: (state.currentPlayerIndex + 1) % state.players.length,
      };
    }
    turnOver = true;
  }
  return { state: next, turnOver, gameWon };
}
