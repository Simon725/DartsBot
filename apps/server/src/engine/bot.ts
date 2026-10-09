import {
  BOT_PRESETS,
  type BotConfig,
  type BotDifficulty,
  type CheckoutMode,
  type GameState,
  type Player,
  type Throw,
} from '@darts/shared';
import { fatSinglePoint, pointToLanded, targetToPoint } from './dartboard.js';
import { rawScore } from './types.js';
import { CRICKET_NUMBERS } from './cricket.js';
import { sigmaForAverage, sigmaForCheckoutPercent } from './bot-tuning.js';

export interface CheckoutTarget {
  segment: number;
  multiplier: 1 | 2 | 3;
}

/**
 * Threshold (3-dart avg) below which the bot prefers the fat single ring
 * over the triple band on high-score darts. The fat-single keeps the same
 * long-run avg with much smaller variance for weak-to-mid bots.
 */
const FAT_SINGLE_AVG_THRESHOLD = 75;

/**
 * Picks the bot's aim for an x01 score under the given out-mode. Setup shots
 * (scores with no direct finish) never aim a raw score that could bust or
 * leave 1 — e.g. under double-out T20 from 61 would leave 1 (a guaranteed
 * bust position), so T15 is aimed instead.
 */
export function x01Target(remaining: number, outMode: CheckoutMode): CheckoutTarget {
  if (outMode === 'straight') {
    if (remaining === 50) return { segment: 25, multiplier: 2 };
    if (remaining === 25) return { segment: 25, multiplier: 1 };
    if (remaining <= 20) return { segment: remaining, multiplier: 1 };
    if (remaining <= 40 && remaining % 2 === 0) return { segment: remaining / 2, multiplier: 2 };
    if (remaining <= 60 && remaining % 3 === 0) return { segment: remaining / 3, multiplier: 3 };
    // 21..39, odd and not divisible by 3 — take the single that leaves S20.
    if (remaining <= 40) return { segment: remaining - 20, multiplier: 1 };
    // 41..60, not divisible by 3 — take the single that leaves 40 exactly.
    if (remaining <= 60) return { segment: remaining - 40, multiplier: 1 };
    return { segment: 20, multiplier: 3 };
  }
  const finishers: Record<number, CheckoutTarget> = {
    170: { segment: 20, multiplier: 3 },
    167: { segment: 20, multiplier: 3 },
    164: { segment: 20, multiplier: 3 },
    161: { segment: 20, multiplier: 3 },
    160: { segment: 20, multiplier: 3 },
    100: { segment: 20, multiplier: 3 },
    81: { segment: 19, multiplier: 3 },
    80: { segment: 20, multiplier: 2 },
    60: { segment: 20, multiplier: 1 },
    50: { segment: 25, multiplier: 2 },
    40: { segment: 20, multiplier: 2 },
    36: { segment: 18, multiplier: 2 },
    32: { segment: 16, multiplier: 2 },
    24: { segment: 12, multiplier: 2 },
    16: { segment: 8, multiplier: 2 },
    8: { segment: 4, multiplier: 2 },
    4: { segment: 2, multiplier: 2 },
    2: { segment: 1, multiplier: 2 },
  };
  if (finishers[remaining]) return finishers[remaining]!;
  if (remaining <= 40 && remaining % 2 === 0) return { segment: remaining / 2, multiplier: 2 };
  if (remaining <= 40 && remaining % 2 === 1) return { segment: 1, multiplier: 1 };
  // 41..52 — take the single that leaves D16.
  if (remaining <= 52) return { segment: remaining - 32, multiplier: 1 };
  // 53..59 — take the single that leaves D20.
  if (remaining <= 59) return { segment: remaining - 40, multiplier: 1 };
  if (remaining === 61) return { segment: 15, multiplier: 3 };
  return { segment: 20, multiplier: 3 };
}

