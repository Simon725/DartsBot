import { describe, expect, it } from 'vitest';
import type { X01Config, Player } from '../types.js';
import { applyThrow, createGame } from './index.js';

const baseConfig: X01Config = {
  mode: 'x01',
  startScore: 501,
  sets: 1,
  legsPerSet: 1,
  inMode: 'straight',
  outMode: 'double',
};

const p1: Player = { id: 'p1', name: 'Alice', isBot: false };
const p2: Player = { id: 'p2', name: 'Bob', isBot: false };

function x01(s: ReturnType<typeof createGame>) {
  if (s.modeState.mode !== 'x01') throw new Error('not x01');
  return s.modeState;
}

describe('x01 engine', () => {
  it('creates a game with start scores', () => {
    const s = createGame(baseConfig, [p1, p2]);
    expect(x01(s).scores).toEqual({ p1: 501, p2: 501 });
    expect(x01(s).sets).toEqual({ p1: 0, p2: 0 });
    expect(x01(s).legs).toEqual({ p1: 0, p2: 0 });
    expect(s.currentPlayerIndex).toBe(0);
    expect(s.status).toBe('active');
  });

  it('finishes 170 with T20+T20+Bull (double-out)', () => {
    let s = createGame({ ...baseConfig, startScore: 501 }, [p1, p2]);
    // bootstrap to 170 by overriding score for the test scenario
    if (s.modeState.mode === 'x01') s.modeState.scores['p1'] = 170;
    let r = applyThrow(s, 'p1', { segment: 20, multiplier: 3 });
    expect(x01(r.state).scores['p1']).toBe(110);
    r = applyThrow(r.state, 'p1', { segment: 20, multiplier: 3 });
    expect(x01(r.state).scores['p1']).toBe(50);
    r = applyThrow(r.state, 'p1', { segment: 25, multiplier: 2 });
    expect(r.gameWon).toBe(true);
    expect(r.state.status).toBe('finished');
    expect(r.state.winner).toBe('p1');
  });

  it('busts when score goes below 0 and resets score, passes turn', () => {
    let s = createGame(baseConfig, [p1, p2]);
    if (s.modeState.mode === 'x01') s.modeState.scores['p1'] = 40;
    const r = applyThrow(s, 'p1', { segment: 20, multiplier: 3 });
    expect(x01(r.state).scores['p1']).toBe(40);
    expect(r.state.currentPlayerIndex).toBe(1);
    expect(r.state.currentThrows).toEqual([]);
  });

  it('busts when reaching exactly 1 with double-out', () => {
    let s = createGame(baseConfig, [p1, p2]);
    if (s.modeState.mode === 'x01') s.modeState.scores['p1'] = 3;
    const r = applyThrow(s, 'p1', { segment: 2, multiplier: 1 });
    expect(x01(r.state).scores['p1']).toBe(3);
  });

  it('bust voids the whole turn, not just the busting dart', () => {
    let s = createGame(baseConfig, [p1, p2]);
    if (s.modeState.mode === 'x01') s.modeState.scores['p1'] = 40;
    s = applyThrow(s, 'p1', { segment: 20, multiplier: 1 }).state; // 40 → 20
    expect(x01(s).scores['p1']).toBe(20);
    const r = applyThrow(s, 'p1', { segment: 20, multiplier: 3 }); // over → bust
    expect(x01(r.state).scores['p1']).toBe(40); // back to turn start, not 20
    expect(x01(r.state).scoredInLeg['p1']).toBe(0);
    expect(r.state.currentPlayerIndex).toBe(1);
  });

  it('leave-1 bust mid-turn also restores the turn-start score', () => {
    let s = createGame(baseConfig, [p1, p2]);
    if (s.modeState.mode === 'x01') s.modeState.scores['p1'] = 41;
    s = applyThrow(s, 'p1', { segment: 20, multiplier: 1 }).state; // 41 → 21
    const r = applyThrow(s, 'p1', { segment: 20, multiplier: 1 }); // would leave 1 → bust
    expect(x01(r.state).scores['p1']).toBe(41);
    expect(r.state.currentPlayerIndex).toBe(1);
  });

  it('busts when finishing on a non-double with double-out', () => {
    let s = createGame(baseConfig, [p1, p2]);
    if (s.modeState.mode === 'x01') s.modeState.scores['p1'] = 20;
    const r = applyThrow(s, 'p1', { segment: 20, multiplier: 1 });
    expect(x01(r.state).scores['p1']).toBe(20);
  });

  it('double-in: first single 20 does not score', () => {
    const s = createGame({ ...baseConfig, inMode: 'double' }, [p1, p2]);
    const r = applyThrow(s, 'p1', { segment: 20, multiplier: 1 });
    expect(x01(r.state).scores['p1']).toBe(501);
    expect(r.state.currentThrows[0]!.isValid).toBe(false);
  });

  it('double-in: first double opens scoring', () => {
    const s = createGame({ ...baseConfig, inMode: 'double' }, [p1, p2]);
    const r = applyThrow(s, 'p1', { segment: 10, multiplier: 2 });
    expect(x01(r.state).scores['p1']).toBe(481);
    expect(r.state.currentThrows[0]!.isValid).toBe(true);
  });

  it('passes turn after 3 throws', () => {
    let s = createGame(baseConfig, [p1, p2]);
    s = applyThrow(s, 'p1', { segment: 20, multiplier: 1 }).state;
    s = applyThrow(s, 'p1', { segment: 20, multiplier: 1 }).state;
    s = applyThrow(s, 'p1', { segment: 20, multiplier: 1 }).state;
    expect(s.currentPlayerIndex).toBe(1);
    expect(x01(s).scores['p1']).toBe(441);
    expect(s.currentThrows).toEqual([]);
  });

  it('leg won → sets/legs updated; next leg starter rotates', () => {
    const cfg: X01Config = { ...baseConfig, sets: 2, legsPerSet: 2 };
    let s = createGame(cfg, [p1, p2]);
    if (s.modeState.mode === 'x01') s.modeState.scores['p1'] = 40;
    const r = applyThrow(s, 'p1', { segment: 20, multiplier: 2 });
    expect(r.gameWon).toBe(false);
    expect(x01(r.state).legs).toEqual({ p1: 1, p2: 0 });
    expect(x01(r.state).sets).toEqual({ p1: 0, p2: 0 });
    expect(x01(r.state).scores).toEqual({ p1: 501, p2: 501 });
    expect(r.state.currentPlayerIndex).toBe(1);
    expect(x01(r.state).legStarterIndex).toBe(1);
  });

  it('full game won after winning required sets', () => {
    const cfg: X01Config = { ...baseConfig, sets: 1, legsPerSet: 1 };
    let s = createGame(cfg, [p1, p2]);
    if (s.modeState.mode === 'x01') s.modeState.scores['p1'] = 40;
    const r = applyThrow(s, 'p1', { segment: 20, multiplier: 2 });
    expect(r.gameWon).toBe(true);
    expect(r.state.status).toBe('finished');
    expect(r.state.winner).toBe('p1');
    expect(x01(r.state).sets).toEqual({ p1: 1, p2: 0 });
  });
});

