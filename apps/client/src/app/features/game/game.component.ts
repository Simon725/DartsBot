import {
  Component,
  DestroyRef,
  ElementRef,
  OnInit,
  computed,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import type { CheckoutMode, GameState, Throw } from '@darts/shared';
import { GameStateService, type TurnSummary } from '../../core/game-state.service';
import { ScoreboardComponent } from './scoreboard/scoreboard.component';
import { ThrowInputComponent } from './throw-input/throw-input.component';
import { LegHistoryComponent } from './leg-history/leg-history.component';

const TURN_TOAST_MS = 2500;

const CRICKET_SEGMENTS: readonly number[] = [20, 19, 18, 17, 16, 15, 25];

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])';

@Component({
  selector: 'app-game',
  standalone: true,
  imports: [ScoreboardComponent, ThrowInputComponent, LegHistoryComponent],
  templateUrl: './game.component.html',
  styleUrl: './game.component.css',
})
export class GameComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly document = inject(DOCUMENT);
  private readonly destroyRef = inject(DestroyRef);
  private readonly gameStateService = inject(GameStateService);

  private readonly legWonDialog = viewChild<ElementRef<HTMLElement>>('legWonDialog');
  private readonly endMatchDialog = viewChild<ElementRef<HTMLElement>>('endMatchDialog');

  private turnToastTimer: ReturnType<typeof setTimeout> | undefined;
  private wakeLock: WakeLockSentinel | null = null;
  private focusBeforeDialog: HTMLElement | null = null;

  readonly state = this.gameStateService.state;
  readonly winner = this.gameStateService.winner;
  readonly error = this.gameStateService.error;
  readonly canUndo = this.gameStateService.canUndo;
  readonly legWon = this.gameStateService.legWon;

  readonly turnToast = signal<TurnSummary | null>(null);
  readonly endMatchDialogOpen = signal(false);

  readonly isMatchActive = computed(() => this.state()?.status === 'active');

  readonly legWonAverage = computed(() => {
    const average = this.legWon()?.average;
    return average === null || average === undefined ? '-' : average.toFixed(2);
  });

  readonly gameId = computed(() => this.state()?.id ?? null);

  readonly currentPlayer = computed(() => {
    const s = this.state();
    return s ? (s.players[s.currentPlayerIndex] ?? null) : null;
  });

  readonly showLegHistory = computed(() => {
    const ms = this.state()?.modeState;
    return ms?.mode === 'x01' && ms.completedLegs.length > 0;
  });

  readonly relevantSegments = computed<readonly number[] | null>(() => {
    const s = this.state();
    return s ? relevantSegmentsFor(s) : null;
  });

  readonly turnTotalAvailableInMode = computed(() => {
    const mode = this.state()?.config.mode;
    return mode === 'x01' || mode === '121';
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
        return `${matchFormat(c.sets, c.legsPerSet)} · ${c.inMode} in · ${c.outMode} out`;
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

  constructor() {
    effect(() => this.showTurnToast(this.gameStateService.lastTurn()));
    effect(() => this.syncWakeLock(this.isMatchActive()));
    effect(() => this.focusDialog(this.legWonDialog()));
    effect(() => this.focusDialog(this.endMatchDialog()));
    this.watchVisibility();
    this.destroyRef.onDestroy(() => {
      clearTimeout(this.turnToastTimer);
      this.releaseWakeLock();
    });
  }

  undo(): void {
    this.gameStateService.undo();
  }

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

  nextLeg(): void {
    this.gameStateService.dismissLegWon();
    this.restoreFocus();
  }

  onLegWonKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Escape') {
      trapFocus(event);
      return;
    }
    event.preventDefault();
    this.nextLeg();
  }

  requestExit(): void {
    if (!this.isMatchActive()) {
      this.goHome();
      return;
    }
    this.endMatchDialogOpen.set(true);
  }

  cancelExit(): void {
    this.endMatchDialogOpen.set(false);
    this.restoreFocus();
  }

  keepForLater(): void {
    this.endMatchDialogOpen.set(false);
    this.goHome();
  }

  endMatch(): void {
    this.endMatchDialogOpen.set(false);
    this.gameStateService.abandonGame();
    this.goHome();
  }

  onEndMatchKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Escape') {
      trapFocus(event);
      return;
    }
    event.preventDefault();
    this.cancelExit();
  }

  private goHome(): void {
    void this.router.navigate(['/']);
  }

  private showTurnToast(turn: TurnSummary | null): void {
    clearTimeout(this.turnToastTimer);
    if (!turn || untracked(this.legWon)) {
      this.turnToast.set(null);
      return;
    }
    this.turnToast.set(turn);
    this.turnToastTimer = setTimeout(() => this.turnToast.set(null), TURN_TOAST_MS);
  }

  private focusDialog(dialog: ElementRef<HTMLElement> | undefined): void {
    if (!dialog) return;
    const active = this.document.activeElement;
    if (active instanceof HTMLElement && !dialog.nativeElement.contains(active)) {
      this.focusBeforeDialog = active;
    }
    focusableIn(dialog.nativeElement)[0]?.focus();
  }

  private restoreFocus(): void {
    const target = this.focusBeforeDialog;
    this.focusBeforeDialog = null;
    if (target?.isConnected) target.focus();
  }

  private watchVisibility(): void {
    const onVisibilityChange = () => {
      if (this.document.visibilityState !== 'visible') return;
      this.syncWakeLock(this.isMatchActive());
    };
    this.document.addEventListener('visibilitychange', onVisibilityChange);
    this.destroyRef.onDestroy(() =>
      this.document.removeEventListener('visibilitychange', onVisibilityChange),
    );
  }

  private syncWakeLock(active: boolean): void {
    if (!active) {
      this.releaseWakeLock();
      return;
    }
    void this.acquireWakeLock();
  }

  private async acquireWakeLock(): Promise<void> {
    const wakeLockApi = this.document.defaultView?.navigator.wakeLock;
    if (!wakeLockApi || (this.wakeLock && !this.wakeLock.released)) return;
    try {
      this.wakeLock = await wakeLockApi.request('screen');
    } catch {
      this.wakeLock = null;
    }
  }

  private releaseWakeLock(): void {
    const sentinel = this.wakeLock;
    this.wakeLock = null;
    sentinel?.release().catch(() => undefined);
  }
}

