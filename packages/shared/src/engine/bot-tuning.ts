/**
 * Bot accuracy tuning tables.
 *
 * AVG_SIGMA_TABLE: (σ_mm, 3-dart avg aiming T20) data points from offline
 * calibration. We invert it at runtime to map a requested target 3-dart
 * average to the σ that produces it.
 *
 * D20_HIT_TABLE: (σ_mm, %) — empirical D20 hit rate at each σ. Used to find
 * the σ that produces the requested checkout %; the bot then *applies that
 * inflated σ only when aiming at a double*, so a bot with avg 110 (σ≈7) but
 * checkout 30% will scatter wider on its finishing dart, missing the bull
 * the same way human pros do under pressure.
 *
 * Source: apps/server/scripts/calibrate-sigma.mjs and calibrate-double.mjs,
 * 20–30k samples each.
 */

interface CurvePoint {
  sigma: number;
  value: number;
}

// (sigma_mm, 3-dart avg) — strictly monotonically decreasing
export const AVG_SIGMA_TABLE: CurvePoint[] = [
  { sigma: 3, value: 158.21 },
  { sigma: 4, value: 142.24 },
  { sigma: 5, value: 128.57 },
  { sigma: 6, value: 118.49 },
  { sigma: 7, value: 110.08 },
  { sigma: 8, value: 102.38 },
  { sigma: 9, value: 94.13 },
  { sigma: 10, value: 87.96 },
  { sigma: 11, value: 82.46 },
  { sigma: 12, value: 77.35 },
  { sigma: 13, value: 72.52 },
  { sigma: 14, value: 68.40 },
  { sigma: 15, value: 65.07 },
  { sigma: 16, value: 60.67 },
  { sigma: 17, value: 58.36 },
  { sigma: 18, value: 56.17 },
  { sigma: 19, value: 53.91 },
  { sigma: 20, value: 52.84 },
  { sigma: 22, value: 48.57 },
  { sigma: 25, value: 44.08 },
  { sigma: 30, value: 41.02 },
  { sigma: 35, value: 38.40 },
  { sigma: 40, value: 37.10 },
  { sigma: 50, value: 33.56 },
  { sigma: 60, value: 30.93 },
];

// (sigma_mm, D20 hit %) — strictly monotonically decreasing
export const D20_HIT_TABLE: CurvePoint[] = [
  { sigma: 2, value: 95.38 },
  { sigma: 3, value: 81.74 },
  { sigma: 4, value: 68.54 },
  { sigma: 5, value: 57.73 },
  { sigma: 6, value: 48.95 },
  { sigma: 7, value: 43.13 },
  { sigma: 8, value: 38.67 },
  { sigma: 9, value: 34.55 },
  { sigma: 10, value: 31.11 },
  { sigma: 12, value: 25.36 },
  { sigma: 14, value: 21.06 },
  { sigma: 16, value: 17.65 },
  { sigma: 18, value: 14.89 },
  { sigma: 20, value: 12.90 },
  { sigma: 23, value: 10.35 },
  { sigma: 26, value: 8.33 },
  { sigma: 30, value: 6.65 },
  { sigma: 35, value: 5.06 },
  { sigma: 40, value: 3.80 },
  { sigma: 50, value: 2.49 },
  { sigma: 60, value: 1.65 },
];

/**
 * Linearly interpolate to find the σ that produces the requested table value.
 * The table is assumed to be strictly decreasing in `value` (higher σ → lower
 * value). Clamps to the table's σ bounds when `value` is outside the range.
 */
function inverseLookup(table: CurvePoint[], targetValue: number): number {
  // Above the highest value → tightest σ
  if (targetValue >= table[0]!.value) return table[0]!.sigma;
  // Below the lowest value → widest σ
  const last = table[table.length - 1]!;
  if (targetValue <= last.value) return last.sigma;
  for (let i = 0; i < table.length - 1; i++) {
    const a = table[i]!;
    const b = table[i + 1]!;
    if (targetValue <= a.value && targetValue >= b.value) {
      const span = a.value - b.value;
      if (span === 0) return a.sigma;
      const t = (a.value - targetValue) / span;
      return a.sigma + t * (b.sigma - a.sigma);
    }
  }
  return last.sigma;
}

/** Returns the σ (mm) that produces the requested 3-dart average aiming at T20. */
export function sigmaForAverage(targetAverage: number): number {
  return inverseLookup(AVG_SIGMA_TABLE, targetAverage);
}

/** Returns the σ (mm) that produces the requested D20 hit rate (percent). */
export function sigmaForCheckoutPercent(targetPercent: number): number {
  return inverseLookup(D20_HIT_TABLE, targetPercent);
}