describe('x01 master-out (per dart)', () => {
  const masterCfg: X01Config = { ...baseConfig, outMode: 'master' };

  it('treble finish wins the leg', () => {
    let s = createGame(masterCfg, [p1, p2]);
    if (s.modeState.mode === 'x01') s.modeState.scores['p1'] = 60;
    const r = applyThrow(s, 'p1', { segment: 20, multiplier: 3 });
    expect(r.gameWon).toBe(true);
    expect(r.state.status).toBe('finished');
    expect(r.state.winner).toBe('p1');
  });

  it('double finish wins the leg', () => {
    let s = createGame(masterCfg, [p1, p2]);
    if (s.modeState.mode === 'x01') s.modeState.scores['p1'] = 40;
    const r = applyThrow(s, 'p1', { segment: 20, multiplier: 2 });
    expect(r.gameWon).toBe(true);
    expect(r.state.winner).toBe('p1');
  });

  it('busts when a dart would leave 1', () => {
    let s = createGame(masterCfg, [p1, p2]);
    if (s.modeState.mode === 'x01') s.modeState.scores['p1'] = 3;
    const r = applyThrow(s, 'p1', { segment: 2, multiplier: 1 });
    expect(x01(r.state).scores['p1']).toBe(3);
    expect(r.state.currentPlayerIndex).toBe(1);
  });
});

describe('x01 straight-out (per dart)', () => {
  it('leaving 1 is not a bust and a single 1 finishes', () => {
    const cfg: X01Config = { ...baseConfig, outMode: 'straight' };
    let s = createGame(cfg, [p1, p2]);
    if (s.modeState.mode === 'x01') s.modeState.scores['p1'] = 3;
    let r = applyThrow(s, 'p1', { segment: 2, multiplier: 1 });
    expect(x01(r.state).scores['p1']).toBe(1);
    r = applyThrow(r.state, 'p1', { segment: 1, multiplier: 1 });
    expect(r.gameWon).toBe(true);
    expect(r.state.winner).toBe('p1');
  });
});
