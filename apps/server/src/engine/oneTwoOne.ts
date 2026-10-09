import type { GameState, OneTwoOneConfig, OneTwoOneModeState, Throw } from '@darts/shared';
import { rawScore, type ApplyThrowResult } from './types.js';

const START = 121;
const MAX_TARGET = 170;

export function createOneTwoOneState(
  config: OneTwoOneConfig,
  playerIds: string[],
): OneTwoOneModeState {
  const playerId = playerIds[0];
  if (!playerId) throw new Error('121 requires at least one player');
  return {
    mode: '121',
    playerId,
    currentTarget: START,
    remaining: START,
    dartsUsed: 0,
    dartLimit: config.dartLimit,
    checkouts: 0,
    totalDartsThrown: 0,
  };
}

export function applyOneTwoOneThrow(
  state: GameState,
  playerId: string,
  rawThrow: Pick<Throw, 'segment' | 'multiplier'>,
): ApplyThrowResult {
  if (state.config.mode !== '121' || state.modeState.mode !== '121') {
    throw new Error('applyOneTwoOneThrow: wrong mode');
  }
  const config = state.config;
  const ms = state.modeState;
  const before = ms.remaining;
  const score = rawScore(rawThrow);
  const isDouble = rawThrow.multiplier === 2;

  let bust = false;
  let finishedAttempt = false;
  let newRemaining = before;
  const tentative = before - score;

  if (tentative < 0) {
    bust = true;
  } else if (tentative === 0) {
    if (isDouble) {
      newRemaining = 0;
      finishedAttempt = true;
    } else {
      bust = true;
    }
  } else if (tentative === 1) {
    bust = true;
  } else {
    newRemaining = tentative;
  }

  const completedThrow: Throw = {
    segment: rawThrow.segment,
    multiplier: rawThrow.multiplier,
    score,
    isValid: !bust,
  };
  const currentThrows = [...state.currentThrows, completedThrow];
  const newDartsUsed = ms.dartsUsed + 1;

  let modeState: OneTwoOneModeState;
  let attemptOver = false;

  if (finishedAttempt) {
    // Successful checkout: bank +1, raise the bar by 1 (cap 170), reset for next attempt.
    const nextTarget = Math.min(MAX_TARGET, ms.currentTarget + 1);
    modeState = {
      ...ms,
      currentTarget: nextTarget,
      remaining: nextTarget,
      dartsUsed: 0,
      checkouts: ms.checkouts + 1,
      totalDartsThrown: ms.totalDartsThrown + 1,
    };
    attemptOver = true;
  } else if (newDartsUsed >= ms.dartLimit) {
    // Attempt failed — the drill never ends. Apply the onFail policy
    // ('fallback' drops the target by 1, floored at 121; 'stay' keeps it)
    // and reset for the next attempt.
    const nextTarget =
      config.onFail === 'fallback' ? Math.max(START, ms.currentTarget - 1) : ms.currentTarget;
    modeState = {
      ...ms,
      currentTarget: nextTarget,
      remaining: nextTarget,
      dartsUsed: 0,
      totalDartsThrown: ms.totalDartsThrown + 1,
    };
    attemptOver = true;
  } else {
    modeState = {
      ...ms,
      remaining: bust ? before : newRemaining,
      dartsUsed: newDartsUsed,
      totalDartsThrown: ms.totalDartsThrown + 1,
    };
  }

  let next: GameState = {
    ...state,
    modeState,
    currentThrows,
  };

  let turnOver = false;
  if (attemptOver || currentThrows.length >= 3) {
    // End the turn after 3 darts or at an attempt boundary (successful
    // checkout or exhausted dart limit) so the UI can show the transition.
    next = { ...next, currentThrows: [] };
    turnOver = true;
  }

  return { state: next, turnOver, gameWon: false };
}
