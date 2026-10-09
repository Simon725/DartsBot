import type { Server, Socket } from 'socket.io';
import {
  EVENTS,
  GameCreatePayloadSchema,
  GameJoinPayloadSchema,
  GameThrowPayloadSchema,
  GameThrowTurnPayloadSchema,
  type ClientToServerEvents,
  type GameFinishedPayload,
  type GameState,
  type ServerToClientEvents,
} from '@darts/shared';
import { applyThrow, createGame } from '../engine/index.js';
import { applyTurnTotal } from '../engine/turn.js';
import { botThrow } from '../engine/bot.js';
import {
  deleteGame,
  getController,
  getGame,
  releaseControllerForSocket,
  saveGame,
  setController,
} from '../store/game-store.js';

type IO = Server<ClientToServerEvents, ServerToClientEvents>;
type IOSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

function broadcastState(io: IO, state: GameState): void {
  io.to(state.id).emit(EVENTS.GAME_STATE, { state });
}

function emitError(socket: IOSocket, message: string): void {
  socket.emit(EVENTS.GAME_ERROR, { message });
}

const BOT_DELAY_MS = 800;
const FINISHED_GAME_TTL_MS = 10 * 60_000;

// One pending bot timer per game, so re-scheduling replaces instead of
// stacking timeouts (stacked timers made the bot throw extra turns).
const botTimers = new Map<string, NodeJS.Timeout>();

function clearBotTimer(gameId: string): void {
  const timer = botTimers.get(gameId);
  if (timer !== undefined) {
    clearTimeout(timer);
    botTimers.delete(gameId);
  }
}

function scheduleBotIfNeeded(io: IO, gameId: string): void {
  const state = getGame(gameId);
  if (!state || state.status !== 'active') return;
  const current = state.players[state.currentPlayerIndex];
  if (!current?.isBot) return;
  clearBotTimer(gameId);
  botTimers.set(
    gameId,
    setTimeout(() => playBotTurn(io, gameId), BOT_DELAY_MS),
  );
}

function playBotTurn(io: IO, gameId: string): void {
  botTimers.delete(gameId);
  let state = getGame(gameId);
  if (!state || state.status !== 'active') return;
  const current = state.players[state.currentPlayerIndex];
  if (!current?.isBot) return;

  const botId = current.id;
  // Throw up to 3 darts (or until turn passes / leg ends).
  for (let i = 0; i < 3; i++) {
    const fresh = getGame(gameId);
    if (!fresh || fresh.status !== 'active') return;
    const cur = fresh.players[fresh.currentPlayerIndex];
    if (!cur || cur.id !== botId) break;
    const t = botThrow(fresh, botId);
    const result = applyThrow(fresh, botId, t);
    saveGame(result.state);
    broadcastState(io, result.state);
    if (result.gameWon) {
      finishGame(io, gameId, result.state);
      return;
    }
    if (result.turnOver) break;
    state = result.state;
  }

  scheduleBotIfNeeded(io, gameId);
}

/** Announces the winner and schedules the finished game for eviction. */
function finishGame(io: IO, gameId: string, state: GameState): void {
  const winner = state.players.find((p) => p.id === state.winner)!;
  const payload: GameFinishedPayload = { winner, state };
  io.to(gameId).emit(EVENTS.GAME_FINISHED, payload);
  clearBotTimer(gameId);
  setTimeout(() => {
    clearBotTimer(gameId);
    deleteGame(gameId);
  }, FINISHED_GAME_TTL_MS).unref();
}

/** True when the socket that currently controls the game is still connected. */
function controllerConnected(io: IO, gameId: string): boolean {
  const controllerId = getController(gameId);
  if (controllerId === null) return false;
  return io.sockets.sockets.get(controllerId) !== undefined;
}

export function registerHandlers(io: IO, socket: IOSocket): void {
  socket.on('disconnect', () => releaseControllerForSocket(socket.id));

  socket.on(EVENTS.GAME_CREATE, (payload, ack) => {
    const parsed = GameCreatePayloadSchema.safeParse(payload);
    if (!parsed.success) {
      ack({ error: parsed.error.message });
      return;
    }
    try {
      const state = createGame(parsed.data.config, parsed.data.players);
      saveGame(state);
      setController(state.id, socket.id);
      socket.join(state.id);
      ack({ gameId: state.id });
      broadcastState(io, state);
      scheduleBotIfNeeded(io, state.id);
    } catch (err) {
      ack({ error: err instanceof Error ? err.message : 'unknown error' });
    }
  });

  socket.on(EVENTS.GAME_JOIN, (payload) => {
    const parsed = GameJoinPayloadSchema.safeParse(payload);
    if (!parsed.success) {
      emitError(socket, parsed.error.message);
      return;
    }
    const state = getGame(parsed.data.gameId);
    if (!state) {
      emitError(socket, `game ${parsed.data.gameId} not found`);
      return;
    }
    // Claim control if the game is unclaimed or its controller went away
    // (e.g. a page refresh); everyone else joins as a spectator.
    if (!controllerConnected(io, state.id)) {
      setController(state.id, socket.id);
    }
    socket.join(state.id);
    socket.emit(EVENTS.GAME_STATE, { state });
  });

  socket.on(EVENTS.GAME_THROW, (payload) => {
    const parsed = GameThrowPayloadSchema.safeParse(payload);
    if (!parsed.success) {
      emitError(socket, parsed.error.message);
      return;
    }
    const state = getGame(parsed.data.gameId);
    if (!state) {
      emitError(socket, `game ${parsed.data.gameId} not found`);
      return;
    }
    if (getController(state.id) !== socket.id) {
      emitError(socket, 'you do not control this game');
      return;
    }
    try {
      const result = applyThrow(state, parsed.data.playerId, parsed.data.throw);
      saveGame(result.state);
      broadcastState(io, result.state);
      if (result.gameWon) {
        finishGame(io, state.id, result.state);
        return;
      }
      scheduleBotIfNeeded(io, state.id);
    } catch (err) {
      emitError(socket, err instanceof Error ? err.message : 'unknown error');
    }
  });

  socket.on(EVENTS.GAME_THROW_TURN, (payload) => {
    const parsed = GameThrowTurnPayloadSchema.safeParse(payload);
    if (!parsed.success) {
      emitError(socket, parsed.error.message);
      return;
    }
    const state = getGame(parsed.data.gameId);
    if (!state) {
      emitError(socket, `game ${parsed.data.gameId} not found`);
      return;
    }
    if (getController(state.id) !== socket.id) {
      emitError(socket, 'you do not control this game');
      return;
    }
    try {
      const result = applyTurnTotal(state, parsed.data.playerId, {
        total: parsed.data.total,
        checkoutDarts: parsed.data.checkoutDarts,
      });
      saveGame(result.state);
      broadcastState(io, result.state);
      if (result.gameWon) {
        finishGame(io, state.id, result.state);
        return;
      }
      scheduleBotIfNeeded(io, state.id);
    } catch (err) {
      emitError(socket, err instanceof Error ? err.message : 'unknown error');
    }
  });
}
