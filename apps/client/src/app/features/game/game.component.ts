import { Component, OnInit, computed, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import type { CheckoutMode, Throw } from '@darts/shared';
import { GameStateService } from '../../core/game-state.service';
import { ScoreboardComponent } from './scoreboard/scoreboard.component';
import { ThrowInputComponent } from './throw-input/throw-input.component';

@Component({
  selector: 'app-game',
  standalone: true,
  imports: [ScoreboardComponent, ThrowInputComponent, RouterLink],
  templateUrl: './game.component.html',
  styleUrl: './game.component.css',
})
export class GameComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly gameStateService = inject(GameStateService);

  readonly state = this.gameStateService.state;
  readonly winner = this.gameStateService.winner;
  readonly error = this.gameStateService.error;

  readonly gameId = computed(() => this.state()?.id ?? null);

  readonly currentPlayer = computed(() => {
    const s = this.state();
    return s ? (s.players[s.currentPlayerIndex] ?? null) : null;
  });

  readonly title = computed(() => {
    const s = this.state();
    if (!s) return '';
    const c = s.config;
    switch (c.mode) {
      case 'x01': return `x01 · ${c.startScore}`;
      case 'cricket': return 'Cricket';
      case 'around-the-clock': return 'Around the Clock';
      case 'shanghai': return `Shanghai · ${c.rounds} rounds`;
      case 'killer': return 'Killer';
      case '121': {
        const ms = s.modeState;
        if (ms.mode === '121') return `Checkout · ${ms.currentTarget}`;
        return 'Checkout drill';
      }
    }
  });

  readonly subtitle = computed(() => {
    const s = this.state();
    if (!s) return '';
    const c = s.config;
    switch (c.mode) {
      case 'x01':
        return `First to ${c.sets} set(s) · ${c.legsPerSet} leg(s) per set · ${c.inMode}-in / ${c.outMode}-out`;
      case 'cricket':
        return 'Close 15-20 + bull, then outscore opponents';
      case 'around-the-clock':
        return 'Hit 1 through 20 in order';
      case 'shanghai':
        return 'Hit S+D+T of the round number for instant win';
      case 'killer':
        return `Start with ${c.startingLives} lives · hit own double to become killer`;
      case '121':
        return (
          `Solo drill · double-out within ${c.dartLimit} darts · +1 target per checkout` +
          (c.onFail === 'fallback'
            ? ' · failed attempt drops the target'
            : ' · failed attempt keeps the target')
        );
    }
  });

  readonly inputDisabled = computed(() => {
    const s = this.state();
    if (!s || s.status !== 'active') return true;
    const cur = s.players[s.currentPlayerIndex];
    return !cur || cur.isBot;
  });

  /** Out-mode governing what counts as a legal finish for the current game. */
  readonly outMode = computed<CheckoutMode>(() => {
    const s = this.state();
    if (!s) return 'double';
    const c = s.config;
    switch (c.mode) {
      case 'x01': return c.outMode;
      case '121': return 'double';
      default: return 'double';
    }
  });

  /**
   * Current player's remaining score in modes that count down to zero
   * (x01, 121). Null elsewhere — the throw input then never treats an
   * entered total as a declared checkout.
   */
  readonly currentRemaining = computed<number | null>(() => {
    const s = this.state();
    if (!s) return null;
    const ms = s.modeState;
    if (ms.mode === 'x01') {
      const cur = s.players[s.currentPlayerIndex];
      return cur ? (ms.scores[cur.id] ?? null) : null;
    }
    if (ms.mode === '121') return ms.remaining;
    return null;
  });

  /** Darts left in the current 121 attempt; null outside the 121 drill. */
  readonly attemptDartsLeft = computed<number | null>(() => {
    const s = this.state();
    if (!s || s.modeState.mode !== '121') return null;
    return s.modeState.dartLimit - s.modeState.dartsUsed;
  });

  /**
   * Whether turn-total input is currently accepted. Requires a mode that
   * scores by totals (x01, 121) AND — for x01 with a non-straight in-mode —
   * that the current player has already opened (the server can't attribute
   * an opening dart inside an opaque total, so it rejects those turns).
   */
  readonly turnTotalSupported = computed(() => {
    const s = this.state();
    if (!s) return false;
    const c = s.config;
    if (c.mode !== 'x01' && c.mode !== '121') return false;
    if (c.mode === 'x01' && c.inMode !== 'straight' && s.modeState.mode === 'x01') {
      const cur = s.players[s.currentPlayerIndex];
      // Gate on HUMAN turns only: during a bot's turn the panel is disabled
      // anyway, and flipping the gate here would force the human off their
      // chosen Total tab every time an unopened bot comes up to throw.
      if (cur && !cur.isBot && (s.modeState.scores[cur.id] ?? c.startScore) === c.startScore) {
        return false;
      }
    }
    return true;
  });

  /** Reason shown on the disabled Total tab, matching why it's unsupported. */
  readonly turnTotalDisabledReason = computed(() => {
    const s = this.state();
    if (!s) return 'Unavailable in this mode';
    const c = s.config;
    if (c.mode !== 'x01' && c.mode !== '121') return 'Unavailable in this mode';
    if (c.mode === 'x01' && c.inMode !== 'straight') {
      return `Open per-dart first (${c.inMode}-in)`;
    }
    return 'Unavailable in this mode';
  });

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (id && this.state()?.id !== id) {
      this.gameStateService.joinGame(id);
    }
  }

  onThrow(t: Throw): void {
    const s = this.state();
    const cur = this.currentPlayer();
    if (!s || !cur || cur.isBot) return;
    this.gameStateService.throwDart(s.id, cur.id, t);
  }

  onTurn(payload: { total: number; checkoutDarts?: 1 | 2 | 3 }): void {
    const s = this.state();
    const cur = this.currentPlayer();
    if (!s || !cur || cur.isBot) return;
    this.gameStateService.throwTurn(s.id, cur.id, payload.total, payload.checkoutDarts);
  }
}
