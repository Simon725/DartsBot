import { describe, expect, it } from 'vitest';
import type { Player, ShanghaiConfig } from '@darts/shared';
import { applyThrow, createGame } from './index.js';

const cfg: ShanghaiConfig = { mode: 'shanghai', rounds: 7 };
const p1: Player = { id: 'p1', name: 'Alice', isBot: false };
const p2: Player = { id: 'p2', name: 'Bob', isBot: false };

function sh(s: ReturnType<typeof createGame>) {
  if (s.modeState.mode !== 'shanghai') throw new Error();
  return s.modeState;
}

describe('shanghai engine', () => {
  it('starts at round 1, score 0', () => {
    const s = createGame(cfg, [p1, p2]);
    expect(sh(s).round).toBe(1);
    expect(sh(s).scores).toEqual({ p1: 0, p2: 0 });
  });

  it('scores hits on the current round number only', () => {
    let s = createGame(cfg, [p1, p2]);
    let r = applyThrow(s, 'p1', { segment: 1, multiplier: 3 });
    expect(sh(r.state).scores['p1']).toBe(3);
    r = applyThrow(r.state, 'p1', { segment: 2, multiplier: 1 });
    expect(sh(r.state).scores['p1']).toBe(3); // 2 doesn't count in round 1
    r = applyThrow(r.state, 'p1', { segment: 1, multiplier: 1 });
    expect(sh(r.state).scores['p1']).toBe(4);
    // turn ends, next is p2 in round 1
    expect(r.state.currentPlayerIndex).toBe(1);
    expect(sh(r.state).round).toBe(1);
  });

  it('advances round after all players have thrown', () => {
    let s = createGame(cfg, [p1, p2]);
    // p1 throws 3 darts.
    for (let i = 0; i < 3; i++) s = applyThrow(s, 'p1', { segment: 5, multiplier: 1 }).state;
    expect(sh(s).round).toBe(1);
    expect(s.currentPlayerIndex).toBe(1);
    // p2 throws 3 darts → round advances.
    for (let i = 0; i < 3; i++) s = applyThrow(s, 'p2', { segment: 5, multiplier: 1 }).state;
    expect(sh(s).round).toBe(2);
    expect(s.currentPlayerIndex).toBe(0);
  });

  it('instant-win on Shanghai (S+D+T of round number)', () => {
    let s = createGame(cfg, [p1, p2]);
    s = applyThrow(s, 'p1', { segment: 1, multiplier: 1 }).state;
    s = applyThrow(s, 'p1', { segment: 1, multiplier: 2 }).state;
    const r = applyThrow(s, 'p1', { segment: 1, multiplier: 3 });
    expect(r.gameWon).toBe(true);
    expect(r.state.winner).toBe('p1');
  });
});
