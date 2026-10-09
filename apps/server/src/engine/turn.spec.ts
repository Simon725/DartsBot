import { describe, expect, it } from 'vitest';
import type { OneTwoOneConfig, Player, X01Config } from '@darts/shared';
import { createGame } from './index.js';
import { applyTurnTotal } from './turn.js';

const p1: Player = { id: 'p1', name: 'Alice', isBot: false };
const p2: Player = { id: 'p2', name: 'Bob', isBot: false };

const x01Cfg: X01Config = {
  mode: 'x01',
  startScore: 501,
  sets: 1,
  legsPerSet: 1,
  inMode: 'straight',
  outMode: 'double',
};

describe('applyTurnTotal — x01', () => {
  it('subtracts total and passes turn', () => {
    const s = createGame(x01Cfg, [p1, p2]);
    const r = applyTurnTotal(s, 'p1', { total: 140 });
    expect(r.state.modeState.mode).toBe('x01');
    if (r.state.modeState.mode === 'x01') {
      expect(r.state.modeState.scores['p1']).toBe(361);
    }
    expect(r.state.currentPlayerIndex).toBe(1);
    expect(r.turnOver).toBe(true);
    expect(r.gameWon).toBe(false);
  });

  it('busts if total > remaining (score unchanged, turn passes)', () => {
    let s = createGame(x01Cfg, [p1, p2]);
    if (s.modeState.mode === 'x01') s.modeState.scores['p1'] = 100;
    const r = applyTurnTotal(s, 'p1', { total: 140 });
    if (r.state.modeState.mode === 'x01') {
      expect(r.state.modeState.scores['p1']).toBe(100);
    }
    expect(r.state.currentPlayerIndex).toBe(1);
  });

  it('checks out 40 in 2 darts under double-out and commits 2 darts to stats', () => {
    let s = createGame(x01Cfg, [p1, p2]);
    if (s.modeState.mode === 'x01') s.modeState.scores['p1'] = 40;
    const r = applyTurnTotal(s, 'p1', { total: 40, checkoutDarts: 2 });
    expect(r.gameWon).toBe(true);
    expect(r.state.winner).toBe('p1');
    // sets=1/legsPerSet=1: the game ends and stats are preserved, so the
    // winner's dartsThrown shows the turn-start value (0) + the 2 checkout darts.
    if (r.state.modeState.mode === 'x01') {
      expect(r.state.modeState.dartsThrown['p1']).toBe(2);
    }
  });

  it('checkoutDarts omitted defaults to 3 and wins', () => {
    let s = createGame(x01Cfg, [p1, p2]);
    if (s.modeState.mode === 'x01') s.modeState.scores['p1'] = 40;
    const r = applyTurnTotal(s, 'p1', { total: 40 });
    expect(r.gameWon).toBe(true);
    expect(r.state.winner).toBe('p1');
    if (r.state.modeState.mode === 'x01') {
      expect(r.state.modeState.dartsThrown['p1']).toBe(3);
    }
  });

  it('rejects a 1-dart checkout of 45 under double-out (needs at least 2 darts)', () => {
    let s = createGame(x01Cfg, [p1, p2]);
    if (s.modeState.mode === 'x01') s.modeState.scores['p1'] = 45;
    expect(() => applyTurnTotal(s, 'p1', { total: 45, checkoutDarts: 1 })).toThrow(
      'cannot check out 45 in 1 dart(s)',
    );
  });

  it('rejects a checkout from a bogey number (159 has no one-turn finish)', () => {
    let s = createGame(x01Cfg, [p1, p2]);
    if (s.modeState.mode === 'x01') s.modeState.scores['p1'] = 159;
    expect(() => applyTurnTotal(s, 'p1', { total: 159 })).toThrow(
      '159 cannot be checked out in one turn',
    );
  });

  it('rejects checkoutDarts on a non-finishing turn', () => {
    const s = createGame(x01Cfg, [p1, p2]);
    expect(() => applyTurnTotal(s, 'p1', { total: 60, checkoutDarts: 1 })).toThrow(
      /only valid when the total finishes/,
    );
  });

  it('rejects checkoutDarts on a busting turn', () => {
    const s = createGame(x01Cfg, [p1, p2]);
    if (s.modeState.mode === 'x01') s.modeState.scores['p1'] = 40;
    expect(() => applyTurnTotal(s, 'p1', { total: 60, checkoutDarts: 2 })).toThrow(
      /only valid when the total finishes/,
    );
  });

  it('bust on tentative=1 with double-out', () => {
    let s = createGame(x01Cfg, [p1, p2]);
    if (s.modeState.mode === 'x01') s.modeState.scores['p1'] = 50;
    const r = applyTurnTotal(s, 'p1', { total: 49 });
    if (r.state.modeState.mode === 'x01') {
      expect(r.state.modeState.scores['p1']).toBe(50);
    }
  });
});

describe('applyTurnTotal — x01 master-out', () => {
  const masterCfg: X01Config = { ...x01Cfg, outMode: 'master' };

  it('checks out 60 in 1 dart (T20)', () => {
    let s = createGame(masterCfg, [p1, p2]);
    if (s.modeState.mode === 'x01') s.modeState.scores['p1'] = 60;
    const r = applyTurnTotal(s, 'p1', { total: 60, checkoutDarts: 1 });
    expect(r.gameWon).toBe(true);
    expect(r.state.winner).toBe('p1');
  });

  it('busts on tentative=1 under master-out', () => {
    let s = createGame(masterCfg, [p1, p2]);
    if (s.modeState.mode === 'x01') s.modeState.scores['p1'] = 50;
    const r = applyTurnTotal(s, 'p1', { total: 49 });
    if (r.state.modeState.mode === 'x01') {
      expect(r.state.modeState.scores['p1']).toBe(50);
    }
  });
});