export function chooseTarget(state: GameState, botPlayerId: string): CheckoutTarget {
  const ms = state.modeState;
  switch (ms.mode) {
    case 'x01': {
      const config = state.config;
      if (config.mode !== 'x01') throw new Error('chooseTarget: x01 modeState requires an x01 config');
      const score = ms.scores[botPlayerId]!;
      const opened = score < config.startScore;
      // An unopened bot must aim the multiplier that opens under the in-mode,
      // otherwise a double-in game would never progress.
      if (!opened && config.inMode === 'double') return { segment: 20, multiplier: 2 };
      if (!opened && config.inMode === 'master') return { segment: 20, multiplier: 3 };
      return x01Target(score, config.outMode);
    }
    case '121':
      // The 121 drill is always played double-out.
      return x01Target(ms.remaining, 'double');
    case 'around-the-clock': {
      const target = ms.target[botPlayerId]!;
      if (target >= 1 && target <= 20) return { segment: target, multiplier: 1 };
      return { segment: 20, multiplier: 1 };
    }
    case 'shanghai': {
      const target = ms.round;
      if (target >= 1 && target <= 20) return { segment: target, multiplier: 3 };
      return { segment: 20, multiplier: 3 };
    }
    case 'cricket': {
      const myMarks = ms.marks[botPlayerId]!;
      for (const n of CRICKET_NUMBERS) {
        if (myMarks[n] < 3) {
          if (n === 25) return { segment: 25, multiplier: 1 };
          return { segment: n, multiplier: 3 };
        }
      }
      const opponents = state.players.filter((p) => p.id !== botPlayerId);
      for (const n of CRICKET_NUMBERS) {
        const open = opponents.some((p) => ms.marks[p.id]![n] < 3);
        if (open) {
          if (n === 25) return { segment: 25, multiplier: 1 };
          return { segment: n, multiplier: 3 };
        }
      }
      return { segment: 20, multiplier: 3 };
    }
    case 'killer': {
      if (!ms.isKiller[botPlayerId]) {
        return { segment: ms.assignedNumber[botPlayerId]!, multiplier: 2 };
      }
      const opponents = state.players
        .filter((p) => p.id !== botPlayerId && ms.lives[p.id]! > 0)
        .sort((a, b) => ms.lives[a.id]! - ms.lives[b.id]!);
      if (opponents.length === 0) return { segment: 20, multiplier: 2 };
      return { segment: ms.assignedNumber[opponents[0]!.id]!, multiplier: 2 };
    }
  }
}

function gaussian(rng: () => number): number {
  const u1 = Math.max(rng(), Number.EPSILON);
  const u2 = rng();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

export interface BotThrowOptions {
  rng?: () => number;
}

/**
 * Resolves a player's bot tuning. `botConfig` wins if present; otherwise the
 * named preset is consulted; otherwise we fall back to 'casual'.
 */
export function resolveBotConfig(player: Player): BotConfig {
  if (player.botConfig) return player.botConfig;
  const diff: BotDifficulty = player.botDifficulty ?? 'casual';
  return BOT_PRESETS[diff];
}

interface ResolvedSigmas {
  baseSigma: number;
  doubleSigma: number;
}

/**
 * Computes σ for general aiming (from target average) and σ for doubles
 * (from checkout %). The double σ is the larger of (1) the σ implied by the
 * requested checkout % and (2) the base σ — a bot can't be MORE accurate on
 * doubles than its general aim allows, but it can be deliberately worse
 * ("pressure factor").
 */
export function resolveSigmas(config: BotConfig): ResolvedSigmas {
  const baseSigma = sigmaForAverage(config.targetAverage);
  const doubleSigma = Math.max(baseSigma, sigmaForCheckoutPercent(config.checkoutPercent));
  return { baseSigma, doubleSigma };
}

/**
 * Returns the (x, y) the bot will actually aim at, given its semantic target
 * and skill level. Weak bots (avg < threshold) aiming a treble switch to the
 * FAT single instead — same long-run expected score for that skill but with
 * far less variance, so the bot doesn't dirty-180 on lucky streaks or hit a
 * 6-dart cold patch on bad ones.
 */
function resolveAimPoint(
  target: CheckoutTarget,
  config: BotConfig,
  allowFatSingle: boolean,
): { x: number; y: number } {
  if (
    allowFatSingle &&
    target.multiplier === 3 &&
    target.segment >= 1 &&
    target.segment <= 20 &&
    config.targetAverage < FAT_SINGLE_AVG_THRESHOLD
  ) {
    return fatSinglePoint(target.segment);
  }
  return targetToPoint(target.segment, target.multiplier);
}

/**
 * True when the bot is unopened in a master-in x01 game. Its treble aim is
 * then an OPENER that must genuinely land in the treble band — the fat-single
 * variance redirect would make the aimed dart an invalid opener every time.
 */
function isMasterInOpener(state: GameState, botPlayerId: string): boolean {
  return (
    state.modeState.mode === 'x01' &&
    state.config.mode === 'x01' &&
    state.config.inMode === 'master' &&
    state.modeState.scores[botPlayerId]! >= state.config.startScore
  );
}

export function botThrow(state: GameState, botPlayerId: string, opts: BotThrowOptions = {}): Throw {
  const rng = opts.rng ?? Math.random;
  const player = state.players.find((p) => p.id === botPlayerId);
  if (!player || !player.isBot) {
    throw new Error(`botThrow: ${botPlayerId} is not a bot player`);
  }
  const config = resolveBotConfig(player);
  const { baseSigma, doubleSigma } = resolveSigmas(config);

  const target = chooseTarget(state, botPlayerId);
  const aim = resolveAimPoint(target, config, !isMasterInOpener(state, botPlayerId));
  // Apply the inflated σ when the bot is going for a double (the "pressure"
  // factor). Bull at multiplier 2 (50) is the centre target and behaves like
  // a double for finishing purposes.
  const sigma =
    target.multiplier === 2 ? doubleSigma : baseSigma;
  const dx = gaussian(rng) * sigma;
  const dy = gaussian(rng) * sigma;
  const landed = pointToLanded(aim.x + dx, aim.y + dy);

  return {
    segment: landed.segment,
    multiplier: landed.multiplier,
    score: rawScore(landed),
    isValid: true,
  };
}
