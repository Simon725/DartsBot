import { describe, expect, it } from 'vitest';
import {
  GameThrowTurnPayloadSchema,
  IMPOSSIBLE_TURN_TOTALS,
  OneTwoOneConfigSchema,
} from './zod-schemas.js';

const turnPayload = (total: number) => ({
  gameId: 'g1',
  playerId: 'p1',
  total,
});

describe('zod-schemas', () => {
  describe('GameThrowTurnPayloadSchema', () => {
    it('rejects every impossible 3-dart total', () => {
      for (const total of IMPOSSIBLE_TURN_TOTALS) {
        const result = GameThrowTurnPayloadSchema.safeParse(turnPayload(total));
        expect(result.success, `expected ${total} to be rejected`).toBe(false);
      }
    });

    it('accepts representative possible totals', () => {
      for (const total of [180, 177, 174, 171, 170, 168, 165, 164, 162, 100, 26, 0]) {
        const result = GameThrowTurnPayloadSchema.safeParse(turnPayload(total));
        expect(result.success, `expected ${total} to be accepted`).toBe(true);
      }
    });

    it('accepts checkoutDarts 1, 2, and 3', () => {
      for (const checkoutDarts of [1, 2, 3]) {
        const result = GameThrowTurnPayloadSchema.safeParse({
          ...turnPayload(40),
          checkoutDarts,
        });
        expect(result.success, `expected checkoutDarts ${checkoutDarts} to be accepted`).toBe(true);
      }
    });

    it('accepts an omitted checkoutDarts', () => {
      expect(GameThrowTurnPayloadSchema.safeParse(turnPayload(60)).success).toBe(true);
    });

    it('rejects out-of-range checkoutDarts', () => {
      for (const checkoutDarts of [0, 4]) {
        const result = GameThrowTurnPayloadSchema.safeParse({
          ...turnPayload(40),
          checkoutDarts,
        });
        expect(result.success, `expected checkoutDarts ${checkoutDarts} to be rejected`).toBe(
          false,
        );
      }
    });
  });

  describe('OneTwoOneConfigSchema', () => {
    it('fills onFail = "fallback" when omitted', () => {
      const result = OneTwoOneConfigSchema.parse({ mode: '121', dartLimit: 9 });
      expect(result.onFail).toBe('fallback');
    });

    it('accepts explicit onFail = "stay"', () => {
      const result = OneTwoOneConfigSchema.parse({ mode: '121', dartLimit: 9, onFail: 'stay' });
      expect(result.onFail).toBe('stay');
    });
  });
});