describe('applyTurnTotal — x01 straight-out', () => {
  const straightCfg: X01Config = { ...x01Cfg, outMode: 'straight' };

  it('leaving 1 is not a bust, and 1 checks out with a single dart', () => {
    let s = createGame(straightCfg, [p1, p2]);
    if (s.modeState.mode === 'x01') s.modeState.scores['p1'] = 50;
    let r = applyTurnTotal(s, 'p1', { total: 49 });
    if (r.state.modeState.mode === 'x01') {
      expect(r.state.modeState.scores['p1']).toBe(1);
    }
    // p2 takes a turn, then p1 finishes from 1.
    r = applyTurnTotal(r.state, 'p2', { total: 26 });
    r = applyTurnTotal(r.state, 'p1', { total: 1, checkoutDarts: 1 });
    expect(r.gameWon).toBe(true);
    expect(r.state.winner).toBe('p1');
  });

  it('rejects checkoutDarts from a fresh 501 (60 does not finish)', () => {
    const s = createGame(straightCfg, [p1, p2]);
    expect(() => applyTurnTotal(s, 'p1', { total: 60, checkoutDarts: 1 })).toThrow(
      /only valid when the total finishes/,
    );
  });
});

describe('applyTurnTotal — 121 drill', () => {
  const cfg: OneTwoOneConfig = { mode: '121', dartLimit: 9, onFail: 'fallback' };

  it('subtracts total from remaining and consumes 3 darts', () => {
    const s = createGame(cfg, [p1]);
    const r = applyTurnTotal(s, 'p1', { total: 60 });
    if (r.state.modeState.mode === '121') {
      expect(r.state.modeState.remaining).toBe(61);
      expect(r.state.modeState.dartsUsed).toBe(3);
    }
  });

  it('successful turn-total checkout banks +1 and raises target', () => {
    const s = createGame(cfg, [p1]);
    const r = applyTurnTotal(s, 'p1', { total: 121, checkoutDarts: 3 });
    if (r.state.modeState.mode === '121') {
      expect(r.state.modeState.checkouts).toBe(1);
      expect(r.state.modeState.currentTarget).toBe(122);
      expect(r.state.modeState.remaining).toBe(122);
      expect(r.state.modeState.dartsUsed).toBe(0);
      expect(r.state.modeState.totalDartsThrown).toBe(3);
    }
  });

  it('a 2-dart checkout counts exactly 2 darts toward the total', () => {
    let s = createGame(cfg, [p1]);
    // Score down to 40 first (121 itself needs all 3 darts).
    s = applyTurnTotal(s, 'p1', { total: 81 }).state;
    const r = applyTurnTotal(s, 'p1', { total: 40, checkoutDarts: 2 });
    if (r.state.modeState.mode === '121') {
      expect(r.state.modeState.checkouts).toBe(1);
      expect(r.state.modeState.currentTarget).toBe(122);
      expect(r.state.modeState.dartsUsed).toBe(0);
      // 3 darts from the scoring turn + 2 from the checkout.
      expect(r.state.modeState.totalDartsThrown).toBe(5);
    }
  });

  it('rejects a 2-dart checkout of 121 (needs all 3 darts)', () => {
    const s = createGame(cfg, [p1]);
    expect(() => applyTurnTotal(s, 'p1', { total: 121, checkoutDarts: 2 })).toThrow(
      'cannot check out 121 in 2 dart(s)',
    );
  });

  it('rejects a checkout that does not fit into the darts left in the attempt', () => {
    let s = createGame({ mode: '121', dartLimit: 7, onFail: 'fallback' }, [p1]);
    // Two non-finishing turns of 30 each: dartsUsed 6, remaining 61.
    s = applyTurnTotal(s, 'p1', { total: 30 }).state;
    s = applyTurnTotal(s, 'p1', { total: 30 }).state;
    if (s.modeState.mode === '121') {
      expect(s.modeState.dartsUsed).toBe(6);
      expect(s.modeState.remaining).toBe(61);
    }
    expect(() => applyTurnTotal(s, 'p1', { total: 61, checkoutDarts: 2 })).toThrow(
      'only 1 dart(s) left in this attempt',
    );
  });

  it('rejects checkoutDarts when the total does not finish the attempt', () => {
    const s = createGame(cfg, [p1]);
    expect(() => applyTurnTotal(s, 'p1', { total: 60, checkoutDarts: 3 })).toThrow(
      /only valid when the total finishes/,
    );
  });

  it('failed attempt resets for the next attempt instead of ending the drill', () => {
    const s = createGame({ mode: '121', dartLimit: 3, onFail: 'fallback' }, [p1]);
    const r = applyTurnTotal(s, 'p1', { total: 60 });
    expect(r.gameWon).toBe(false);
    expect(r.state.status).toBe('active');
    expect(r.state.winner).toBeUndefined();
    if (r.state.modeState.mode === '121') {
      expect(r.state.modeState.currentTarget).toBe(121);
      expect(r.state.modeState.remaining).toBe(121);
      expect(r.state.modeState.dartsUsed).toBe(0);
      expect(r.state.modeState.totalDartsThrown).toBe(3);
    }
  });
});

describe('applyTurnTotal — guard rails', () => {
  it('throws when called for an unsupported mode (cricket)', () => {
    const s = createGame({ mode: 'cricket' }, [p1, p2]);
    expect(() => applyTurnTotal(s, 'p1', { total: 60 })).toThrow();
  });

  it('throws on turn-total for an unopened player in double-in mode', () => {
    const s = createGame({ ...x01Cfg, inMode: 'double' }, [p1, p2]);
    expect(() => applyTurnTotal(s, 'p1', { total: 60 })).toThrow(
      /before opening/,
    );
  });
});
