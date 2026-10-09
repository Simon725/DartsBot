import { describe, expect, it } from 'vitest';
import { getCheckout, isBogeyNumber } from './checkout-table.js';

describe('checkout-table', () => {
  it('returns the famous 170 finish', () => {
    const s = getCheckout(170);
    expect(s?.route).toEqual(['T20', 'T20', 'BULL']);
    expect(s?.isBogey).toBe(false);
  });

  it('returns the BULL finish for 50', () => {
    expect(getCheckout(50)?.route).toEqual(['BULL']);
  });

  it('returns D20 for 40', () => {
    expect(getCheckout(40)?.route).toEqual(['D20']);
  });

  it('returns null for > 170', () => {
    expect(getCheckout(171)).toBe(null);
  });

  it('returns null for 1 (no legal double-out)', () => {
    expect(getCheckout(1)).toBe(null);
  });

  it('flags bogey numbers (no 3-dart finish)', () => {
    for (const n of [159, 162, 163, 165, 166, 168, 169]) {
      const s = getCheckout(n);
      expect(s).not.toBe(null);
      expect(s?.route).toBe(null);
      expect(s?.isBogey).toBe(true);
      expect(isBogeyNumber(n)).toBe(true);
    }
  });

  it('has a route for every non-bogey score 2..170', () => {
    for (let n = 2; n <= 170; n++) {
      const s = getCheckout(n);
      if (!isBogeyNumber(n)) {
        expect(s, `missing checkout for ${n}`).not.toBe(null);
        expect(s?.route, `missing route for ${n}`).not.toBe(null);
      }
    }
  });

  it('every non-bogey route sums to the remaining score', () => {
    const segScore = (s: string): number => {
      if (s === 'BULL') return 50;
      if (s === '25') return 25;
      if (s.startsWith('T')) return parseInt(s.slice(1), 10) * 3;
      if (s.startsWith('D')) return parseInt(s.slice(1), 10) * 2;
      return parseInt(s, 10);
    };
    const mismatches: string[] = [];
    for (let n = 2; n <= 170; n++) {
      if (isBogeyNumber(n)) continue;
      const s = getCheckout(n);
      if (!s?.route) continue;
      const sum = s.route.reduce((a, b) => a + segScore(b), 0);
      if (sum !== n) mismatches.push(`${n} got ${sum} (${s.route.join('+')})`);
    }
    expect(mismatches).toEqual([]);
  });

  it('every non-bogey route ends on a double or bull', () => {
    for (let n = 2; n <= 170; n++) {
      if (isBogeyNumber(n)) continue;
      const s = getCheckout(n);
      const last = s?.route?.[s.route.length - 1];
      if (!last) continue;
      expect(
        last.startsWith('D') || last === 'BULL',
        `route for ${n} does not finish on a double: ${last}`,
      ).toBe(true);
    }
  });
});
