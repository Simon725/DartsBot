import type { CheckoutMode } from './types.js';

/**
 * Which dart counts can legitimately finish a remaining score under an
 * out-mode, e.g. 40 double-out -> [1, 2, 3] (D20 on any dart), 110 -> [2, 3]
 * (T20 BULL at best), 170 -> [3] (T20 T20 BULL), 159 -> [] (bogey).
 *
 * Key insight (miss padding): any leading dart may score 0 (a miss), so if a
 * checkout is possible in n darts it is also possible in n+1 — miss first,
 * then finish. The result is therefore always a contiguous suffix of
 * [1, 2, 3]. An empty result means the number cannot be checked out in one
 * turn at all (a bogey, e.g. 159/162/163/165/166/168/169 for double-out, or
 * 1 which no double can finish).
 */

/** Every score a single dart can make: singles 1-20, doubles 2-40, trebles 3-60, 25, 50. */
const VALID_DART_SCORES: ReadonlySet<number> = (() => {
  const scores = new Set<number>([25, 50]);
  for (let s = 1; s <= 20; s++) {
    scores.add(s);
    scores.add(s * 2);
    scores.add(s * 3);
  }
  return scores;
})();

/** Doubles 2-40 plus the bull (50). */
const DOUBLE_SCORES: ReadonlySet<number> = (() => {
  const scores = new Set<number>([50]);
  for (let s = 1; s <= 20; s++) scores.add(s * 2);
  return scores;
})();

/** Legal FINAL-dart scores per out-mode. */
const FINAL_DART_SCORES: Record<CheckoutMode, ReadonlySet<number>> = (() => {
  const master = new Set<number>(DOUBLE_SCORES);
  for (let s = 1; s <= 20; s++) master.add(s * 3);
  return {
    straight: VALID_DART_SCORES,
    double: DOUBLE_SCORES,
    master,
  };
})();

/**
 * LEADING_SUMS[n] = every total the n darts BEFORE the finishing dart can
 * contribute, where each leading dart either scores or misses (0).
 */
const LEADING_SUMS: ReadonlyArray<ReadonlySet<number>> = (() => {
  const zero: ReadonlySet<number> = new Set([0]);
  const one = new Set<number>(zero);
  for (const s of VALID_DART_SCORES) one.add(s);
  const two = new Set<number>();
  for (const a of one) for (const b of one) two.add(a + b);
  return [zero, one, two];
})();

/**
 * Returns the dart counts that can legitimately check out `remaining` under
 * the given out-mode, always a contiguous suffix of [1, 2, 3] (see the
 * miss-padding note above). Empty when `remaining` is unfinishable in one
 * turn (bogey).
 */
export function checkoutDartOptions(remaining: number, outMode: CheckoutMode): Array<1 | 2 | 3> {
  const finals = FINAL_DART_SCORES[outMode];
  const options: Array<1 | 2 | 3> = [];
  for (const darts of [1, 2, 3] as const) {
    for (const lead of LEADING_SUMS[darts - 1]) {
      if (finals.has(remaining - lead)) {
        options.push(darts);
        break;
      }
    }
  }
  return options;
}
