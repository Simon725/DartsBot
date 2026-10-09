import { describe, expect, it } from 'vitest';
import { x01MatchTotals, type OneTwoOneConfig, type Player, type X01Config } from '@darts/shared';
import { applyThrow, createGame } from './index.js';
import { applyTurnTotal } from './turn.js';

const p1: Player = { id: 'p1', name: 'Alice', isBot: false };
const p2: Player = { id: 'p2', name: 'Bob', isBot: false };

const x01Cfg: X01Config = {
  mode: 'x01',
  startScore: 501,
  sets: 1,
  legsPerSet: 3,
  inMode: 'straight',
  outMode: 'double',
};

function x01(s: ReturnType<typeof createGame>) {
  if (s.modeState.mode !== 'x01') throw new Error('not x01');
  return s.modeState;
}

describe('x01 per-dart stats', () => {
  it('starts with zero stats', () => {
    const s = createGame(x01Cfg, [p1, p2]);
    expect(x01(s).dartsThrown).toEqual({ p1: 0, p2: 0 });
    expect(x01(s).scoredInLeg).toEqual({ p1: 0, p2: 0 });
    expect(x01(s).first9Score).toEqual({ p1: 0, p2: 0 });
    expect(x01(s).first9Darts).toEqual({ p1: 0, p2: 0 });
  });

  it('counts darts only when the turn ends', () => {
    let s = createGame(x01Cfg, [p1, p2]);
    // mid-turn: stats unchanged
    s = applyThrow(s, 'p1', { segment: 20, multiplier: 1 }).state;
    expect(x01(s).dartsThrown['p1']).toBe(0);
    s = applyThrow(s, 'p1', { segment: 20, multiplier: 1 }).state;
    expect(x01(s).dartsThrown['p1']).toBe(0);
    // 3rd dart completes the turn
    s = applyThrow(s, 'p1', { segment: 20, multiplier: 1 }).state;
    expect(x01(s).dartsThrown['p1']).toBe(3);
    expect(x01(s).scoredInLeg['p1']).toBe(60);
  });

  it('first-9 fills correctly across the first three turns', () => {
    let s = createGame(x01Cfg, [p1, p2]);
    // p1 turn 1: 60
    s = applyThrow(s, 'p1', { segment: 20, multiplier: 1 }).state;
    s = applyThrow(s, 'p1', { segment: 20, multiplier: 1 }).state;
    s = applyThrow(s, 'p1', { segment: 20, multiplier: 1 }).state;
    expect(x01(s).first9Darts['p1']).toBe(3);
    expect(x01(s).first9Score['p1']).toBe(60);
    // p2 turn 1
    s = applyThrow(s, 'p2', { segment: 5, multiplier: 1 }).state;
    s = applyThrow(s, 'p2', { segment: 5, multiplier: 1 }).state;
    s = applyThrow(s, 'p2', { segment: 5, multiplier: 1 }).state;
    // p1 turn 2: 100
    s = applyThrow(s, 'p1', { segment: 20, multiplier: 3 }).state;
    s = applyThrow(s, 'p1', { segment: 20, multiplier: 2 }).state;
    s = applyThrow(s, 'p1', { segment: 0, multiplier: 1 }).state;
    expect(x01(s).first9Darts['p1']).toBe(6);
    expect(x01(s).first9Score['p1']).toBe(160);
    // p2 turn 2
    s = applyThrow(s, 'p2', { segment: 5, multiplier: 1 }).state;
    s = applyThrow(s, 'p2', { segment: 5, multiplier: 1 }).state;
    s = applyThrow(s, 'p2', { segment: 5, multiplier: 1 }).state;
    // p1 turn 3: 80
    s = applyThrow(s, 'p1', { segment: 20, multiplier: 1 }).state;
    s = applyThrow(s, 'p1', { segment: 20, multiplier: 1 }).state;
    s = applyThrow(s, 'p1', { segment: 20, multiplier: 2 }).state;
    expect(x01(s).first9Darts['p1']).toBe(9);
    expect(x01(s).first9Score['p1']).toBe(240);
    // p1 turn 4 should NOT update first9
    s = applyThrow(s, 'p2', { segment: 5, multiplier: 1 }).state;
    s = applyThrow(s, 'p2', { segment: 5, multiplier: 1 }).state;
    s = applyThrow(s, 'p2', { segment: 5, multiplier: 1 }).state;
    s = applyThrow(s, 'p1', { segment: 20, multiplier: 3 }).state;
    s = applyThrow(s, 'p1', { segment: 20, multiplier: 3 }).state;
    s = applyThrow(s, 'p1', { segment: 20, multiplier: 3 }).state;
    expect(x01(s).first9Darts['p1']).toBe(9);
    expect(x01(s).first9Score['p1']).toBe(240);
  });

  it('bust counts darts but not score', () => {
    let s = createGame(x01Cfg, [p1, p2]);
    if (s.modeState.mode === 'x01') s.modeState.scores['p1'] = 40;
    // T20 (60) busts from 40
    const r = applyThrow(s, 'p1', { segment: 20, multiplier: 3 });
    expect(x01(r.state).dartsThrown['p1']).toBe(1);
    expect(x01(r.state).scoredInLeg['p1']).toBe(0);
    // Bust darts still count toward first-9 (at 0 score) — PDC convention,
    // and required so a high first turn followed by busts doesn't keep the
    // first-9 avg pinned at the early high value.
    expect(x01(r.state).first9Darts['p1']).toBe(1);
    expect(x01(r.state).first9Score['p1']).toBe(0);
  });

  it('archives the leg stats and resets the leg counters on leg change', () => {
    const s = createGame({ ...x01Cfg, legsPerSet: 2 }, [p1, p2]);
    if (s.modeState.mode === 'x01') s.modeState.scores['p1'] = 40;
    const r = applyThrow(s, 'p1', { segment: 20, multiplier: 2 });
    expect(x01(r.state).dartsThrown).toEqual({ p1: 0, p2: 0 });
    expect(x01(r.state).scoredInLeg).toEqual({ p1: 0, p2: 0 });
    expect(x01(r.state).completedLegs).toHaveLength(1);
    expect(x01(r.state).completedLegs[0]!.winnerId).toBe('p1');
    expect(x01(r.state).completedLegs[0]!.dartsThrown['p1']).toBe(1);
    expect(x01(r.state).completedLegs[0]!.scored['p1']).toBe(40);
  });

  it('archives the final leg when the game ends', () => {
    const s = createGame({ ...x01Cfg, legsPerSet: 1 }, [p1, p2]);
    if (s.modeState.mode === 'x01') s.modeState.scores['p1'] = 40;
    const r = applyThrow(s, 'p1', { segment: 20, multiplier: 2 });
    expect(r.gameWon).toBe(true);
    expect(x01(r.state).completedLegs).toHaveLength(1);
    expect(x01(r.state).completedLegs[0]!.scored['p1']).toBe(40);
  });

  it('match totals span every leg', () => {
    let s = createGame({ ...x01Cfg, legsPerSet: 3 }, [p1, p2]);
    if (s.modeState.mode === 'x01') s.modeState.scores['p1'] = 40;
    s = applyThrow(s, 'p1', { segment: 20, multiplier: 2 }).state;
    // Leg 2: p2 starts and throws 60.
    s = applyThrow(s, 'p2', { segment: 20, multiplier: 1 }).state;
    s = applyThrow(s, 'p2', { segment: 20, multiplier: 1 }).state;
    s = applyThrow(s, 'p2', { segment: 20, multiplier: 1 }).state;
    // p1 throws 180 in leg 2.
    s = applyThrow(s, 'p1', { segment: 20, multiplier: 3 }).state;
    s = applyThrow(s, 'p1', { segment: 20, multiplier: 3 }).state;
    s = applyThrow(s, 'p1', { segment: 20, multiplier: 3 }).state;
    expect(x01MatchTotals(x01(s), 'p1')).toEqual({ darts: 4, scored: 220, first9Darts: 4, first9Score: 220 });
    expect(x01MatchTotals(x01(s), 'p2')).toEqual({ darts: 3, scored: 60, first9Darts: 3, first9Score: 60 });
  });

  it('double-in: rejected opening darts count as thrown but score nothing', () => {
    let s = createGame({ ...x01Cfg, inMode: 'double' }, [p1, p2]);
    // Three T20s, all rejected — player never opened.
    s = applyThrow(s, 'p1', { segment: 20, multiplier: 3 }).state;
    s = applyThrow(s, 'p1', { segment: 20, multiplier: 3 }).state;
    s = applyThrow(s, 'p1', { segment: 20, multiplier: 3 }).state;
    expect(x01(s).dartsThrown['p1']).toBe(3);
    expect(x01(s).scoredInLeg['p1']).toBe(0);
    expect(x01(s).first9Darts['p1']).toBe(3);
    expect(x01(s).first9Score['p1']).toBe(0);
  });

  it('double-in: mid-turn opening counts only the darts after the open', () => {
    let s = createGame({ ...x01Cfg, inMode: 'double' }, [p1, p2]);
    s = applyThrow(s, 'p1', { segment: 20, multiplier: 1 }).state; // rejected (not open)
    s = applyThrow(s, 'p1', { segment: 10, multiplier: 2 }).state; // opens, scores 20
    s = applyThrow(s, 'p1', { segment: 20, multiplier: 1 }).state; // scores 20
    expect(x01(s).dartsThrown['p1']).toBe(3);
    expect(x01(s).scoredInLeg['p1']).toBe(40);
    expect(x01(s).first9Darts['p1']).toBe(3);
    expect(x01(s).first9Score['p1']).toBe(40);
  });
});

