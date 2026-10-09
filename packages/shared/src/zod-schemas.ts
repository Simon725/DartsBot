import { z } from 'zod';

export const CheckoutModeSchema = z.enum(['straight', 'double', 'master']);
export const BotDifficultySchema = z.enum(['beginner', 'casual', 'club', 'pro']);

export const X01ConfigSchema = z.object({
  mode: z.literal('x01'),
  startScore: z.union([z.literal(301), z.literal(501), z.literal(701), z.literal(1001)]),
  sets: z.number().int().min(1).max(99),
  legsPerSet: z.number().int().min(1).max(99),
  inMode: CheckoutModeSchema,
  outMode: CheckoutModeSchema,
});

export const CricketConfigSchema = z.object({ mode: z.literal('cricket') });
export const OneTwoOneConfigSchema = z.object({
  mode: z.literal('121'),
  dartLimit: z.number().int().min(3).max(30),
  onFail: z.enum(['fallback', 'stay']).default('fallback'),
});
export const AroundTheClockConfigSchema = z.object({ mode: z.literal('around-the-clock') });
export const ShanghaiConfigSchema = z.object({
  mode: z.literal('shanghai'),
  rounds: z.union([z.literal(7), z.literal(20)]),
});
export const KillerConfigSchema = z.object({
  mode: z.literal('killer'),
  startingLives: z.number().int().min(1).max(9),
});

export const GameConfigSchema = z.discriminatedUnion('mode', [
  X01ConfigSchema,
  CricketConfigSchema,
  OneTwoOneConfigSchema,
  AroundTheClockConfigSchema,
  ShanghaiConfigSchema,
  KillerConfigSchema,
]);

export const BotConfigSchema = z.object({
  targetAverage: z.number().min(30).max(120),
  checkoutPercent: z.number().min(5).max(60),
});

export const PlayerSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(40),
  isBot: z.boolean(),
  botDifficulty: BotDifficultySchema.optional(),
  botConfig: BotConfigSchema.optional(),
});

export const ThrowSchema = z
  .object({
    segment: z.number().int().refine((n) => n === 0 || (n >= 1 && n <= 20) || n === 25, {
      message: 'segment must be 0 (miss), 1-20, or 25 (bull)',
    }),
    multiplier: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    score: z.number().int().min(0).max(60),
    isValid: z.boolean(),
  })
  .refine((t) => !(t.segment === 25 && t.multiplier === 3), {
    message: 'bullseye cannot be tripled',
  })
  .refine((t) => !(t.segment === 0 && t.multiplier !== 1), {
    message: 'miss must have multiplier 1',
  });

export const GameCreatePayloadSchema = z.object({
  config: GameConfigSchema,
  players: z.array(PlayerSchema).min(1).max(8),
});

export const GameJoinPayloadSchema = z.object({
  gameId: z.string().min(1),
});

export const GameThrowPayloadSchema = z.object({
  gameId: z.string().min(1),
  playerId: z.string().min(1),
  throw: ThrowSchema,
});

/** The only totals in 0..180 that cannot be scored with 3 darts. */
export const IMPOSSIBLE_TURN_TOTALS: ReadonlySet<number> = new Set([
  163, 166, 169, 172, 173, 175, 176, 178, 179,
]);

export const GameThrowTurnPayloadSchema = z.object({
  gameId: z.string().min(1),
  playerId: z.string().min(1),
  total: z
    .number()
    .int()
    .min(0)
    .max(180)
    .refine((n) => !IMPOSSIBLE_TURN_TOTALS.has(n), {
      message: 'impossible 3-dart total',
    }),
  checkoutDarts: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
});
