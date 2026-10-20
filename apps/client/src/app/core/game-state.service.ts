import { Injectable, computed, signal } from '@angular/core';
import {
  applyThrow,
  applyTurnTotal,
  botThrow,
  createGame,
  type ApplyThrowResult,
  type GameConfig,
  type GameState,
  type Player,
  type Throw,
} from '@darts/shared';

const STORAGE_KEY = 'oche.current-game';
const BOT_DELAY_KEY = 'oche.bot-delay-seconds';
const DEFAULT_BOT_DELAY_SECONDS = 2;
const DARTS_PER_TURN = 3;

export interface TurnSummary {
  playerId: string;
  playerName: string;
  scored: number;
  bust: boolean;
}

export interface LegWonSummary {
  winnerId: string;
  winnerName: string;
  legNumber: number;
  darts: number;
  average: number | null;
  checkout: Throw | null;
}

export interface SavedGameSummary {
  id: string;
  mode: GameState['config']['mode'];
  playerNames: string[];
}

@Injectable({ providedIn: 'root' })
export class GameStateService {
  readonly state = signal<GameState | null>(null);
  readonly error = signal<string | null>(null);
  readonly winner = signal<Player | null>(null);
  readonly lastTurn = signal<TurnSummary | null>(null);
  readonly legWon = signal<LegWonSummary | null>(null);

  private readonly undoStack = signal<GameState[]>([]);
  readonly canUndo = computed(() => this.undoStack().length > 0);

  readonly botDelaySeconds = signal(readBotDelaySeconds());

  private botTimer: ReturnType<typeof setTimeout> | undefined;
  private turnStart: GameState | null = null;

  createGame(config: GameConfig, players: Player[]): string {
    this.resetSession();
    const state = createGame(config, players);
    this.commit(state);
    this.scheduleBotIfNeeded();
    return state.id;
  }

  joinGame(gameId: string): void {
    this.resetSession();
    const saved = readSavedGame();
    if (saved?.id !== gameId) {
      this.error.set(`game ${gameId} not found`);
      return;
    }
    this.state.set(saved);
    if (saved.currentThrows.length === 0) this.turnStart = saved;
    this.scheduleBotIfNeeded();
  }

  throwDart(gameId: string, playerId: string, t: Throw): void {
    this.runMove(gameId, (state) => applyThrow(state, playerId, t), [t]);
  }

  throwTurn(gameId: string, playerId: string, total: number, checkoutDarts?: 1 | 2 | 3): void {
    this.runMove(gameId, (state) => applyTurnTotal(state, playerId, { total, checkoutDarts }), total);
  }

  dismissLegWon(): void {
    if (!this.legWon()) return;
    this.legWon.set(null);
    this.scheduleBotIfNeeded();
  }

  abandonGame(): void {
    this.resetSession();
    removeSavedGame();
  }

  setBotDelaySeconds(seconds: number): void {
    this.botDelaySeconds.set(seconds);
    writeStorage(BOT_DELAY_KEY, String(seconds));
  }

  undo(): void {
    const stack = this.undoStack();
    const previous = stack.at(-1);
    if (!previous) return;
    this.clearBotTimer();
    this.undoStack.set(stack.slice(0, -1));
    this.error.set(null);
    this.winner.set(null);
    this.lastTurn.set(null);
    this.legWon.set(null);
    this.commit(previous);
    this.scheduleBotIfNeeded();
  }

  private runMove(
    gameId: string,
    move: (state: GameState) => ApplyThrowResult,
    input: Throw[] | number,
  ): void {
    const state = this.state();
    if (state?.id !== gameId) {
      this.error.set(`game ${gameId} not found`);
      return;
    }
    try {
      const result = move(state);
      this.undoStack.update((stack) => [...stack, state]);
      this.error.set(null);
      this.applyResult(state, result, input);
      if (!result.gameWon) this.scheduleBotIfNeeded();
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'unknown error');
    }
  }

  private applyResult(before: GameState, result: ApplyThrowResult, input: Throw[] | number): void {
    const player = before.players[before.currentPlayerIndex];
    if (player && result.turnOver && hasTurnScore(before)) {
      this.lastTurn.set(summarizeTurn(this.turnStartFor(before), before, result, player, input));
    }
    this.commit(result.state);
    if (!result.gameWon) this.legWon.set(detectLegWon(before, result.state, input) ?? this.legWon());
    if (result.gameWon) this.finish(result.state);
  }

  private finish(state: GameState): void {
    this.clearBotTimer();
    this.winner.set(state.players.find((p) => p.id === state.winner) ?? null);
    removeSavedGame();
  }

  private turnStartFor(before: GameState): GameState {
    const start = this.turnStart;
    const sameTurn = start?.id === before.id && start.currentPlayerIndex === before.currentPlayerIndex;
    return sameTurn ? start : before;
  }

  private commit(state: GameState): void {
    this.state.set(state);
    if (state.currentThrows.length === 0) this.turnStart = state;
    if (state.status === 'active') saveGame(state);
  }

  private scheduleBotIfNeeded(): void {
    if (!this.currentBot() || this.legWon()) return;
    this.clearBotTimer();
    const dartDelayMs = (this.botDelaySeconds() * 1000) / DARTS_PER_TURN;
    this.botTimer = setTimeout(() => this.playBotDart(), dartDelayMs);
  }

  private playBotDart(): void {
    this.botTimer = undefined;
    const bot = this.currentBot();
    const state = this.state();
    if (!bot || !state) return;

    const t = botThrow(state, bot.id);
    const result = applyThrow(state, bot.id, t);
    this.applyResult(state, result, [t]);
    if (!result.gameWon) this.scheduleBotIfNeeded();
  }

  private currentBot(): Player | null {
    const state = this.state();
    if (!state || state.status !== 'active') return null;
    const current = state.players[state.currentPlayerIndex];
    return current?.isBot ? current : null;
  }

  private resetSession(): void {
    this.clearBotTimer();
    this.state.set(null);
    this.undoStack.set([]);
    this.turnStart = null;
    this.error.set(null);
    this.winner.set(null);
    this.lastTurn.set(null);
    this.legWon.set(null);
  }

  private clearBotTimer(): void {
    clearTimeout(this.botTimer);
    this.botTimer = undefined;
  }
}

