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
import {
  threeDartAverage,
  x01MatchTotals,
  type CheckoutMode,
  type GameState,
  type Throw,
} from '@darts/shared';
import { GameStateService, type TurnSummary } from '../../core/game-state.service';
import { ScoreboardComponent } from './scoreboard/scoreboard.component';
import { ThrowInputComponent } from './throw-input/throw-input.component';
import { LegHistoryComponent } from './leg-history/leg-history.component';

const TURN_TOAST_MS = 2500;
const TURN_TOAST_EXIT_MS = 150;
const DARTS_PER_TURN = 3;
const BUST_HAPTIC = [20, 40, 20];
const LEG_WON_HAPTIC_MS = 30;

const CRICKET_SEGMENTS: readonly number[] = [20, 19, 18, 17, 16, 15, 25];

interface TurnSlot {
  label: string;
  thrown: boolean;
  valid: boolean;
}

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])';

@Component({
  selector: 'app-game',
  standalone: true,
  imports: [ScoreboardComponent, ThrowInputComponent, LegHistoryComponent],
  templateUrl: './game.component.html',
  styleUrl: './game.component.css',
  host: { '(document:keydown)': 'onDocumentKeydown($event)' },
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
  private turnToastExitTimer: ReturnType<typeof setTimeout> | undefined;
  private wakeLock: WakeLockSentinel | null = null;
  private focusBeforeDialog: HTMLElement | null = null;

  readonly state = this.gameStateService.state;
  readonly winner = this.gameStateService.winner;
  readonly error = this.gameStateService.error;
  readonly canUndo = this.gameStateService.canUndo;
  readonly legWon = this.gameStateService.legWon;

  readonly turnToast = signal<TurnSummary | null>(null);
  readonly turnToastLeaving = signal(false);
  readonly endMatchDialogOpen = signal(false);

  readonly turnToasts = computed(() => {
    const toast = this.turnToast();
    return toast ? [toast] : [];
  });

  readonly isMatchActive = computed(() => this.state()?.status === 'active');

  readonly matchNotFound = computed(() => !this.state() && this.error() !== null);

  readonly dialogOpen = computed(() => this.legWon() !== null || this.endMatchDialogOpen());

  readonly matchLength = computed(() => {
    const config = this.state()?.config;
    if (config?.mode !== 'x01') return null;
    return config.sets === 1 ? `First to ${config.legsPerSet}` : `First to ${config.sets} sets`;
  });

  readonly currentTurnSlots = computed<TurnSlot[]>(() => {
    const throws = this.state()?.currentThrows ?? [];
    return Array.from({ length: DARTS_PER_TURN }, (_, index) => turnSlot(throws[index]));
  });

  readonly currentTurnTotal = computed(() => {
    if (!this.turnTotalAvailableInMode()) return null;
    const throws = this.state()?.currentThrows ?? [];
    return throws.reduce((sum, t) => sum + (t.isValid ? t.score : 0), 0);
  });

  readonly currentTurnDescription = computed(() => {
    const darts = this.currentTurnSlots().map((slot) => (slot.thrown ? slot.label : 'not thrown'));
    const total = this.currentTurnTotal();
    const totalText = total === null ? '' : `. Total ${total}`;
    return `Darts this turn: ${darts.join(', ')}${totalText}`;
  });

  readonly legWonCheckout = computed(() => {
    const checkout = this.legWon()?.checkout;
    return checkout ? `Checked out on ${throwLabel(checkout)}` : null;
  });

  readonly legsScore = computed(() => {
    const s = this.state();
    if (!s || s.modeState.mode !== 'x01' || s.config.mode !== 'x01') return null;
    const ms = s.modeState;
    const legs = `Legs ${s.players.map((p) => ms.legs[p.id] ?? 0).join('–')}`;
    if (s.config.sets === 1) return legs;
    return `Sets ${s.players.map((p) => ms.sets[p.id] ?? 0).join('–')} · ${legs}`;
  });

  readonly legWonDetail = computed(() =>
    [this.legWonCheckout(), this.legsScore()].filter((part) => part !== null).join(' · '),
  );

  readonly winnerAverage = computed(() => {
    const s = this.state();
    const winner = this.winner();
    if (!s || !winner || s.modeState.mode !== 'x01') return null;
    const totals = x01MatchTotals(s.modeState, winner.id);
    return threeDartAverage(totals.scored, totals.darts)?.toFixed(2) ?? null;
  });

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
    effect(() => this.signalLegWon(this.legWon() !== null));
    effect(() => this.syncWakeLock(this.isMatchActive()));
    effect(() => this.focusDialog(this.legWonDialog()));
    effect(() => this.focusDialog(this.endMatchDialog()));
    this.watchVisibility();
    this.destroyRef.onDestroy(() => {
      clearTimeout(this.turnToastTimer);
      clearTimeout(this.turnToastExitTimer);
      this.releaseWakeLock();
    });
  }

  undo(): void {
    this.gameStateService.undo();
  }

  undoLastDart(): void {
    this.gameStateService.undo();
    this.restoreFocus();
  }

  onDocumentKeydown(event: KeyboardEvent): void {
    if (!isUndoShortcut(event) || event.repeat || event.defaultPrevented) return;
    if (this.dialogOpen() || isTypingTarget(event.target) || !this.canUndo()) return;
    event.preventDefault();
    this.undo();
  }

  rematch(): void {
    const s = this.state();
    if (!s) return;
    const id = this.gameStateService.createGame(s.config, s.players);
    void this.router.navigate(['/game', id]);
  }

  goHome(): void {
    void this.router.navigate(['/']);
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

  private showTurnToast(turn: TurnSummary | null): void {
    clearTimeout(this.turnToastTimer);
    clearTimeout(this.turnToastExitTimer);
    this.turnToastLeaving.set(false);
    if (!turn || untracked(this.legWon)) {
      this.turnToast.set(null);
      return;
    }
    if (turn.bust) this.vibrate(BUST_HAPTIC);
    this.turnToast.set(turn);
    this.turnToastTimer = setTimeout(() => this.hideTurnToast(), TURN_TOAST_MS);
  }

  private hideTurnToast(): void {
    this.turnToastLeaving.set(true);
    this.turnToastExitTimer = setTimeout(() => {
      this.turnToast.set(null);
      this.turnToastLeaving.set(false);
    }, TURN_TOAST_EXIT_MS);
  }

  private signalLegWon(won: boolean): void {
    if (won) this.vibrate(LEG_WON_HAPTIC_MS);
  }

  private vibrate(pattern: VibratePattern): void {
    try {
      this.document.defaultView?.navigator.vibrate?.(pattern);
    } catch {
      return;
    }
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

function turnSlot(t: Throw | undefined): TurnSlot {
  if (!t) return { label: '–', thrown: false, valid: true };
  return { label: throwLabel(t), thrown: true, valid: t.isValid };
}

function throwLabel(t: Throw): string {
  if (t.segment === 0) return 'Miss';
  if (t.segment === 25) return t.multiplier === 2 ? 'Bull' : '25';
  if (t.multiplier === 3) return `T${t.segment}`;
  if (t.multiplier === 2) return `D${t.segment}`;
  return String(t.segment);
}

function isUndoShortcut(event: KeyboardEvent): boolean {
  if (event.altKey || event.shiftKey) return false;
  const commandKey = event.ctrlKey || event.metaKey;
  if (event.key === 'Backspace') return !commandKey;
  return commandKey && event.key.toLowerCase() === 'z';
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
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
