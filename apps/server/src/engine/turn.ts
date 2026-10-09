/**
 * Whole-turn application for x01 and 121. The "Total" input method submits
 * the sum of the darts thrown this turn plus, on a checkout, how many darts
 * the finish took (`checkoutDarts`). We don't get individual segment data,
 * so we update the score in one shot rather than feeding synthetic darts
 * through the per-dart engine (which could trigger spurious mid-turn busts).
 */
import { checkoutDartOptions } from '@darts/shared';
import type {
  CheckoutMode,
  GameState,
  OneTwoOneModeState,
  X01ModeState,
} from '@darts/shared';
import type { ApplyThrowResult } from './types.js';

export interface TurnInput {
  total: number;
  /**
   * Number of darts used to check out. Present ONLY when total exactly
   * equals the remaining score (a declared checkout); scoring turns and
   * busts omit it. Defaults to 3 when omitted on a checkout.
   */
  checkoutDarts?: 1 | 2 | 3;
}

/**
 * Validates a declared checkout (total exactly equals the remaining score)
 * and returns the number of darts it used. Throws when `remaining` is a
 * bogey (no one-turn finish) or when the declared dart count can't
 * legitimately finish `remaining` under the out-mode.
 */
function validateCheckout(
  remaining: number,
  outMode: CheckoutMode,
  input: TurnInput,
): 1 | 2 | 3 {
  const options = checkoutDartOptions(remaining, outMode);
  if (options.length === 0) {
    throw new Error(`${remaining} cannot be checked out in one turn`);
  }
  const darts = input.checkoutDarts ?? 3;
  if (!options.includes(darts)) {
    throw new Error(`cannot check out ${remaining} in ${darts} dart(s)`);
  }
  return darts;
}

export function applyTurnTotal(
  state: GameState,
  playerId: string,
  input: TurnInput,
): ApplyThrowResult {
  if (state.status !== 'active') {
    throw new Error(`applyTurnTotal: game not active (status=${state.status})`);
  }
  const current = state.players[state.currentPlayerIndex];
  if (!current || current.id !== playerId) {
    throw new Error(`applyTurnTotal: not ${playerId}'s turn`);
  }
  if (state.modeState.mode === 'x01') {
    return applyX01Turn(state, playerId, input);
  }
  if (state.modeState.mode === '121') {
    return applyOneTwoOneTurn(state, playerId, input);
  }
  throw new Error(`applyTurnTotal: mode '${state.modeState.mode}' does not support turn-total input`);
}

