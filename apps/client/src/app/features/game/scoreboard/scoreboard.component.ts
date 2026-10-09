import { Component, input } from '@angular/core';
import { getCheckout, type CheckoutSuggestion, type CricketNumber, type GameState } from '@darts/shared';

@Component({
  selector: 'app-scoreboard',
  standalone: true,
  templateUrl: './scoreboard.component.html',
  styleUrl: './scoreboard.component.css',
})
export class ScoreboardComponent {
  readonly state = input.required<GameState>();

  readonly cricketNumbers: CricketNumber[] = [20, 19, 18, 17, 16, 15, 25];

  // Helpers — narrow modeState by accepting the state as parameter to satisfy template strictness.
  scoreFor(state: GameState, playerId: string): string {
    const ms = state.modeState;
    switch (ms.mode) {
      case 'x01':
        return String(ms.scores[playerId] ?? '-');
      case 'around-the-clock':
        return `→${ms.target[playerId] ?? 1}`;
      case 'shanghai':
        return String(ms.scores[playerId] ?? 0);
      case 'cricket':
        return String(ms.points[playerId] ?? 0);
      case 'killer':
        return '❤'.repeat(ms.lives[playerId] ?? 0) || '✕';
      case '121':
        // Hero number in 121 is the checkout count (the player's score).
        return String(ms.checkouts);
    }
  }

  legAndSetVisible(state: GameState): boolean {
    return state.modeState.mode === 'x01';
  }

  legsFor(state: GameState, playerId: string): number {
    return state.modeState.mode === 'x01' ? (state.modeState.legs[playerId] ?? 0) : 0;
  }

  setsFor(state: GameState, playerId: string): number {
    return state.modeState.mode === 'x01' ? (state.modeState.sets[playerId] ?? 0) : 0;
  }

  cricketMarks(state: GameState, playerId: string): Record<CricketNumber, number> | null {
    return state.modeState.mode === 'cricket' ? (state.modeState.marks[playerId] ?? null) : null;
  }

  killerNumberFor(state: GameState, playerId: string): number | null {
    return state.modeState.mode === 'killer' ? (state.modeState.assignedNumber[playerId] ?? null) : null;
  }

  isKiller(state: GameState, playerId: string): boolean {
    return state.modeState.mode === 'killer' ? (state.modeState.isKiller[playerId] ?? false) : false;
  }

  shanghaiRound(state: GameState): number | null {
    return state.modeState.mode === 'shanghai' ? state.modeState.round : null;
  }

  oneTwoOneDarts(state: GameState): number | null {
    return state.modeState.mode === '121' ? state.modeState.dartsUsed : null;
  }

  oneTwoOneDartLimit(state: GameState): number | null {
    return state.modeState.mode === '121' ? state.modeState.dartLimit : null;
  }

  oneTwoOneCheckouts(state: GameState): number | null {
    return state.modeState.mode === '121' ? state.modeState.checkouts : null;
  }

  oneTwoOneTarget(state: GameState): number | null {
    return state.modeState.mode === '121' ? state.modeState.currentTarget : null;
  }

  oneTwoOneRemaining(state: GameState): number | null {
    return state.modeState.mode === '121' ? state.modeState.remaining : null;
  }

  oneTwoOneOnFreshAttempt(state: GameState): boolean {
    return state.modeState.mode === '121' && state.modeState.dartsUsed === 0;
  }

  /** Formats a number to 2 decimals, or '—' when undefined. */
  private fmt2(n: number | null): string {
    if (n === null || !Number.isFinite(n)) return '—';
    return n.toFixed(2);
  }

  /**
   * Includes in-flight throws so the displayed avg updates dart-by-dart
   * for the active player (rather than only at turn boundaries).
   */
  private liveDartsAndScore(
    state: GameState,
    playerId: string,
    committedDarts: number,
    committedScore: number,
  ): { darts: number; score: number } {
    const cur = state.players[state.currentPlayerIndex];
    if (!cur || cur.id !== playerId) return { darts: committedDarts, score: committedScore };
    let extraDarts = 0;
    let extraScore = 0;
    for (const t of state.currentThrows) {
      extraDarts += 1;
      if (t.isValid) extraScore += t.score;
    }
    return { darts: committedDarts + extraDarts, score: committedScore + extraScore };
  }

  /** x01 3-dart avg = scoredInLeg / dartsThrown * 3, including in-flight darts. */
  x01Avg(state: GameState, playerId: string): string {
    if (state.modeState.mode !== 'x01') return '—';
    const ms = state.modeState;
    const { darts, score } = this.liveDartsAndScore(
      state,
      playerId,
      ms.dartsThrown[playerId] ?? 0,
      ms.scoredInLeg[playerId] ?? 0,
    );
    if (darts === 0) return '—';
    return this.fmt2((score / darts) * 3);
  }

  /** x01 first-9 avg = first9Score / first9Darts * 3 (in-flight aware up to 9 darts). */
  x01First9Avg(state: GameState, playerId: string): string {
    if (state.modeState.mode !== 'x01') return '—';
    const ms = state.modeState;
    const committedDarts = ms.first9Darts[playerId] ?? 0;
    const committedScore = ms.first9Score[playerId] ?? 0;
    const cur = state.players[state.currentPlayerIndex];
    let liveDarts = committedDarts;
    let liveScore = committedScore;
    if (cur?.id === playerId && committedDarts < 9) {
      for (const t of state.currentThrows) {
        if (liveDarts >= 9) break;
        liveDarts += 1;
        if (t.isValid) liveScore += t.score;
      }
    }
    if (liveDarts === 0) return '—';
    return this.fmt2((liveScore / liveDarts) * 3);
  }

  /** x01 darts thrown this leg, including in-flight darts of the active turn. */
  x01Darts(state: GameState, playerId: string): number {
    if (state.modeState.mode !== 'x01') return 0;
    const committed = state.modeState.dartsThrown[playerId] ?? 0;
    const cur = state.players[state.currentPlayerIndex];
    if (cur?.id === playerId) return committed + state.currentThrows.length;
    return committed;
  }

  /** 121: total darts across the drill. */
  oneTwoOneTotalDarts(state: GameState): number | null {
    return state.modeState.mode === '121' ? state.modeState.totalDartsThrown : null;
  }

  /** 121: darts per checkout (lifetime). */
  oneTwoOneDartsPerCheckout(state: GameState): string {
    if (state.modeState.mode !== '121') return '—';
    const ms = state.modeState;
    if (ms.checkouts === 0) return '—';
    return this.fmt2(ms.totalDartsThrown / ms.checkouts);
  }

  /**
   * Returns a checkout suggestion for the given player when their remaining
   * score is ≤ 170 in a double-out or master-out x01 game, or in 121.
   * (All table routes finish on a double, which is also a legal master finish.)
   */
  checkoutFor(state: GameState, playerId: string): CheckoutSuggestion | null {
    const ms = state.modeState;
    let remaining: number;
    if (ms.mode === 'x01') {
      if (state.config.mode !== 'x01' || state.config.outMode === 'straight') return null;
      remaining = ms.scores[playerId] ?? 0;
    } else if (ms.mode === '121') {
      if (playerId !== ms.playerId) return null;
      remaining = ms.remaining;
    } else {
      return null;
    }
    if (remaining > 170 || remaining < 2) return null;
    return getCheckout(remaining);
  }
}
