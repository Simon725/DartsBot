import { Injectable, inject, signal } from '@angular/core';
import {
  EVENTS,
  type GameConfig,
  type GameErrorPayload,
  type GameFinishedPayload,
  type GameState,
  type GameStatePayload,
  type GameThrowTurnPayload,
  type Player,
  type Throw,
} from '@darts/shared';
import { SocketService } from './socket.service';

@Injectable({ providedIn: 'root' })
export class GameStateService {
  private readonly socket = inject(SocketService);

  readonly state = signal<GameState | null>(null);
  readonly error = signal<string | null>(null);
  readonly winner = signal<Player | null>(null);

  constructor() {
    this.socket.on<GameStatePayload>(EVENTS.GAME_STATE).subscribe(({ state }) => {
      this.state.set(state);
    });
    this.socket.on<GameErrorPayload>(EVENTS.GAME_ERROR).subscribe(({ message }) => {
      this.error.set(message);
    });
    this.socket.on<GameFinishedPayload>(EVENTS.GAME_FINISHED).subscribe(({ winner, state }) => {
      this.winner.set(winner);
      this.state.set(state);
    });
  }

  async createGame(config: GameConfig, players: Player[]): Promise<string> {
    this.error.set(null);
    this.winner.set(null);
    const res = await this.socket.emitWithAck<
      { config: GameConfig; players: Player[] },
      { gameId: string } | { error: string }
    >(EVENTS.GAME_CREATE, { config, players });
    if ('error' in res) throw new Error(res.error);
    return res.gameId;
  }

  joinGame(gameId: string): void {
    // Clear leftovers from a previous game so its winner banner / error
    // can't overlay the newly joined one.
    this.error.set(null);
    this.winner.set(null);
    this.socket.emit(EVENTS.GAME_JOIN, { gameId });
  }

  throwDart(gameId: string, playerId: string, t: Throw): void {
    this.socket.emit(EVENTS.GAME_THROW, { gameId, playerId, throw: t });
  }

  throwTurn(gameId: string, playerId: string, total: number, checkoutDarts?: 1 | 2 | 3): void {
    const payload: GameThrowTurnPayload = { gameId, playerId, total };
    if (checkoutDarts !== undefined) payload.checkoutDarts = checkoutDarts;
    this.socket.emit(EVENTS.GAME_THROW_TURN, payload);
  }
}
