import type { CheckoutMode, GameState, Throw, X01Config, X01LegRecord, X01ModeState } from '../types.js';
import { rawScore, type ApplyThrowResult } from './types.js';

const matchesMode = (t: Throw, mode: CheckoutMode): boolean => {
  if (mode === 'straight') return true;
  if (mode === 'double') return t.multiplier === 2;
  return t.multiplier === 2 || t.multiplier === 3;
};

function emptyStats(playerIds: string[]): Pick<X01ModeState, 'dartsThrown' | 'scoredInLeg' | 'first9Score' | 'first9Darts'> {
  const dartsThrown: Record<string, number> = {};
  const scoredInLeg: Record<string, number> = {};
  const first9Score: Record<string, number> = {};
  const first9Darts: Record<string, number> = {};
  for (const id of playerIds) {
    dartsThrown[id] = 0;
    scoredInLeg[id] = 0;
    first9Score[id] = 0;
    first9Darts[id] = 0;
  }
  return { dartsThrown, scoredInLeg, first9Score, first9Darts };
}

export function createX01State(config: X01Config, playerIds: string[]): X01ModeState {
  const scores: Record<string, number> = {};
  const sets: Record<string, number> = {};
  const legs: Record<string, number> = {};
  for (const id of playerIds) {
    scores[id] = config.startScore;
    sets[id] = 0;
    legs[id] = 0;
  }
  return {
    mode: 'x01',
    scores,
    sets,
    legs,
    legStarterIndex: 0,
    ...emptyStats(playerIds),
    completedLegs: [],
  };
}

function legRecord(ms: X01ModeState, winnerId: string): X01LegRecord {
  return {
    winnerId,
    dartsThrown: ms.dartsThrown,
    scored: ms.scoredInLeg,
    first9Score: ms.first9Score,
    first9Darts: ms.first9Darts,
  };
}

/**
 * Closes the leg `winnerId` just won: archives its stats in completedLegs,
 * awards legs/sets and, unless the match is over, sets up the next leg.
 * Expects `modeState` to already contain the winning turn's stats.
 */
export function finishX01Leg(
  state: GameState,
  modeState: X01ModeState,
  winnerId: string,
): { state: GameState; gameWon: boolean } {
  if (state.config.mode !== 'x01') throw new Error('finishX01Leg: not an x01 game');
  const config = state.config;
  const playerIds = state.players.map((p) => p.id);

  const newLegs = { ...modeState.legs, [winnerId]: modeState.legs[winnerId]! + 1 };
  let newSets = modeState.sets;
  let gameWon = false;
  if (newLegs[winnerId]! >= config.legsPerSet) {
    newSets = { ...newSets, [winnerId]: newSets[winnerId]! + 1 };
    for (const pid of Object.keys(newLegs)) newLegs[pid] = 0;
    gameWon = newSets[winnerId]! >= config.sets;
  }

  const resetScores: Record<string, number> = {};
  for (const id of playerIds) resetScores[id] = config.startScore;
  const nextLegStarterIndex = (modeState.legStarterIndex + 1) % state.players.length;

  const nextModeState: X01ModeState = {
    mode: 'x01',
    scores: gameWon ? modeState.scores : resetScores,
    sets: newSets,
    legs: newLegs,
    legStarterIndex: gameWon ? modeState.legStarterIndex : nextLegStarterIndex,
    ...emptyStats(playerIds),
    completedLegs: [...modeState.completedLegs, legRecord(modeState, winnerId)],
  };

  return {
    state: {
      ...state,
      currentThrows: [],
      currentPlayerIndex: gameWon ? state.currentPlayerIndex : nextLegStarterIndex,
      status: gameWon ? 'finished' : state.status,
      winner: gameWon ? winnerId : state.winner,
      modeState: nextModeState,
    },
    gameWon,
  };
}

/**
 * Commits a completed turn's stats. Called when 3 darts thrown or leg won
 * (not on bust — bust darts still count for dartsThrown, but the score does
 * NOT add to scoredInLeg or first9).
 *
 * @param turnThrows — the throws of the just-completed turn
 * @param countScore — whether this turn's points should add to scoredInLeg / first9
 */