describe('x01 turn-total stats', () => {
  it('a 140 turn adds 3 darts and 140 to scoredInLeg', () => {
    const s = createGame(x01Cfg, [p1, p2]);
    const r = applyTurnTotal(s, 'p1', { total: 140 });
    if (r.state.modeState.mode === 'x01') {
      expect(r.state.modeState.dartsThrown['p1']).toBe(3);
      expect(r.state.modeState.scoredInLeg['p1']).toBe(140);
      expect(r.state.modeState.first9Darts['p1']).toBe(3);
      expect(r.state.modeState.first9Score['p1']).toBe(140);
    }
  });

  it('a busted total-turn counts darts but not score', () => {
    let s = createGame(x01Cfg, [p1, p2]);
    if (s.modeState.mode === 'x01') s.modeState.scores['p1'] = 40;
    const r = applyTurnTotal(s, 'p1', { total: 140 });
    if (r.state.modeState.mode === 'x01') {
      expect(r.state.modeState.dartsThrown['p1']).toBe(3);
      expect(r.state.modeState.scoredInLeg['p1']).toBe(0);
    }
  });

  it('a 2-dart finish adds exactly 2 to dartsThrown and fills 2 first-9 slots', () => {
    const s = createGame({ ...x01Cfg, legsPerSet: 1 }, [p1, p2]);
    if (s.modeState.mode === 'x01') s.modeState.scores['p1'] = 40;
    const r = applyTurnTotal(s, 'p1', { total: 40, checkoutDarts: 2 });
    expect(r.gameWon).toBe(true);
    const leg = x01(r.state).completedLegs[0]!;
    expect(leg.dartsThrown['p1']).toBe(2);
    expect(leg.scored['p1']).toBe(40);
    expect(leg.first9Darts['p1']).toBe(2);
    expect(leg.first9Score['p1']).toBe(40);
  });
});

