import { describe, expect, it } from 'vitest';
import type { OneTwoOneConfig, Player } from '@darts/shared';
import { applyThrow, createGame } from './index.js';

const cfg: OneTwoOneConfig = { mode: '121', dartLimit: 9, onFail: 'fallback' };
const p1: Player = { id: 'p1', name: 'Alice', isBot: false };

function ot(s: ReturnType<typeof createGame>) {
  if (s.modeState.mode !== '121') throw new Error('not 121');
  return s.modeState;
}

describe('121 drill engine', () => {
  it('starts at 121 with 0 darts and 0 checkouts', () => {
    const s = createGame(cfg, [p1]);
    expect(ot(s).currentTarget).toBe(121);
    expect(ot(s).remaining).toBe(121);
    expect(ot(s).dartsUsed).toBe(0);
    expect(ot(s).checkouts).toBe(0);
    expect(ot(s).dartLimit).toBe(9);
  });

  it('rejects more than one player', () => {
    expect(() => createGame(cfg, [p1, { ...p1, id: 'p2' }])).toThrow();
  });

  it('rejects a bot player (the drill never ends, a bot would loop forever)', () => {
    const bot: Player = { id: 'b1', name: 'Bot', isBot: true, botDifficulty: 'club' };
    expect(() => createGame(cfg, [bot])).toThrow(/bot/i);
  });

  it('successful checkout banks +1 and raises next target to 122', () => {
    let s = createGame(cfg, [p1]);
    s = applyThrow(s, 'p1', { segment: 17, multiplier: 3 }).state; // 70
    s = applyThrow(s, 'p1', { segment: 18, multiplier: 3 }).state; // 16
    const r = applyThrow(s, 'p1', { segment: 8, multiplier: 2 }); // D8 finish 121
    expect(ot(r.state).checkouts).toBe(1);
    expect(ot(r.state).currentTarget).toBe(122);
    expect(ot(r.state).remaining).toBe(122);
    expect(ot(r.state).dartsUsed).toBe(0);
    expect(r.state.status).toBe('active');
  });

  it('progression: 121 → 122 → 123', () => {
    let s = createGame(cfg, [p1]);
    // First checkout (121): T17, T18, D8.
    s = applyThrow(s, 'p1', { segment: 17, multiplier: 3 }).state;
    s = applyThrow(s, 'p1', { segment: 18, multiplier: 3 }).state;
    s = applyThrow(s, 'p1', { segment: 8, multiplier: 2 }).state;
    expect(ot(s).currentTarget).toBe(122);
    // Second checkout (122): T18, T18, D7.  54+54+14=122.
    s = applyThrow(s, 'p1', { segment: 18, multiplier: 3 }).state;
    s = applyThrow(s, 'p1', { segment: 18, multiplier: 3 }).state;
    s = applyThrow(s, 'p1', { segment: 7, multiplier: 2 }).state;
    expect(ot(s).checkouts).toBe(2);
    expect(ot(s).currentTarget).toBe(123);
    expect(ot(s).remaining).toBe(123);
  });

  it('caps target at 170', () => {
    let s = createGame(cfg, [p1]);
    if (s.modeState.mode === '121') {
      s.modeState.currentTarget = 170;
      s.modeState.remaining = 170;
    }
    // T20, T20, Bull finishes 170.
    s = applyThrow(s, 'p1', { segment: 20, multiplier: 3 }).state;
    s = applyThrow(s, 'p1', { segment: 20, multiplier: 3 }).state;
    s = applyThrow(s, 'p1', { segment: 25, multiplier: 2 }).state;
    expect(ot(s).checkouts).toBe(1);
    expect(ot(s).currentTarget).toBe(170);
    expect(ot(s).remaining).toBe(170);
  });

  it('busts when finishing on non-double, dart still consumed', () => {
    let s = createGame(cfg, [p1]);
    if (s.modeState.mode === '121') s.modeState.remaining = 20;
    const r = applyThrow(s, 'p1', { segment: 20, multiplier: 1 });
    expect(ot(r.state).remaining).toBe(20);
    expect(ot(r.state).dartsUsed).toBe(1);
    expect(ot(r.state).checkouts).toBe(0);
  });

  it('failed attempt at the 121 floor with fallback keeps the drill active at 121', () => {
    let s = createGame({ mode: '121', dartLimit: 3, onFail: 'fallback' }, [p1]);
    s = applyThrow(s, 'p1', { segment: 1, multiplier: 1 }).state;
    s = applyThrow(s, 'p1', { segment: 1, multiplier: 1 }).state;
    const r = applyThrow(s, 'p1', { segment: 1, multiplier: 1 });
    expect(r.gameWon).toBe(false);
    expect(r.state.status).toBe('active');
    expect(r.state.winner).toBeUndefined();
    // Fallback cannot drop below the 121 floor.
    expect(ot(r.state).currentTarget).toBe(121);
    expect(ot(r.state).remaining).toBe(121);
    expect(ot(r.state).dartsUsed).toBe(0);
    expect(ot(r.state).checkouts).toBe(0);
  });

  it('failed attempt with fallback drops the target by 1 and keeps checkouts', () => {
    let s = createGame({ mode: '121', dartLimit: 6, onFail: 'fallback' }, [p1]);
    // First checkout (121): T17 + T18 + D8.
    s = applyThrow(s, 'p1', { segment: 17, multiplier: 3 }).state;
    s = applyThrow(s, 'p1', { segment: 18, multiplier: 3 }).state;
    s = applyThrow(s, 'p1', { segment: 8, multiplier: 2 }).state;
    expect(ot(s).checkouts).toBe(1);
    expect(ot(s).currentTarget).toBe(122);
    expect(ot(s).remaining).toBe(122);
    expect(ot(s).dartsUsed).toBe(0);
    // Second attempt at 122: burn 6 darts on S1 without finishing.
    for (let i = 0; i < 6; i++) {
      s = applyThrow(s, 'p1', { segment: 1, multiplier: 1 }).state;
    }
    expect(s.status).toBe('active');
    expect(ot(s).currentTarget).toBe(121);
    expect(ot(s).remaining).toBe(121);
    expect(ot(s).dartsUsed).toBe(0);
    expect(ot(s).checkouts).toBe(1);
  });

  it('failed attempt with stay keeps the target unchanged', () => {
    let s = createGame({ mode: '121', dartLimit: 6, onFail: 'stay' }, [p1]);
    // First checkout (121): T17 + T18 + D8.
    s = applyThrow(s, 'p1', { segment: 17, multiplier: 3 }).state;
    s = applyThrow(s, 'p1', { segment: 18, multiplier: 3 }).state;
    s = applyThrow(s, 'p1', { segment: 8, multiplier: 2 }).state;
    expect(ot(s).currentTarget).toBe(122);
    // Second attempt at 122: burn 6 darts on S1 without finishing.
    for (let i = 0; i < 6; i++) {
      s = applyThrow(s, 'p1', { segment: 1, multiplier: 1 }).state;
    }
    expect(s.status).toBe('active');
    expect(ot(s).currentTarget).toBe(122);
    expect(ot(s).remaining).toBe(122);
    expect(ot(s).dartsUsed).toBe(0);
    expect(ot(s).checkouts).toBe(1);
  });

  it('totalDartsThrown accumulates and consecutive failed attempts never finish the drill', () => {
    let s = createGame({ mode: '121', dartLimit: 3, onFail: 'fallback' }, [p1]);
    // Three consecutive failed attempts (9 darts of S1).
    for (let i = 0; i < 9; i++) {
      const r = applyThrow(s, 'p1', { segment: 1, multiplier: 1 });
      expect(r.gameWon).toBe(false);
      expect(r.state.status).toBe('active');
      s = r.state;
    }
    expect(ot(s).totalDartsThrown).toBe(9);
    expect(ot(s).dartsUsed).toBe(0);
    expect(ot(s).checkouts).toBe(0);
    expect(s.winner).toBeUndefined();
  });
});
