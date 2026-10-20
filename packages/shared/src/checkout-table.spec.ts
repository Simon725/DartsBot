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

  describe('with fewer darts left', () => {
    const segScore = (s: string): number => {
      if (s === 'BULL') return 50;
      if (s === '25') return 25;
      if (s.startsWith('T')) return parseInt(s.slice(1), 10) * 3;
      if (s.startsWith('D')) return parseInt(s.slice(1), 10) * 2;
      return parseInt(s, 10);
    };

    it('returns null for 141 with 2 darts', () => {
      expect(getCheckout(141, 2)).toBe(null);
    });

    it('returns T20 D20 for 100 with 2 darts', () => {
      expect(getCheckout(100, 2)?.route).toEqual(['T20', 'D20']);
    });

    it('returns T20 BULL for 110 with 2 darts', () => {
      expect(getCheckout(110, 2)?.route).toEqual(['T20', 'BULL']);
    });

    it('returns null for 99 and 102 with 2 darts', () => {
      expect(getCheckout(99, 2)).toBe(null);
      expect(getCheckout(102, 2)).toBe(null);
    });

    it('returns D20 for 40 with 1 dart', () => {
      expect(getCheckout(40, 1)?.route).toEqual(['D20']);
    });

    it('returns BULL for 50 with 1 dart', () => {
      expect(getCheckout(50, 1)?.route).toEqual(['BULL']);
    });

    it('returns null for odd or out-of-reach scores with 1 dart', () => {
      expect(getCheckout(41, 1)).toBe(null);
      expect(getCheckout(42, 1)).toBe(null);
      expect(getCheckout(60, 1)).toBe(null);
    });

    it('returns null for bogeys with fewer darts', () => {
      expect(getCheckout(169, 2)).toBe(null);
      expect(getCheckout(169, 1)).toBe(null);
    });

    it('keeps 3-dart behaviour as the default', () => {
      expect(getCheckout(141, 3)).toEqual(getCheckout(141));
      expect(getCheckout(169, 3)?.isBogey).toBe(true);
    });

    it('every route fits the darts left, sums up and ends on a double', () => {
      const problems: string[] = [];
      for (const darts of [1, 2] as const) {
        for (let n = 2; n <= 170; n++) {
          const route = getCheckout(n, darts)?.route;
          if (!route) continue;
          const last = route[route.length - 1];
          const sum = route.reduce((a, b) => a + segScore(b), 0);
          if (route.length > darts) problems.push(`${n}/${darts}: too long ${route.join('+')}`);
          if (sum !== n) problems.push(`${n}/${darts}: sums to ${sum}`);
          if (!last.startsWith('D') && last !== 'BULL') problems.push(`${n}/${darts}: ends on ${last}`);
        }
      }
      expect(problems).toEqual([]);
    });

    it('finds a 2-dart route for every score that has one', () => {
      expect(getCheckout(101, 2)?.route).toEqual(['T17', 'BULL']);
      for (let n = 2; n <= 98; n++) {
        expect(getCheckout(n, 2), `missing 2-dart route for ${n}`).not.toBe(null);
      }
    });
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
