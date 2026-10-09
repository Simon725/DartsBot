import { Component, input } from '@angular/core';
import {
  getCheckout,
  threeDartAverage,
  x01MatchTotals,
  type CheckoutSuggestion,
  type CricketNumber,
  type GameState,
} from '@darts/shared';
import { RollingNumberComponent } from '../../../shared/rolling-number.component';
import { SpotlightDirective } from '../../../shared/spotlight.directive';

@Component({
  selector: 'app-scoreboard',
  standalone: true,
  imports: [RollingNumberComponent, SpotlightDirective],
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

  rollsScore(state: GameState): boolean {
    const mode = state.modeState.mode;
    return mode === 'x01' || mode === 'cricket' || mode === 'shanghai';
  }

  multiplierLetter(multiplier: number): string {
    if (multiplier === 3) return 'T';
    if (multiplier === 2) return 'D';
    return 'S';
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

  /** Formats a number to 2 decimals, or '-' when undefined. */
  private fmt2(n: number | null): string {
    if (n === null || !Number.isFinite(n)) return '-';
    return n.toFixed(2);
  }

  private isThrowing(state: GameState, playerId: string): boolean {
    return state.status === 'active' && state.players[state.currentPlayerIndex]?.id === playerId;
  }

  /** Match-wide 3-dart avg across every leg, including in-flight darts. */
  x01Avg(state: GameState, playerId: string): string {
    if (state.modeState.mode !== 'x01') return '-';
    let { darts, scored } = x01MatchTotals(state.modeState, playerId);
    if (this.isThrowing(state, playerId)) {
      for (const t of state.currentThrows) {
        darts += 1;
        if (t.isValid) scored += t.score;
      }
    }
    return this.fmt2(threeDartAverage(scored, darts));
  }

  /** Match-wide first-9 avg; in-flight darts count only within the current leg's first 9. */
  x01First9Avg(state: GameState, playerId: string): string {
    if (state.modeState.mode !== 'x01') return '-';
    const ms = state.modeState;
    let { first9Darts, first9Score } = x01MatchTotals(ms, playerId);
    if (this.isThrowing(state, playerId)) {
      let legDarts = ms.first9Darts[playerId] ?? 0;
      for (const t of state.currentThrows) {
        if (legDarts >= 9) break;
        legDarts += 1;
        first9Darts += 1;
        if (t.isValid) first9Score += t.score;
      }
    }
    return this.fmt2(threeDartAverage(first9Score, first9Darts));
  }

  /** Darts thrown in the current leg; the final leg's count once the game is over. */
  x01Darts(state: GameState, playerId: string): number {
    if (state.modeState.mode !== 'x01') return 0;
    const ms = state.modeState;
    if (state.status === 'finished') return ms.completedLegs.at(-1)?.dartsThrown[playerId] ?? 0;
    const committed = ms.dartsThrown[playerId] ?? 0;
    return this.isThrowing(state, playerId) ? committed + state.currentThrows.length : committed;
  }

  /** 121: total darts across the drill. */
  oneTwoOneTotalDarts(state: GameState): number | null {
    return state.modeState.mode === '121' ? state.modeState.totalDartsThrown : null;
  }

  /** 121: darts per checkout (lifetime). */
  oneTwoOneDartsPerCheckout(state: GameState): string {
    if (state.modeState.mode !== '121') return '-';
    const ms = state.modeState;
    if (ms.checkouts === 0) return '-';
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
