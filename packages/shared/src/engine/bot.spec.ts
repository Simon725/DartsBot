import { describe, expect, it } from 'vitest';
import {
  BOT_PRESETS,
  type BotConfig,
  type GameState,
  type Player,
  type X01Config,
} from '../types.js';
import { botThrow, chooseTarget, resolveBotConfig, resolveSigmas, x01Target } from './bot.js';
import { sigmaForAverage, sigmaForCheckoutPercent } from './bot-tuning.js';
import { createGame } from './index.js';

function makeState(
  player: Pick<Player, 'botDifficulty' | 'botConfig'>,
  cfgOverrides: Partial<Omit<X01Config, 'mode'>> = {},
): GameState {
  const bot: Player = {
    id: 'b',
    name: 'Bot',
    isBot: true,
    ...player,
  };
  const human: Player = { id: 'h', name: 'Human', isBot: false };
  const cfg: X01Config = {
    mode: 'x01',
    startScore: 501,
    sets: 1,
    legsPerSet: 1,
    inMode: 'straight',
    outMode: 'double',
    ...cfgOverrides,
  };
  return createGame(cfg, [bot, human]);
}

function seededRng(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

function trebleRateAimingT20(
  player: Pick<Player, 'botDifficulty' | 'botConfig'>,
  n: number,
  seed: number,
): number {
  const state = makeState(player);
  const rng = seededRng(seed);
  let trebles = 0;
  for (let i = 0; i < n; i++) {
    const t = botThrow(state, 'b', { rng });
    if (t.segment === 20 && t.multiplier === 3) trebles++;
  }
  return trebles / n;
}

describe('bot engine — presets', () => {
  it('pro preset hits T20 > 25% of the time', () => {
    const rate = trebleRateAimingT20({ botDifficulty: 'pro' }, 1000, 42);
    expect(rate).toBeGreaterThan(0.25);
  });

  it('beginner preset hits T20 < 10% of the time', () => {
    const rate = trebleRateAimingT20({ botDifficulty: 'beginner' }, 1000, 99);
    expect(rate).toBeLessThan(0.1);
  });

  it('produces a valid throw shape', () => {
    const state = makeState({ botDifficulty: 'pro' });
    const t = botThrow(state, 'b');
    expect(t.multiplier === 1 || t.multiplier === 2 || t.multiplier === 3).toBe(true);
    expect(t.score).toBe(t.segment * t.multiplier);
  });
});

describe('x01Target — double-out setup shots', () => {
  it('45 → S13 (leaves D16)', () => {
    expect(x01Target(45, 'double')).toEqual({ segment: 13, multiplier: 1 });
  });

  it('57 → S17 (leaves D20)', () => {
    expect(x01Target(57, 'double')).toEqual({ segment: 17, multiplier: 1 });
  });

  it('61 → T15 (T20 would leave 1)', () => {
    expect(x01Target(61, 'double')).toEqual({ segment: 15, multiplier: 3 });
  });

  it('41 → S9 (leaves D16)', () => {
    expect(x01Target(41, 'double')).toEqual({ segment: 9, multiplier: 1 });
  });

  it('never aims a bust or a leave of 1 for any remaining 41..59', () => {
    for (let remaining = 41; remaining <= 59; remaining++) {
      const target = x01Target(remaining, 'double');
      const score = target.segment * target.multiplier;
      const exactDoubleFinish = target.multiplier === 2 && score === remaining;
      expect(exactDoubleFinish || remaining - score >= 2).toBe(true);
    }
  });
});

describe('x01Target — straight-out', () => {
  it('20 → S20 (direct finish)', () => {
    expect(x01Target(20, 'straight')).toEqual({ segment: 20, multiplier: 1 });
  });

  it('39 → T13 (direct finish)', () => {
    expect(x01Target(39, 'straight')).toEqual({ segment: 13, multiplier: 3 });
  });

  it('23 → S3 (leaves S20)', () => {
    expect(x01Target(23, 'straight')).toEqual({ segment: 3, multiplier: 1 });
  });

  it('50 → bull (direct finish)', () => {
    expect(x01Target(50, 'straight')).toEqual({ segment: 25, multiplier: 2 });
  });
});

describe('chooseTarget — x01 in-mode awareness', () => {
  it('unopened bot under double-in aims D20', () => {
    const state = makeState({ botDifficulty: 'pro' }, { inMode: 'double' });
    expect(chooseTarget(state, 'b')).toEqual({ segment: 20, multiplier: 2 });
  });

  it('unopened bot under master-in aims T20', () => {
    const state = makeState({ botDifficulty: 'pro' }, { inMode: 'master' });
    expect(chooseTarget(state, 'b')).toEqual({ segment: 20, multiplier: 3 });
  });

  it('opened bot follows x01Target for the out-mode', () => {
    const state = makeState({ botDifficulty: 'pro' }, { inMode: 'double' });
    if (state.modeState.mode === 'x01') state.modeState.scores['b'] = 45;
    expect(chooseTarget(state, 'b')).toEqual(x01Target(45, 'double'));
  });
});

describe('master-in opener bypasses the fat-single redirect', () => {
  // gaussian(u1=1, u2=1) === 0, so the dart lands exactly on the aim point.
  const exactRng = () => 1;

  it('weak unopened bot under master-in genuinely lands T20', () => {
    const state = makeState({ botDifficulty: 'beginner' }, { inMode: 'master' });
    const t = botThrow(state, 'b', { rng: exactRng });
    expect(t.segment).toBe(20);
    expect(t.multiplier).toBe(3);
  });

  it('the same weak bot on a plain scoring dart still takes the fat single', () => {
    const state = makeState({ botDifficulty: 'beginner' });
    const t = botThrow(state, 'b', { rng: exactRng });
    expect(t.segment).toBe(20);
    expect(t.multiplier).toBe(1);
  });
});

describe('bot config resolution', () => {
  it('explicit botConfig wins over named difficulty', () => {
    const player: Player = {
      id: 'b',
      name: 'Bot',
      isBot: true,
      botDifficulty: 'beginner',
      botConfig: { targetAverage: 100, checkoutPercent: 40 },
    };
    expect(resolveBotConfig(player)).toEqual({ targetAverage: 100, checkoutPercent: 40 });
  });

  it('named difficulty falls back to the preset', () => {
    const player: Player = { id: 'b', name: 'Bot', isBot: true, botDifficulty: 'club' };
    expect(resolveBotConfig(player)).toEqual(BOT_PRESETS.club);
  });

  it('no difficulty + no config → casual default', () => {
    const player: Player = { id: 'b', name: 'Bot', isBot: true };
    expect(resolveBotConfig(player)).toEqual(BOT_PRESETS.casual);
  });
});

describe('bot tuning tables (avg → σ, checkout% → σ)', () => {
  it('higher target average maps to a smaller σ', () => {
    expect(sigmaForAverage(40)).toBeGreaterThan(sigmaForAverage(80));
    expect(sigmaForAverage(80)).toBeGreaterThan(sigmaForAverage(110));
  });

  it('higher checkout% maps to a smaller σ', () => {
    expect(sigmaForCheckoutPercent(10)).toBeGreaterThan(sigmaForCheckoutPercent(30));
    expect(sigmaForCheckoutPercent(30)).toBeGreaterThan(sigmaForCheckoutPercent(55));
  });

  it('doubleSigma never goes below baseSigma (no super-accurate doubles)', () => {
    const cfg: BotConfig = { targetAverage: 60, checkoutPercent: 55 };
    const { baseSigma, doubleSigma } = resolveSigmas(cfg);
    expect(doubleSigma).toBeGreaterThanOrEqual(baseSigma);
  });

  it('doubleSigma inflates when checkout% is set below natural rate', () => {
    // A 110-avg bot would naturally hit D20 ~40% — force 20%, σ must inflate.
    const cfg: BotConfig = { targetAverage: 110, checkoutPercent: 20 };
    const { baseSigma, doubleSigma } = resolveSigmas(cfg);
    expect(doubleSigma).toBeGreaterThan(baseSigma);
  });
});

describe('weak bots aim FAT 20 to reduce streakiness', () => {
  /** Compute mean and stddev of 9-dart aggregate scores. */
  function nineDartStats(config: BotConfig, windows: number, seed: number): { mean: number; std: number } {
    const state = makeState({ botConfig: config });
    const rng = seededRng(seed);
    const w: number[] = [];
    for (let i = 0; i < windows; i++) {
      let sum = 0;
      for (let j = 0; j < 9; j++) {
        const t = botThrow(state, 'b', { rng });
        sum += t.score;
      }
      w.push(sum);
    }
    const mean = w.reduce((a, b) => a + b, 0) / w.length;
    const variance = w.reduce((a, b) => a + (b - mean) ** 2, 0) / w.length;
    return { mean, std: Math.sqrt(variance) };
  }

  it('long-run avg still matches the target (within ±15%)', () => {
    const cfg: BotConfig = { targetAverage: 45, checkoutPercent: 12 };
    const { mean } = nineDartStats(cfg, 1000, 7);
    const longRunAvg = mean / 9 * 3;
    // 45 ± 15% gives [38, 52] — the fat-single switch preserves the avg.
    expect(longRunAvg).toBeGreaterThan(38);
    expect(longRunAvg).toBeLessThan(52);
  });

  it('rarely produces a "lucky" 90+ first-9 streak', () => {
    const cfg: BotConfig = { targetAverage: 45, checkoutPercent: 12 };
    const state = makeState({ botConfig: cfg });
    const rng = seededRng(31);
    let luckyStreaks = 0;
    const trials = 1000;
    for (let i = 0; i < trials; i++) {
      let sum = 0;
      for (let j = 0; j < 9; j++) {
        const t = botThrow(state, 'b', { rng });
        sum += t.score;
      }
      const avg3 = (sum / 9) * 3;
      if (avg3 >= 90) luckyStreaks++;
    }
    // Before fat-single aiming, a 45-avg bot hit 90+ in maybe 4-6% of 9-dart
    // windows (T20 lottery). After, it should be < 1%.
    expect(luckyStreaks / trials).toBeLessThan(0.015);
  });

  it('strong bots keep aiming T20 (their T20 rate stays high)', () => {
    // Avg 100 is above the FAT_SINGLE_AVG_THRESHOLD; the pro keeps T20.
    const rate = trebleRateAimingT20({ botConfig: { targetAverage: 100, checkoutPercent: 40 } }, 1000, 51);
    expect(rate).toBeGreaterThan(0.2);
  });
});

describe('bot empirical checkout rate matches requested percent', () => {
  function d20HitRate(config: BotConfig, n: number, seed: number): number {
    // Set up a position where the bot must aim D20: remaining = 40 in x01.
    const state = makeState({ botConfig: config });
    if (state.modeState.mode === 'x01') state.modeState.scores['b'] = 40;
    const rng = seededRng(seed);
    let hits = 0;
    for (let i = 0; i < n; i++) {
      const t = botThrow(state, 'b', { rng });
      if (t.segment === 20 && t.multiplier === 2) hits++;
    }
    return hits / n;
  }

  it('a 30% target checkout produces ~30% D20 hit rate (±8pp)', () => {
    const rate = d20HitRate({ targetAverage: 80, checkoutPercent: 30 }, 2000, 17);
    expect(rate).toBeGreaterThan(0.22);
    expect(rate).toBeLessThan(0.38);
  });

  it('a 12% target checkout produces ~12% D20 hit rate (±6pp)', () => {
    const rate = d20HitRate({ targetAverage: 45, checkoutPercent: 12 }, 2000, 23);
    expect(rate).toBeGreaterThan(0.06);
    expect(rate).toBeLessThan(0.18);
  });
});