export function readSavedGameSummary(): SavedGameSummary | null {
  const saved = readSavedGame();
  if (!saved || saved.status !== 'active') return null;
  return { id: saved.id, mode: saved.config.mode, playerNames: saved.players.map((p) => p.name) };
}

function hasTurnScore(state: GameState): boolean {
  const mode = state.modeState.mode;
  return mode !== 'around-the-clock' && mode !== 'killer';
}

function summarizeTurn(
  turnStart: GameState,
  before: GameState,
  result: ApplyThrowResult,
  player: Player,
  input: Throw[] | number,
): TurnSummary {
  const priorScore = before.currentThrows.reduce((sum, t) => sum + (t.isValid ? t.score : 0), 0);
  const inputScore = typeof input === 'number' ? input : input.reduce((sum, t) => sum + t.segment * t.multiplier, 0);
  const attempted = priorScore + inputScore;
  const summary = { playerId: player.id, playerName: player.name };
  const pointsDelta = pointsGained(turnStart, result.state, player.id);
  if (pointsDelta !== null) return { ...summary, scored: pointsDelta, bust: false };

  if (before.modeState.mode !== 'x01' || result.state.modeState.mode !== 'x01') {
    return { ...summary, scored: attempted, bust: false };
  }
  const startScore = (before.modeState.scores[player.id] ?? 0) + priorScore;
  const legEnded =
    result.state.modeState.completedLegs.length > before.modeState.completedLegs.length;
  if (legEnded) return { ...summary, scored: startScore, bust: false };

  const scored = startScore - (result.state.modeState.scores[player.id] ?? startScore);
  return { ...summary, scored, bust: scored === 0 && attempted > 0 };
}

function pointsGained(before: GameState, after: GameState, playerId: string): number | null {
  const pointsOf = (state: GameState): number | null => {
    const ms = state.modeState;
    if (ms.mode === 'cricket') return ms.points[playerId] ?? 0;
    if (ms.mode === 'shanghai') return ms.scores[playerId] ?? 0;
    return null;
  };
  const start = pointsOf(before);
  const end = pointsOf(after);
  return start === null || end === null ? null : end - start;
}

function detectLegWon(before: GameState, after: GameState, input: Throw[] | number): LegWonSummary | null {
  if (before.modeState.mode !== 'x01' || after.modeState.mode !== 'x01') return null;
  const legs = after.modeState.completedLegs;
  if (legs.length <= before.modeState.completedLegs.length) return null;
  const leg = legs.at(-1)!;
  const winner = after.players.find((p) => p.id === leg.winnerId);
  const darts = leg.dartsThrown[leg.winnerId] ?? 0;
  const scored = leg.scored[leg.winnerId] ?? 0;
  return {
    winnerId: leg.winnerId,
    winnerName: winner?.name ?? 'Player',
    legNumber: legs.length,
    darts,
    average: darts > 0 ? (scored / darts) * 3 : null,
    checkout: typeof input === 'number' ? null : (input.at(-1) ?? null),
  };
}

function readSavedGame(): GameState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as GameState) : null;
  } catch {
    removeSavedGame();
    return null;
  }
}

function readBotDelaySeconds(): number {
  try {
    const raw = localStorage.getItem(BOT_DELAY_KEY);
    const seconds = Number(raw);
    return raw !== null && Number.isFinite(seconds) ? seconds : DEFAULT_BOT_DELAY_SECONDS;
  } catch {
    return DEFAULT_BOT_DELAY_SECONDS;
  }
}

function saveGame(state: GameState): void {
  writeStorage(STORAGE_KEY, JSON.stringify(state));
}

function writeStorage(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage can be full or blocked (private mode); the game still runs in memory.
  }
}

function removeSavedGame(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage can be blocked (private mode); nothing to clean up then.
  }
}