function applyX01Turn(
  state: GameState,
  playerId: string,
  input: TurnInput,
): ApplyThrowResult {
  if (state.config.mode !== 'x01' || state.modeState.mode !== 'x01') {
    throw new Error('applyX01Turn: not x01');
  }
  const config = state.config;
  const ms = state.modeState;
  const before = ms.scores[playerId]!;
  const startScore = config.startScore;
  const hasOpened = before < startScore;
  const total = input.total;

  let bust = false;
  let legWon = false;
  let newScore = before;
  // Non-finishing and busted turns always consume 3 darts; a declared
  // checkout consumes exactly the validated dart count.
  let turnDarts = 3;
  const tentative = before - total;

  // Validate "in" rule: with a total we can't tell which dart opened, so an
  // un-opened player in double-in/master-in must enter darts individually.
  // This gate re-arms at the start of EVERY leg: scores reset to startScore,
  // so hasOpened goes false again and the first turn of each leg must be
  // entered per-dart. That is intended — the client mirrors it by disabling
  // the Total tab with the reason "Open per-dart first".
  if (!hasOpened && config.inMode !== 'straight') {
    throw new Error(
      `turn-total input is not allowed before opening in ${config.inMode}-in — enter darts individually`,
    );
  }

  // checkoutDarts describes a finish, so it is only meaningful when the total
  // lands exactly on 0. Anything else (a scoring turn or a bust) means the
  // client built the input wrong — fail loudly rather than dropping the field.
  if (input.checkoutDarts !== undefined && tentative !== 0) {
    throw new Error('checkoutDarts is only valid when the total finishes the leg');
  }

  if (tentative < 0) {
    bust = true;
  } else if (tentative === 0) {
    // Reaching exactly 0 via turn-total is always a declared checkout.
    turnDarts = validateCheckout(before, config.outMode, input);
    newScore = 0;
    legWon = true;
  } else if (tentative === 1 && config.outMode !== 'straight') {
    // Neither double-out nor master-out can finish from 1 (minimum double is 2).
    bust = true;
  } else {
    newScore = tentative;
  }

  // Stat updates: score adds to scoredInLeg / first9 only when the turn
  // didn't bust.
  const turnScore = bust ? 0 : total;
  const playerIds = state.players.map((p) => p.id);

  const dartsAfter = (ms.dartsThrown[playerId] ?? 0) + turnDarts;
  const scoredAfter = (ms.scoredInLeg[playerId] ?? 0) + turnScore;

  // first-9: bust darts still count (at 0 score) — see commitTurnStats in
  // x01.ts for the per-dart-path equivalent.
  let f9Darts = ms.first9Darts[playerId] ?? 0;
  let f9Score = ms.first9Score[playerId] ?? 0;
  if (f9Darts < 9) {
    const slots = Math.min(turnDarts, 9 - f9Darts);
    if (!bust) {
      // Apportion total evenly across the turn's darts for first-9 purposes.
      f9Score += Math.round((turnScore * slots) / turnDarts);
    }
    f9Darts += slots;
  }

  let modeState: X01ModeState = {
    ...ms,
    scores: { ...ms.scores, [playerId]: bust ? before : newScore },
    dartsThrown: { ...ms.dartsThrown, [playerId]: dartsAfter },
    scoredInLeg: { ...ms.scoredInLeg, [playerId]: scoredAfter },
    first9Darts: { ...ms.first9Darts, [playerId]: f9Darts },
    first9Score: { ...ms.first9Score, [playerId]: f9Score },
  };

  let gameWon = false;
  let nextPlayerIndex = (state.currentPlayerIndex + 1) % state.players.length;
  let status = state.status;
  let winner = state.winner;

  if (legWon) {
    const newLegs = { ...modeState.legs, [playerId]: modeState.legs[playerId]! + 1 };
    let newSets = modeState.sets;
    if (newLegs[playerId]! >= config.legsPerSet) {
      newSets = { ...newSets, [playerId]: newSets[playerId]! + 1 };
      for (const pid of Object.keys(newLegs)) newLegs[pid] = 0;
      if (newSets[playerId]! >= config.sets) gameWon = true;
    }
    const resetScores: Record<string, number> = {};
    for (const p of state.players) resetScores[p.id] = startScore;
    const nextLegStarter = (modeState.legStarterIndex + 1) % state.players.length;
    // Reset per-leg stats unless the whole game ended.
    const resetStats = !gameWon
      ? {
          dartsThrown: Object.fromEntries(playerIds.map((id) => [id, 0])) as Record<string, number>,
          scoredInLeg: Object.fromEntries(playerIds.map((id) => [id, 0])) as Record<string, number>,
          first9Darts: Object.fromEntries(playerIds.map((id) => [id, 0])) as Record<string, number>,
          first9Score: Object.fromEntries(playerIds.map((id) => [id, 0])) as Record<string, number>,
        }
      : {
          dartsThrown: modeState.dartsThrown,
          scoredInLeg: modeState.scoredInLeg,
          first9Darts: modeState.first9Darts,
          first9Score: modeState.first9Score,
        };
    modeState = {
      mode: 'x01',
      scores: gameWon ? modeState.scores : resetScores,
      sets: newSets,
      legs: newLegs,
      legStarterIndex: gameWon ? modeState.legStarterIndex : nextLegStarter,
      ...resetStats,
    };
    nextPlayerIndex = gameWon ? state.currentPlayerIndex : nextLegStarter;
    if (gameWon) {
      status = 'finished';
      winner = playerId;
    }
  }

  // IMPORTANT: clear currentThrows. The turn-total path doesn't produce real
  // per-dart entries — leaving a synthetic display throw here would let it
  // leak into the NEXT player's turn (the bot's per-dart path appends to
  // currentThrows and commits stats when length >= 3, which would credit the
  // bot with the previous human's score and clip the bot's third dart).
  return {
    state: {
      ...state,
      modeState,
      currentThrows: [],
      currentPlayerIndex: nextPlayerIndex,
      status,
      winner,
    },
    turnOver: true,
    gameWon,
  };
}

