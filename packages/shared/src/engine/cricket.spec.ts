import { describe, expect, it } from 'vitest';
import type { CricketConfig, Player } from '../types.js';
import { applyThrow, createGame } from './index.js';

const cfg: CricketConfig = { mode: 'cricket' };
const p1: Player = { id: 'p1', name: 'Alice', isBot: false };
const p2: Player = { id: 'p2', name: 'Bob', isBot: false };

function cr(s: ReturnType<typeof createGame>) {
  if (s.modeState.mode !== 'cricket') throw new Error();
  return s.modeState;
}

describe('cricket engine', () => {
  it('starts with empty marks and zero points', () => {
    const s = createGame(cfg, [p1, p2]);
    expect(cr(s).marks['p1']![20]).toBe(0);
    expect(cr(s).points).toEqual({ p1: 0, p2: 0 });
  });

  it('triple closes a number in one dart', () => {
    let s = createGame(cfg, [p1, p2]);
    const r = applyThrow(s, 'p1', { segment: 20, multiplier: 3 });
    expect(cr(r.state).marks['p1']![20]).toBe(3);
    expect(cr(r.state).points['p1']).toBe(0);
  });

  it('triple on already-closed number scores 3× when opponent has not closed', () => {
    let s = createGame(cfg, [p1, p2]);
    s = applyThrow(s, 'p1', { segment: 20, multiplier: 3 }).state;
    const r = applyThrow(s, 'p1', { segment: 20, multiplier: 3 });
    expect(cr(r.state).marks['p1']![20]).toBe(3);
    expect(cr(r.state).points['p1']).toBe(60);
  });

  it('closing on triple from 2 marks gives one mark scoring 20 (the surplus)', () => {
    let s = createGame(cfg, [p1, p2]);
    s = applyThrow(s, 'p1', { segment: 20, multiplier: 2 }).state; // 2 marks
    const r = applyThrow(s, 'p1', { segment: 20, multiplier: 3 }); // 3 hits: 1 closes, 2 surplus
    expect(cr(r.state).marks['p1']![20]).toBe(3);
    expect(cr(r.state).points['p1']).toBe(40);
  });

  it('does not score on a number opponent has already closed', () => {
    let s = createGame(cfg, [p1, p2]);
    // opponent closes 20 first.
    s = applyThrow(s, 'p1', { segment: 20, multiplier: 3 }).state;
    // exhaust p1's turn
    s = applyThrow(s, 'p1', { segment: 5, multiplier: 1 }).state;
    s = applyThrow(s, 'p1', { segment: 5, multiplier: 1 }).state;
    // p2 closes 20 too.
    s = applyThrow(s, 'p2', { segment: 20, multiplier: 3 }).state;
    // now if p1 hits T20, opponent has closed, so no points.
    s = applyThrow(s, 'p2', { segment: 5, multiplier: 1 }).state;
    s = applyThrow(s, 'p2', { segment: 5, multiplier: 1 }).state;
    const r = applyThrow(s, 'p1', { segment: 20, multiplier: 3 });
    expect(cr(r.state).points['p1']).toBe(0);
  });

  it('wins when all numbers closed and points ≥ opponents', () => {
    let s = createGame(cfg, [p1, p2]);
    if (s.modeState.mode === 'cricket') {
      s.modeState.marks['p1'] = { 15: 3, 16: 3, 17: 3, 18: 3, 19: 3, 20: 2, 25: 3 };
    }
    const r = applyThrow(s, 'p1', { segment: 20, multiplier: 1 });
    expect(r.gameWon).toBe(true);
    expect(r.state.winner).toBe('p1');
  });
});
