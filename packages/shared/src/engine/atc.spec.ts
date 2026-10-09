import { describe, expect, it } from 'vitest';
import type { AroundTheClockConfig, Player } from '../types.js';
import { applyThrow, createGame } from './index.js';

const cfg: AroundTheClockConfig = { mode: 'around-the-clock' };
const p1: Player = { id: 'p1', name: 'Alice', isBot: false };
const p2: Player = { id: 'p2', name: 'Bob', isBot: false };

function atc(s: ReturnType<typeof createGame>) {
  if (s.modeState.mode !== 'around-the-clock') throw new Error();
  return s.modeState;
}

describe('around-the-clock engine', () => {
  it('starts both players at target 1', () => {
    const s = createGame(cfg, [p1, p2]);
    expect(atc(s).target).toEqual({ p1: 1, p2: 1 });
  });

  it('advances target when hitting any segment of current target', () => {
    let s = createGame(cfg, [p1, p2]);
    let r = applyThrow(s, 'p1', { segment: 1, multiplier: 1 });
    expect(atc(r.state).target['p1']).toBe(2);
    r = applyThrow(r.state, 'p1', { segment: 1, multiplier: 2 });
    expect(atc(r.state).target['p1']).toBe(2); // double 1 is not target 2; still on 2
    r = applyThrow(r.state, 'p1', { segment: 2, multiplier: 3 });
    expect(atc(r.state).target['p1']).toBe(3);
    // Turn ends, next player.
    expect(r.state.currentPlayerIndex).toBe(1);
  });

  it('does not advance on a miss', () => {
    let s = createGame(cfg, [p1, p2]);
    const r = applyThrow(s, 'p1', { segment: 5, multiplier: 1 });
    expect(atc(r.state).target['p1']).toBe(1);
    expect(r.state.currentThrows[0]!.isValid).toBe(false);
  });

  it('wins after hitting 20', () => {
    let s = createGame(cfg, [p1, p2]);
    if (s.modeState.mode === 'around-the-clock') s.modeState.target['p1'] = 20;
    const r = applyThrow(s, 'p1', { segment: 20, multiplier: 1 });
    expect(r.gameWon).toBe(true);
    expect(r.state.winner).toBe('p1');
  });
});