function commitTurnStats(
  ms: X01ModeState,
  playerId: string,
  turnThrows: Throw[],
  countScore: boolean,
): X01ModeState {
  // Every legal dart attempt is +1 for dartsThrown (including a busting throw,
  // and the throws prior to a bust within the same turn).
  const dartsAfter = (ms.dartsThrown[playerId] ?? 0) + turnThrows.length;

  // Only isValid throws score — in-mode-rejected darts (e.g. a single before
  // opening in double-in) count toward dartsThrown but contribute 0 points,
  // matching the client scoreboard's live calculation.
  let scoredAfter = ms.scoredInLeg[playerId] ?? 0;
  if (countScore) {
    for (const t of turnThrows) {
      if (t.isValid) scoredAfter += t.score;
    }
  }

  // first-9: fill remaining slots in the first 9 darts of the leg with these
  // throws. Bust darts count toward the dart count at 0 score (PDC convention:
  // the dart was thrown, it just didn't score). Without this, a high-scoring
  // turn followed by busts leaves first9Darts stuck below 9 and inflates the
  // first-9 average artificially (e.g. 95 / 3 * 3 = 95 instead of the true
  // 95 / 9 * 3 = 31.67).
  let f9Darts = ms.first9Darts[playerId] ?? 0;
  let f9Score = ms.first9Score[playerId] ?? 0;
  for (const t of turnThrows) {
    if (f9Darts >= 9) break;
    f9Darts += 1;
    if (countScore && t.isValid) f9Score += t.score;
  }

  return {
    ...ms,
    dartsThrown: { ...ms.dartsThrown, [playerId]: dartsAfter },
    scoredInLeg: { ...ms.scoredInLeg, [playerId]: scoredAfter },
    first9Darts: { ...ms.first9Darts, [playerId]: f9Darts },
    first9Score: { ...ms.first9Score, [playerId]: f9Score },
  };
}

export function applyX01Throw(
  state: GameState,
  playerId: string,
  rawThrow: Pick<Throw, 'segment' | 'multiplier'>,
): ApplyThrowResult {
  if (state.config.mode !== 'x01' || state.modeState.mode !== 'x01') {
    throw new Error('applyX01Throw: not an x01 game');
  }
  const config = state.config;
  const ms = state.modeState;
  const startScore = config.startScore;
  const scoreBefore = ms.scores[playerId]!;
  const hasOpened = scoreBefore < startScore;
  const score = rawScore(rawThrow);

  let isValid = true;
  let newScore = scoreBefore;
  let bust = false;
  let legWon = false;

  const completedThrow: Throw = {
    segment: rawThrow.segment,
    multiplier: rawThrow.multiplier,
    score,
    isValid: true,
  };

  if (!hasOpened && !matchesMode(completedThrow, config.inMode)) {
    isValid = false;
  } else {
    const tentative = scoreBefore - score;
    if (tentative < 0) {
      bust = true;
    } else if (tentative === 0) {
      if (config.outMode === 'straight' || matchesMode(completedThrow, config.outMode)) {
        newScore = 0;
        legWon = true;
      } else {
        bust = true;
      }
    } else if (tentative === 1 && config.outMode !== 'straight') {
      // Neither double-out nor master-out can finish from 1 (minimum double is 2).
      bust = true;
    } else {
      newScore = tentative;
    }
  }

  completedThrow.isValid = isValid && !bust;
  const currentThrows = [...state.currentThrows, completedThrow];
  // A bust voids the ENTIRE turn, not just the busting dart: restore the score
  // from before this turn's earlier darts (which had already been deducted).
  const turnStartScore = state.currentThrows.reduce(
    (acc, t) => acc + (t.isValid ? t.score : 0),
    scoreBefore,
  );
  let modeState: X01ModeState = {
    ...ms,
    scores: { ...ms.scores, [playerId]: bust ? turnStartScore : newScore },
  };

  let nextState: GameState = { ...state, currentThrows, modeState };
  let gameWon = false;
  let turnOver = false;

  if (legWon) {
    modeState = commitTurnStats(modeState, playerId, currentThrows, true);
    const finished = finishX01Leg(state, modeState, playerId);
    nextState = finished.state;
    gameWon = finished.gameWon;
    turnOver = true;
  } else if (bust || currentThrows.length >= 3) {
    // Turn ends; commit dart count, commit score only if no bust.
    modeState = commitTurnStats(modeState, playerId, currentThrows, !bust);
    nextState = {
      ...nextState,
      currentThrows: [],
      currentPlayerIndex: (state.currentPlayerIndex + 1) % state.players.length,
      modeState,
    };
    turnOver = true;
  }

  return { state: nextState, turnOver, gameWon };
}