describe('121 drill stats', () => {
  const cfg: OneTwoOneConfig = { mode: '121', dartLimit: 9, onFail: 'fallback' };

  it('starts with 0 total darts', () => {
    const s = createGame(cfg, [p1]);
    if (s.modeState.mode === '121') {
      expect(s.modeState.totalDartsThrown).toBe(0);
    }
  });

  it('counts each dart toward totalDartsThrown', () => {
    let s = createGame(cfg, [p1]);
    s = applyThrow(s, 'p1', { segment: 1, multiplier: 1 }).state;
    s = applyThrow(s, 'p1', { segment: 1, multiplier: 1 }).state;
    if (s.modeState.mode === '121') {
      expect(s.modeState.totalDartsThrown).toBe(2);
    }
  });

  it('totalDartsThrown survives a successful checkout', () => {
    let s = createGame(cfg, [p1]);
    s = applyThrow(s, 'p1', { segment: 17, multiplier: 3 }).state;
    s = applyThrow(s, 'p1', { segment: 18, multiplier: 3 }).state;
    s = applyThrow(s, 'p1', { segment: 8, multiplier: 2 }).state;
    if (s.modeState.mode === '121') {
      expect(s.modeState.totalDartsThrown).toBe(3);
      expect(s.modeState.checkouts).toBe(1);
      expect(s.modeState.dartsUsed).toBe(0);
    }
  });

  it('turn-total checkout adds its dart count to totalDartsThrown', () => {
    const s = createGame(cfg, [p1]);
    const r = applyTurnTotal(s, 'p1', { total: 121, checkoutDarts: 3 });
    if (r.state.modeState.mode === '121') {
      expect(r.state.modeState.totalDartsThrown).toBe(3);
    }
  });
});
