import { describe, expect, it } from 'vitest';
import { checkoutDartOptions } from './checkout-darts.js';

describe('checkout-darts', () => {
  describe('double-out', () => {
    it('single-dart finishes offer all counts', () => {
      expect(checkoutDartOptions(40, 'double')).toEqual([1, 2, 3]); // D20
      expect(checkoutDartOptions(50, 'double')).toEqual([1, 2, 3]); // BULL
      expect(checkoutDartOptions(2, 'double')).toEqual([1, 2, 3]); // D1
    });

    it('two-dart-minimum finishes offer [2, 3]', () => {
      expect(checkoutDartOptions(45, 'double')).toEqual([2, 3]); // 13 D16
      expect(checkoutDartOptions(3, 'double')).toEqual([2, 3]); // 1 D1
      expect(checkoutDartOptions(61, 'double')).toEqual([2, 3]); // T15 D8
      expect(checkoutDartOptions(110, 'double')).toEqual([2, 3]); // T20 BULL
    });

    it('three-dart-only finishes offer [3]', () => {
      expect(checkoutDartOptions(109, 'double')).toEqual([3]);
      expect(checkoutDartOptions(108, 'double')).toEqual([3]);
      expect(checkoutDartOptions(121, 'double')).toEqual([3]);
      expect(checkoutDartOptions(170, 'double')).toEqual([3]);
    });

    it('returns [] for every bogey number', () => {
      for (const n of [159, 162, 163, 165, 166, 168, 169]) {
        expect(checkoutDartOptions(n, 'double'), `expected ${n} to be a bogey`).toEqual([]);
      }
    });

    it('returns [] for 1 (no double finishes it)', () => {
      expect(checkoutDartOptions(1, 'double')).toEqual([]);
    });
  });

  describe('master-out', () => {
    it('trebles count as finishing darts', () => {
      expect(checkoutDartOptions(3, 'master')).toEqual([1, 2, 3]); // T1
      expect(checkoutDartOptions(57, 'master')).toEqual([1, 2, 3]); // T19
    });

    it('120 needs at least two darts', () => {
      expect(checkoutDartOptions(120, 'master')).toEqual([2, 3]); // 20 T20 / T20 20 D20 variants
    });
  });

  describe('straight-out', () => {
    it('any valid dart score finishes in one', () => {
      expect(checkoutDartOptions(1, 'straight')).toEqual([1, 2, 3]);
      expect(checkoutDartOptions(20, 'straight')).toEqual([1, 2, 3]);
    });

    it('23 is not a single-dart score, so [2, 3]', () => {
      expect(checkoutDartOptions(23, 'straight')).toEqual([2, 3]); // 3 + 20
    });
  });

  it('always returns a contiguous suffix of [1, 2, 3]', () => {
    const suffixes = [[], [3], [2, 3], [1, 2, 3]].map((s) => JSON.stringify(s));
    for (const outMode of ['straight', 'double', 'master'] as const) {
      for (let remaining = 2; remaining <= 170; remaining++) {
        const options = checkoutDartOptions(remaining, outMode);
        expect(
          suffixes,
          `${outMode} ${remaining} returned ${JSON.stringify(options)}`,
        ).toContain(JSON.stringify(options));
      }
    }
  });
});
