export type GameMode = 'x01' | 'cricket' | '121' | 'around-the-clock' | 'shanghai' | 'killer';

export type CheckoutMode = 'straight' | 'double' | 'master';

export type BotDifficulty = 'beginner' | 'casual' | 'club' | 'pro';

export interface X01Config {
  mode: 'x01';
  startScore: 301 | 501 | 701 | 1001;
  sets: number;
  legsPerSet: number;
  inMode: CheckoutMode;
  outMode: CheckoutMode;
}

export interface CricketConfig {
  mode: 'cricket';
}

/**
 * What happens to the target after a FAILED 121 attempt (dart limit exhausted
 * without checking out). The drill never self-terminates either way:
 *  - 'fallback': target drops by 1, but never below 121
 *  - 'stay': target is unchanged
 */
export type OneTwoOneFailMode = 'fallback' | 'stay';

export interface OneTwoOneConfig {
  mode: '121';
  dartLimit: number;
  onFail: OneTwoOneFailMode;
}

export interface AroundTheClockConfig {
  mode: 'around-the-clock';
}

export interface ShanghaiConfig {
  mode: 'shanghai';
  rounds: 7 | 20;
}

export interface KillerConfig {
  mode: 'killer';
  startingLives: number;
}

export type GameConfig =
  | X01Config
  | CricketConfig
  | OneTwoOneConfig
  | AroundTheClockConfig
  | ShanghaiConfig
  | KillerConfig;

/**
 * Numeric bot configuration. Both fields are tunable per-bot; lobby presets
 * fill them in based on BotDifficulty.
 *  - targetAverage: desired 3-dart average (30 – 120)
 *  - checkoutPercent: desired double-hit rate when on a checkout (5 – 60)
 */
export interface BotConfig {
  targetAverage: number;
  checkoutPercent: number;
}

export const BOT_PRESETS: Record<BotDifficulty, BotConfig> = {
  beginner: { targetAverage: 45, checkoutPercent: 12 },
  casual:   { targetAverage: 65, checkoutPercent: 22 },
  club:     { targetAverage: 85, checkoutPercent: 32 },
  pro:      { targetAverage: 100, checkoutPercent: 42 },
};

export const BOT_LIMITS = {
  averageMin: 30,
  averageMax: 120,
  checkoutMin: 5,
  checkoutMax: 60,
} as const;

export interface Player {
  id: string;
  name: string;
  isBot: boolean;
  /** Named difficulty preset; informational once botConfig is set. */
  botDifficulty?: BotDifficulty;
  /** Explicit numeric bot tuning. When absent, falls back to BOT_PRESETS[botDifficulty]. */
  botConfig?: BotConfig;
}

export interface Throw {
  segment: number;
  multiplier: 1 | 2 | 3;
  score: number;
  isValid: boolean;
}

export type GameStatus = 'waiting' | 'active' | 'finished';

export interface X01ModeState {
  mode: 'x01';
  scores: Record<string, number>;
  sets: Record<string, number>;
  legs: Record<string, number>;
  legStarterIndex: number;
  /** Legal darts thrown by this player in the CURRENT leg. Resets per leg. */
  dartsThrown: Record<string, number>;
  /** Points scored by this player in the CURRENT leg (bust turns don't count). Resets per leg. */
  scoredInLeg: Record<string, number>;
  /**
   * Sum of points across the first 9 legal darts of the current leg. Exact for
   * per-dart input. For turn-total input a turn straddling the 9-dart boundary
   * is apportioned evenly across the turn's darts (only some of which fall
   * inside the first 9), so first9Score is an approximation in that case — e.g.
   * a 140 turn contributing one dart to the boundary credits 47, whatever that
   * dart actually scored.
   */
  first9Score: Record<string, number>;
  /** Number of legal darts (capped at 9) counted toward first9Score. */
  first9Darts: Record<string, number>;
  /** Per-leg stats of every finished leg, oldest first. Includes the final leg once the game ends. */
  completedLegs: X01LegRecord[];
}

export interface X01LegRecord {
  winnerId: string;
  dartsThrown: Record<string, number>;
  scored: Record<string, number>;
  first9Score: Record<string, number>;
  first9Darts: Record<string, number>;
}

export type CricketNumber = 15 | 16 | 17 | 18 | 19 | 20 | 25;

export interface CricketModeState {
  mode: 'cricket';
  marks: Record<string, Record<CricketNumber, number>>;
  points: Record<string, number>;
}

export interface OneTwoOneModeState {
  mode: '121';
  playerId: string;
  currentTarget: number;
  remaining: number;
  /** Darts used in the CURRENT attempt. Resets on successful checkout. */
  dartsUsed: number;
  dartLimit: number;
  checkouts: number;
  /** Total darts thrown across the whole drill. Never resets. */
  totalDartsThrown: number;
}

export interface AroundTheClockModeState {
  mode: 'around-the-clock';
  target: Record<string, number>;
}

export interface ShanghaiModeState {
  mode: 'shanghai';
  round: number;
  rounds: number;
  scores: Record<string, number>;
  shanghaiWinnerId: string | null;
}

export interface KillerModeState {
  mode: 'killer';
  assignedNumber: Record<string, number>;
  lives: Record<string, number>;
  isKiller: Record<string, boolean>;
  startingLives: number;
}

export type ModeState =
  | X01ModeState
  | CricketModeState
  | OneTwoOneModeState
  | AroundTheClockModeState
  | ShanghaiModeState
  | KillerModeState;

export interface GameState {
  id: string;
  config: GameConfig;
  players: Player[];
  currentPlayerIndex: number;
  currentThrows: Throw[];
  status: GameStatus;
  winner?: string;
  modeState: ModeState;
}
