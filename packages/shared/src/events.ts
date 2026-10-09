import type { GameConfig, GameState, Player, Throw } from './types.js';

export const EVENTS = {
  GAME_CREATE: 'game:create',
  GAME_JOIN: 'game:join',
  GAME_THROW: 'game:throw',
  GAME_THROW_TURN: 'game:throw-turn',
  GAME_STATE: 'game:state',
  GAME_ERROR: 'game:error',
  GAME_FINISHED: 'game:finished',
} as const;

export interface GameCreatePayload {
  config: GameConfig;
  players: Player[];
}

export interface GameJoinPayload {
  gameId: string;
}

export interface GameThrowPayload {
  gameId: string;
  playerId: string;
  throw: Throw;
}

export interface GameThrowTurnPayload {
  gameId: string;
  playerId: string;
  /** total points scored across the 3 darts of this turn (0-180) */
  total: number;
  /**
   * Present only when total exactly finishes the remaining score — the number
   * of darts used for the checkout. Scoring and bust turns omit it.
   */
  checkoutDarts?: 1 | 2 | 3;
}

export interface GameStatePayload {
  state: GameState;
}

export interface GameErrorPayload {
  message: string;
}

export interface GameFinishedPayload {
  winner: Player;
  state: GameState;
}

export interface ServerToClientEvents {
  [EVENTS.GAME_STATE]: (payload: GameStatePayload) => void;
  [EVENTS.GAME_ERROR]: (payload: GameErrorPayload) => void;
  [EVENTS.GAME_FINISHED]: (payload: GameFinishedPayload) => void;
}

export interface ClientToServerEvents {
  [EVENTS.GAME_CREATE]: (
    payload: GameCreatePayload,
    ack: (response: { gameId: string } | { error: string }) => void,
  ) => void;
  [EVENTS.GAME_JOIN]: (payload: GameJoinPayload) => void;
  [EVENTS.GAME_THROW]: (payload: GameThrowPayload) => void;
  [EVENTS.GAME_THROW_TURN]: (payload: GameThrowTurnPayload) => void;
}