function relevantSegmentsFor(state: GameState): readonly number[] | null {
  const ms = state.modeState;
  switch (ms.mode) {
    case 'cricket':
      return CRICKET_SEGMENTS;
    case 'around-the-clock':
      return currentTarget(state, ms.target);
    case 'shanghai':
      return [ms.round];
    default:
      return null;
  }
}

function currentTarget(state: GameState, targets: Record<string, number>): readonly number[] | null {
  const current = state.players[state.currentPlayerIndex];
  const target = current ? targets[current.id] : undefined;
  return target === undefined ? null : [target];
}

function matchFormat(sets: number, legsPerSet: number): string {
  const legs = `${legsPerSet} ${legsPerSet === 1 ? 'leg' : 'legs'}`;
  if (sets === 1) return `First to ${legs}`;
  return `First to ${sets} sets · ${legs} per set`;
}

function focusableIn(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
}

function trapFocus(event: KeyboardEvent): void {
  if (event.key !== 'Tab') return;
  const container = event.currentTarget as HTMLElement;
  const focusable = focusableIn(container);
  const first = focusable[0];
  const last = focusable.at(-1);
  if (!first || !last) return;
  const active = container.ownerDocument.activeElement;
  if (event.shiftKey && active === first) {
    event.preventDefault();
    last.focus();
    return;
  }
  if (!event.shiftKey && active === last) {
    event.preventDefault();
    first.focus();
  }
}
