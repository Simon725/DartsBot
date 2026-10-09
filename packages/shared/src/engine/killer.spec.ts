import { describe, expect, it } from 'vitest';
import type { KillerConfig, Player } from '../types.js';
import { applyThrow, createGame } from './index.js';

const cfg: KillerConfig = { mode: 'killer', startingLives: 3 };
const p1: Player = { id: 'p1', name: 'Alice', isBot: false };
const p2: Player = { id: 'p2', name: 'Bob', isBot: false };
const p3: Player = { id: 'p3', name: 'Cara', isBot: false };

function k(s: ReturnType<typeof createGame>) {
  if (s.modeState.mode !== 'killer') throw new Error();
  return s.modeState;
}

describe('killer engine', () => {
  it('assigns numbers 20, 19 and starts with 3 lives each, no killers', () => {
    const s = createGame(cfg, [p1, p2]);
    expect(k(s).assignedNumber).toEqual({ p1: 20, p2: 19 });
    expect(k(s).lives).toEqual({ p1: 3, p2: 3 });
    expect(k(s).isKiller).toEqual({ p1: false, p2: false });
  });

  it('becomes killer on hitting own double', () => {
    let s = createGame(cfg, [p1, p2]);
    const r = applyThrow(s, 'p1', { segment: 20, multiplier: 2 });
    expect(k(r.state).isKiller['p1']).toBe(true);
  });

  it('killer removes opponent life by hitting opponent double', () => {
    let s = createGame(cfg, [p1, p2]);
    if (s.modeState.mode === 'killer') s.modeState.isKiller['p1'] = true;
    const r = applyThrow(s, 'p1', { segment: 19, multiplier: 2 });
    expect(k(r.state).lives['p2']).toBe(2);
  });

  it('wins when last player alive', () => {
    let s = createGame(cfg, [p1, p2]);
    if (s.modeState.mode === 'killer') {
      s.modeState.isKiller['p1'] = true;
      s.modeState.lives['p2'] = 1;
    }
    const r = applyThrow(s, 'p1', { segment: 19, multiplier: 2 });
    expect(r.gameWon).toBe(true);
    expect(r.state.winner).toBe('p1');
  });

  it('single hits do not remove lives or make killer', () => {
    let s = createGame(cfg, [p1, p2]);
    const r = applyThrow(s, 'p1', { segment: 20, multiplier: 1 });
    expect(k(r.state).isKiller['p1']).toBe(false);
  });

  it('self-kill to 0 lives ends the turn immediately (first dart)', () => {
    let s = createGame(cfg, [p1, p2, p3]);
    if (s.modeState.mode === 'killer') {
      s.modeState.isKiller['p1'] = true;
      s.modeState.lives['p1'] = 1;
    }
    const r = applyThrow(s, 'p1', { segment: 20, multiplier: 2 });
    expect(k(r.state).lives['p1']).toBe(0);
    expect(r.turnOver).toBe(true);
    expect(r.gameWon).toBe(false);
    expect(r.state.status).toBe('active');
    expect(r.state.currentPlayerIndex).toBe(1);
    expect(r.state.currentThrows).toEqual([]);
  });

  it('createGame rejects killer with fewer than 2 players', () => {
    expect(() => createGame(cfg, [p1])).toThrow('killer requires at least 2 players');
  });
});
