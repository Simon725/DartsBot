import type { X01LegRecord, X01ModeState } from './types.js';

export interface X01Totals {
  darts: number;
  scored: number;
  first9Darts: number;
  first9Score: number;
}

export function x01LegTotals(leg: X01LegRecord, playerId: string): X01Totals {
  return {
    darts: leg.dartsThrown[playerId] ?? 0,
    scored: leg.scored[playerId] ?? 0,
    first9Darts: leg.first9Darts[playerId] ?? 0,
    first9Score: leg.first9Score[playerId] ?? 0,
  };
}

/** Sums every finished leg plus the leg in progress. */
export function x01MatchTotals(ms: X01ModeState, playerId: string): X01Totals {
  const totals: X01Totals = {
    darts: ms.dartsThrown[playerId] ?? 0,
    scored: ms.scoredInLeg[playerId] ?? 0,
    first9Darts: ms.first9Darts[playerId] ?? 0,
    first9Score: ms.first9Score[playerId] ?? 0,
  };
  for (const leg of ms.completedLegs) {
    const legTotals = x01LegTotals(leg, playerId);
    totals.darts += legTotals.darts;
    totals.scored += legTotals.scored;
    totals.first9Darts += legTotals.first9Darts;
    totals.first9Score += legTotals.first9Score;
  }
  return totals;
}

export function threeDartAverage(scored: number, darts: number): number | null {
  return darts === 0 ? null : (scored / darts) * 3;
}
