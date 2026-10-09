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
const BOT_DELAY_MS = 800;
const DARTS_PER_TURN = 3;

@Injectable({ providedIn: 'root' })
export class GameStateService {
  readonly state = signal<GameState | null>(null);
  readonly error = signal<string | null>(null);
  readonly winner = signal<Player | null>(null);

  private readonly undoStack = signal<GameState[]>([]);
  readonly canUndo = computed(() => this.undoStack().length > 0);

  private botTimer: ReturnType<typeof setTimeout> | undefined;

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
    this.scheduleBotIfNeeded();
  }

  throwDart(gameId: string, playerId: string, t: Throw): void {
    this.runMove(gameId, (state) => applyThrow(state, playerId, t));
  }

  throwTurn(gameId: string, playerId: string, total: number, checkoutDarts?: 1 | 2 | 3): void {
    this.runMove(gameId, (state) => applyTurnTotal(state, playerId, { total, checkoutDarts }));
  }

  undo(): void {
    const stack = this.undoStack();
    const previous = stack.at(-1);
    if (!previous) return;
    this.clearBotTimer();
    this.undoStack.set(stack.slice(0, -1));
    this.error.set(null);
    this.winner.set(null);
    this.commit(previous);
    this.scheduleBotIfNeeded();
  }

  private runMove(gameId: string, move: (state: GameState) => ApplyThrowResult): void {
    const state = this.state();
    if (state?.id !== gameId) {
      this.error.set(`game ${gameId} not found`);
      return;
    }
    try {
      const result = move(state);
      this.undoStack.update((stack) => [...stack, state]);
      this.error.set(null);
      this.applyResult(result);
      if (!result.gameWon) this.scheduleBotIfNeeded();
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'unknown error');
    }
  }

  private applyResult(result: ApplyThrowResult): void {
    this.commit(result.state);
    if (result.gameWon) this.finish(result.state);
  }

  private finish(state: GameState): void {
    this.clearBotTimer();
    this.winner.set(state.players.find((p) => p.id === state.winner) ?? null);
    removeSavedGame();
  }

  private commit(state: GameState): void {
    this.state.set(state);
    if (state.status === 'active') saveGame(state);
  }

  private scheduleBotIfNeeded(): void {
    if (!this.currentBot()) return;
    this.clearBotTimer();
    this.botTimer = setTimeout(() => this.playBotTurn(), BOT_DELAY_MS);
  }

  private playBotTurn(): void {
    this.botTimer = undefined;
    const bot = this.currentBot();
    if (!bot) return;

    for (let dart = 0; dart < DARTS_PER_TURN; dart++) {
      const state = this.state();
      if (!state || state.status !== 'active') return;
      if (state.players[state.currentPlayerIndex]?.id !== bot.id) break;
      const result = applyThrow(state, bot.id, botThrow(state, bot.id));
      this.applyResult(result);
      if (result.gameWon) return;
      if (result.turnOver) break;
    }

    this.scheduleBotIfNeeded();
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
    this.error.set(null);
    this.winner.set(null);
  }

  private clearBotTimer(): void {
    clearTimeout(this.botTimer);
    this.botTimer = undefined;
  }
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

function saveGame(state: GameState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
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
