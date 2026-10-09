import type {
  CricketModeState,
  CricketNumber,
  GameState,
  Throw,
} from '@darts/shared';
import { rawScore, type ApplyThrowResult } from './types.js';

export const CRICKET_NUMBERS: CricketNumber[] = [15, 16, 17, 18, 19, 20, 25];

function emptyMarks(): Record<CricketNumber, number> {
  return { 15: 0, 16: 0, 17: 0, 18: 0, 19: 0, 20: 0, 25: 0 };
}

export function createCricketState(playerIds: string[]): CricketModeState {
  const marks: Record<string, Record<CricketNumber, number>> = {};
  const points: Record<string, number> = {};
  for (const id of playerIds) {
    marks[id] = emptyMarks();
    points[id] = 0;
  }
  return { mode: 'cricket', marks, points };
}

function isCricketNumber(segment: number): segment is CricketNumber {
  return CRICKET_NUMBERS.includes(segment as CricketNumber);
}

function allClosedByEveryone(
  marks: Record<string, Record<CricketNumber, number>>,
  num: CricketNumber,
): boolean {
  return Object.values(marks).every((m) => m[num] >= 3);
}

function leaderId(marks: Record<string, Record<CricketNumber, number>>, points: Record<string, number>): {
  id: string;
  allClosed: boolean;
  isLeaderOnPoints: boolean;
} {
  const ids = Object.keys(points);
  let topId = ids[0]!;
  for (const id of ids) {
    if (points[id]! > points[topId]!) topId = id;
  }
  const allClosed = CRICKET_NUMBERS.every((n) => marks[topId]![n] >= 3);
  const topPoints = points[topId]!;
  const isLeaderOnPoints = ids.every((id) => id === topId || points[id]! <= topPoints);
  return { id: topId, allClosed, isLeaderOnPoints };
}

export function applyCricketThrow(
  state: GameState,
  playerId: string,
  rawThrow: Pick<Throw, 'segment' | 'multiplier'>,
): ApplyThrowResult {
  if (state.modeState.mode !== 'cricket') throw new Error('applyCricketThrow: wrong mode');
  const ms = state.modeState;
  const segment = rawThrow.segment;
  // Bullseye is segment=25; for cricket, multiplier=2 on bull = "double bull" = 2 marks.
  // Multiplier for a tripled cricket number = 3 marks.
  const hits = isCricketNumber(segment) ? rawThrow.multiplier : 0;

  let myMarks = { ...ms.marks[playerId]! };
  let myPoints = ms.points[playerId]!;
  const otherIds = state.players.filter((p) => p.id !== playerId).map((p) => p.id);
  let pointsAwarded = 0;

  if (hits > 0 && isCricketNumber(segment)) {
    const before = myMarks[segment];
    const totalAfter = before + hits;
    const usedToClose = Math.min(hits, Math.max(0, 3 - before));
    const surplus = totalAfter > 3 ? totalAfter - Math.max(3, before) : 0;
    myMarks[segment] = Math.min(3, totalAfter);

    if (surplus > 0) {
      const opponentClosed = otherIds.every((oid) => ms.marks[oid]![segment] >= 3);
      if (!opponentClosed) {
        pointsAwarded = surplus * segment;
        myPoints += pointsAwarded;
      }
    }
    // usedToClose is only useful if you want to surface it; we already mark above.
    void usedToClose;
  }

  const completedThrow: Throw = {
    segment,
    multiplier: rawThrow.multiplier,
    score: rawScore(rawThrow),
    isValid: hits > 0,
  };
  const currentThrows = [...state.currentThrows, completedThrow];

  const newMarks = { ...ms.marks, [playerId]: myMarks };
  const newPoints = { ...ms.points, [playerId]: myPoints };
  let modeState: CricketModeState = { ...ms, marks: newMarks, points: newPoints };
  let next: GameState = { ...state, currentThrows, modeState };

  // Win condition: all my numbers closed AND I have ≥ everyone else's points.
  const allMine = CRICKET_NUMBERS.every((n) => myMarks[n] >= 3);
  const leaderInPoints = otherIds.every((oid) => myPoints >= ms.points[oid]!);
  const gameWon = allMine && leaderInPoints;
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

  void leaderId; // reserved for future tiebreak/leaderboard helpers
  void allClosedByEveryone;
  return { state: next, turnOver, gameWon };
}
