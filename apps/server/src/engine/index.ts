import { randomUUID } from 'node:crypto';
import type { GameConfig, GameState, ModeState, Player, Throw } from '@darts/shared';
import type { ApplyThrowResult } from './types.js';
import { applyX01Throw, createX01State } from './x01.js';
import { applyAtcThrow, createAtcState } from './atc.js';
import { applyShanghaiThrow, createShanghaiState } from './shanghai.js';
import { applyCricketThrow, createCricketState } from './cricket.js';
import { applyKillerThrow, createKillerState } from './killer.js';
import { applyOneTwoOneThrow, createOneTwoOneState } from './oneTwoOne.js';

export { rawScore } from './types.js';

export function createGame(config: GameConfig, players: Player[]): GameState {
  const ids = players.map((p) => p.id);
  let modeState: ModeState;
  switch (config.mode) {
    case 'x01':
      modeState = createX01State(config, ids);
      break;
    case 'around-the-clock':
      modeState = createAtcState(ids);
      break;
    case 'shanghai':
      modeState = createShanghaiState(config, ids);
      break;
    case 'cricket':
      modeState = createCricketState(ids);
      break;
    case 'killer':
      if (players.length < 2) {
        throw new Error('killer requires at least 2 players');
      }
      modeState = createKillerState(config, ids);
      break;
    case '121':
      if (ids.length !== 1) {
        throw new Error('121 is a single-player drill — exactly one player is required');
      }
      // The drill never self-terminates, so a bot player would loop forever.
      if (players[0]!.isBot) {
        throw new Error('121 is a solo human drill — bot players are not allowed');
      }
      modeState = createOneTwoOneState(config, ids);
      break;
  }
  return {
    id: randomUUID(),
    config,
    players,
    currentPlayerIndex: 0,
    currentThrows: [],
    status: 'active',
    modeState,
  };
}

export function applyThrow(
  state: GameState,
  playerId: string,
  rawThrow: Pick<Throw, 'segment' | 'multiplier'>,
): ApplyThrowResult {
  if (state.status !== 'active') {
    throw new Error(`applyThrow: game is not active (status=${state.status})`);
  }
  const current = state.players[state.currentPlayerIndex];
  if (!current || current.id !== playerId) {
    throw new Error(`applyThrow: not ${playerId}'s turn`);
  }
  switch (state.modeState.mode) {
    case 'x01':
      return applyX01Throw(state, playerId, rawThrow);
    case 'around-the-clock':
      return applyAtcThrow(state, playerId, rawThrow);
    case 'shanghai':
      return applyShanghaiThrow(state, playerId, rawThrow);
    case 'cricket':
      return applyCricketThrow(state, playerId, rawThrow);
    case 'killer':
      return applyKillerThrow(state, playerId, rawThrow);
    case '121':
      return applyOneTwoOneThrow(state, playerId, rawThrow);
  }
}
