import type { GameState } from '@darts/shared';

interface GameEntry {
  state: GameState;
  /** socket.id of the client allowed to submit throws, or null when unclaimed */
  controllerId: string | null;
  lastActivityMs: number;
  /** set once, the first time the game is saved with status "finished" */
  finishedAtMs: number | null;
}

const games = new Map<string, GameEntry>();

export function saveGame(state: GameState): void {
  const existing = games.get(state.id);
  const now = Date.now();
  const finishedAtMs =
    existing?.finishedAtMs ?? (state.status === 'finished' ? now : null);
  games.set(state.id, {
    state,
    controllerId: existing?.controllerId ?? null,
    lastActivityMs: now,
    finishedAtMs,
  });
}

export function getGame(id: string): GameState | undefined {
  return games.get(id)?.state;
}

export function deleteGame(id: string): void {
  games.delete(id);
}

export function setController(gameId: string, socketId: string): void {
  const entry = games.get(gameId);
  if (entry) entry.controllerId = socketId;
}

export function getController(gameId: string): string | null {
  return games.get(gameId)?.controllerId ?? null;
}

/** Clears the controller on every game the socket controls (e.g. on disconnect). */
export function releaseControllerForSocket(socketId: string): void {
  for (const entry of games.values()) {
    if (entry.controllerId === socketId) entry.controllerId = null;
  }
}

/**
 * Deletes games finished longer than finishedTtlMs ago, or idle longer than
 * idleTtlMs. Finished games were previously never evicted, so long-running
 * servers accumulated every game ever played -> unbounded memory growth.
 * Returns the ids of the deleted games.
 */
export function sweepStaleGames(opts: { finishedTtlMs: number; idleTtlMs: number }): string[] {
  const now = Date.now();
  const deleted: string[] = [];
  for (const [id, entry] of games) {
    const finishedTooLong =
      entry.finishedAtMs !== null && now - entry.finishedAtMs > opts.finishedTtlMs;
    const idleTooLong = now - entry.lastActivityMs > opts.idleTtlMs;
    if (finishedTooLong || idleTooLong) {
      games.delete(id);
      deleted.push(id);
    }
  }
  return deleted;
}