function applyOneTwoOneTurn(
  state: GameState,
  playerId: string,
  input: TurnInput,
): ApplyThrowResult {
  if (state.config.mode !== '121' || state.modeState.mode !== '121') {
    throw new Error('applyOneTwoOneTurn: wrong mode');
  }
  const config = state.config;
  const ms = state.modeState;
  const before = ms.remaining;
  const total = input.total;

  // Turn-total in 121: a single submission consumes 3 darts of the attempt,
  // except on a checkout where it consumes the validated dart count.
  let dartsConsumed = 3;
  const tentative = before - total;

  let bust = false;
  let finishedAttempt = false;
  let newRemaining = before;

  // See applyX01Turn: a dart count for the finish is meaningless unless the
  // total actually finishes.
  if (input.checkoutDarts !== undefined && tentative !== 0) {
    throw new Error('checkoutDarts is only valid when the total finishes the attempt');
  }

  if (tentative < 0) {
    bust = true;
  } else if (tentative === 0) {
    // 121 is always double-out. The checkout must also fit into the darts
    // still available in the current attempt.
    const darts = validateCheckout(before, 'double', input);
    // Defense-in-depth against a client that does not filter its checkout-dart
    // options by attemptDartsLeft; ours does, so this is unreachable from the UI.
    if (ms.dartsUsed + darts > ms.dartLimit) {
      throw new Error(`only ${ms.dartLimit - ms.dartsUsed} dart(s) left in this attempt`);
    }
    dartsConsumed = darts;
    newRemaining = 0;
    finishedAttempt = true;
  } else if (tentative === 1) {
    bust = true;
  } else {
    newRemaining = tentative;
  }

  const newDartsUsed = ms.dartsUsed + dartsConsumed;
  let modeState: OneTwoOneModeState;

  if (finishedAttempt) {
    const nextTarget = Math.min(170, ms.currentTarget + 1);
    modeState = {
      ...ms,
      currentTarget: nextTarget,
      remaining: nextTarget,
      dartsUsed: 0,
      checkouts: ms.checkouts + 1,
      totalDartsThrown: ms.totalDartsThrown + dartsConsumed,
    };
  } else if (newDartsUsed >= ms.dartLimit) {
    // Attempt failed — the drill never ends. Apply the onFail policy
    // ('fallback' drops the target by 1, floored at 121; 'stay' keeps it)
    // and reset for the next attempt.
    const nextTarget =
      config.onFail === 'fallback' ? Math.max(121, ms.currentTarget - 1) : ms.currentTarget;
    modeState = {
      ...ms,
      currentTarget: nextTarget,
      remaining: nextTarget,
      dartsUsed: 0,
      totalDartsThrown: ms.totalDartsThrown + dartsConsumed,
    };
  } else {
    modeState = {
      ...ms,
      remaining: bust ? before : newRemaining,
      dartsUsed: newDartsUsed,
      totalDartsThrown: ms.totalDartsThrown + dartsConsumed,
    };
  }

  return {
    state: {
      ...state,
      modeState,
      currentThrows: [],
    },
    turnOver: true,
    gameWon: false,
  };
}
