import {
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SpotlightDirective } from '../../../shared/spotlight.directive';
import {
  IMPOSSIBLE_TURN_TOTALS,
  checkoutDartOptions,
  type CheckoutMode,
  type Throw,
} from '@darts/shared';

export type ThrowInputMode = 'board' | 'numeric' | 'total';

interface TurnTotalSubmit {
  kind: 'turn-total';
  total: number;
  checkoutDarts?: 1 | 2 | 3;
}

interface ThrowSubmit {
  kind: 'dart';
  throw: Throw;
}

export type ThrowInputEvent = ThrowSubmit | TurnTotalSubmit;

const STORAGE_KEY = 'oche:input-mode';
const DIGIT_COMMIT_DELAY_MS = 350;
const KEYBOARD_INPUT_HOLD_MS = 400;
const COMMIT_HAPTIC_MS = 8;
const MULTIPLIER_KEYS: Readonly<Record<string, 1 | 2 | 3>> = { s: 1, d: 2, t: 3 };

@Component({
  selector: 'app-throw-input',
  standalone: true,
  imports: [FormsModule, SpotlightDirective],
  templateUrl: './throw-input.component.html',
  styleUrl: './throw-input.component.css',
  host: { '(document:keydown)': 'onDocumentKeydown($event)' },
})
export class ThrowInputComponent {
  private static nextId = 0;
  readonly shortcutLegendId = `throw-input-shortcuts-${ThrowInputComponent.nextId++}`;

  readonly disabled = input(false);
  /** Whether the current game mode supports turn-total input (x01, 121). */
  readonly turnTotalSupported = input(true);
  /** Hint shown on the Total tab while turn-total input is unsupported. */
  readonly turnTotalDisabledReason = input('Unavailable in this mode');
  /** Out-mode of the running game; drives which dart counts can finish. */
  readonly outMode = input<CheckoutMode>('double');
  /** Current player's remaining score, or null in modes without one. */
  readonly remaining = input<number | null>(null);
  /** Darts left in the current 121 attempt; null outside the 121 drill. */
  readonly attemptDartsLeft = input<number | null>(null);
  readonly relevantSegments = input<readonly number[] | null>(null);
  readonly showTurnTotal = input(true);

  readonly throwSubmitted = output<Throw>();
  readonly turnSubmitted = output<{ total: number; checkoutDarts?: 1 | 2 | 3 }>();

  readonly inputMode = signal<ThrowInputMode>(this.loadStoredMode());
  readonly totalInputEl = viewChild<ElementRef<HTMLInputElement>>('totalInputEl');
  readonly checkoutDialogEl = viewChild<ElementRef<HTMLDialogElement>>('checkoutDialogEl');
  readonly checkoutCardEl = viewChild<ElementRef<HTMLElement>>('checkoutCardEl');

  // Board mode — dartboard clockwise order starting at 20.
  readonly boardSegments = [
    20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5,
  ];
  // Numeric mode — descending from 20 down to 1.
  readonly numericSegments = [
    20, 19, 18, 17, 16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1,
  ];
  readonly multipliers: Array<{ key: 1 | 2 | 3; label: string }> = [
    { key: 1, label: 'S' },
    { key: 2, label: 'D' },
    { key: 3, label: 'T' },
  ];

  readonly selectedMultiplier = signal<1 | 2 | 3>(1);
  readonly pendingDigits = signal('');
  private pendingDigitsTimer: ReturnType<typeof setTimeout> | null = null;
  readonly keyboardInput = signal(false);
  private keyboardInputTimer: ReturnType<typeof setTimeout> | null = null;
  private wasDisabled = false;
  readonly bullScore = computed(() => (this.selectedMultiplier() === 1 ? 25 : 50));

  // Total mode state.
  readonly totalScore = signal<number | null>(null);
  readonly checkoutPromptOpen = signal(false);

  /**
   * Frozen copy of the checkout being confirmed, taken when the prompt opens.
   * remaining() is recomputed from every server broadcast, so the live
   * computeds can shift under an open prompt (another client's throw, a leg
   * ending elsewhere). The prompt renders and validates against this
   * snapshot so what the player confirms is what they were shown.
   */
  readonly checkoutSnapshot = signal<{
    total: number;
    remaining: number;
    options: Array<1 | 2 | 3>;
  } | null>(null);

  /** True when the entered total would take the player to exactly zero. */
  readonly isCheckoutTotal = computed(
    () =>
      this.totalScore() !== null &&
      this.remaining() !== null &&
      this.totalScore() === this.remaining(),
  );

  /** Dart counts that can finish the remaining score under the out-mode. */
  private readonly rawCheckoutOptions = computed<Array<1 | 2 | 3>>(() =>
    this.isCheckoutTotal() ? checkoutDartOptions(this.remaining()!, this.outMode()) : [],
  );

  /** rawCheckoutOptions further constrained by the 121 attempt's darts left. */
  readonly checkoutOptions = computed<Array<1 | 2 | 3>>(() => {
    const left = this.attemptDartsLeft();
    const options = this.rawCheckoutOptions();
    return left === null ? options : options.filter((d) => d <= left);
  });

  readonly totalHint = computed(() => {
    const base =
      'Enter the sum of all three darts. Entering exactly your remaining score opens the checkout prompt.';
    switch (this.outMode()) {
      case 'straight':
        return base;
      case 'master':
        return `${base} Finishes must end on a double, treble, or bull.`;
      default:
        return `${base} Finishes must end on a double or bull.`;
    }
  });

  /** Non-null when the current entry cannot be submitted (shown as a warning). */
  readonly totalError = computed(() => {
    const total = this.totalScore();
    if (total === null) return null;
    if (!Number.isInteger(total)) return 'Whole numbers only.';
    if (total < 0 || total > 180) return 'A turn scores between 0 and 180.';
    if (this.isCheckoutTotal()) {
      if (this.rawCheckoutOptions().length === 0) {
        return `${this.remaining()} cannot be checked out: no finish from there`;
      }
      if (this.checkoutOptions().length === 0) {
        return 'not enough darts left in this attempt';
      }
    }
    if (IMPOSSIBLE_TURN_TOTALS.has(total)) return `${total} is not a possible 3-dart score.`;
    return null;
  });

  readonly totalSubmittable = computed(
    () => this.totalScore() !== null && this.totalError() === null,
  );

  readonly modeTabs = computed(() => {
    const padTabs = [
      { key: 'numeric' as const, label: 'Numeric', enabled: true, hint: '20→1 + bull' },
      { key: 'board' as const, label: 'Board', enabled: true, hint: 'Board order' },
    ];
    if (!this.showTurnTotal()) return padTabs;
    const total = this.turnTotalSupported();
    return [
      ...padTabs,
      {
        key: 'total' as const,
        label: 'Total',
        enabled: total,
        hint: total ? 'Per turn' : this.turnTotalDisabledReason(),
      },
    ];
  });

  private readonly relevantSegmentSet = computed(() => {
    const segments = this.relevantSegments();
    return segments === null ? null : new Set(segments);
  });

  readonly activeTabIndex = computed(() =>
    Math.max(0, this.modeTabs().findIndex((tab) => tab.key === this.inputMode())),
  );

  constructor() {
    effect(() => {
      // If turn-total becomes unsupported and we're on it, fall back to numeric.
      if (!this.isTurnTotalAllowed() && this.inputMode() === 'total') {
        this.inputMode.set('numeric');
      }
    });
    effect(() => {
      // Re-focus the total input every time it becomes the active tab AND
      // the player can throw (i.e. it's their turn). Reading both signals
      // here makes the effect re-fire whenever either flips, so the input
      // grabs focus when control returns to the human after a bot turn.
      const onTotalTab = this.inputMode() === 'total';
      const canThrow = !this.disabled();
      if (onTotalTab && canThrow) {
        this.focusTotalInput();
      }
    });
    effect(() => {
      // Open the checkout prompt as a top-layer modal. showModal() lets it
      // escape the transformed/stacked ancestors (fade-up keeps a computed
      // transform on .game, which would otherwise capture position: fixed).
      // setTimeout(0) ensures Angular has rendered the @if branch first —
      // same pattern as the total-input focus above.
      if (this.checkoutPromptOpen()) {
        setTimeout(() => {
          const dialog = this.checkoutDialogEl()?.nativeElement;
          if (dialog && !dialog.open) {
            dialog.showModal();
            this.checkoutCardEl()?.nativeElement.focus();
          }
        }, 0);
      }
    });
    effect(() => {
      // The prompt can outlive the player's turn (a leg ending via another
      // path, a rejected turn, control passing to a bot). Tear it down rather
      // than leaving a confirmable dialog for a turn that is no longer theirs.
      if (this.checkoutPromptOpen() && this.disabled()) {
        this.closeCheckoutDialog();
        this.checkoutSnapshot.set(null);
        this.checkoutPromptOpen.set(false);
      }
    });
    effect(() => {
      const disabled = this.disabled();
      if (this.wasDisabled && !disabled) this.resetTotal();
      if (disabled) this.clearPendingDigits();
      this.wasDisabled = disabled;
    });
    inject(DestroyRef).onDestroy(() => {
      this.clearPendingDigitsTimer();
      this.clearKeyboardInputTimer();
    });
  }

  isSegmentDimmed(segment: number): boolean {
    const relevant = this.relevantSegmentSet();
    return relevant !== null && !relevant.has(segment);
  }

  isSegmentHighlighted(segment: number): boolean {
    return this.relevantSegmentSet()?.has(segment) ?? false;
  }

  onDocumentKeydown(event: KeyboardEvent): void {
    if (!this.shouldHandleShortcut(event)) return;
    const key = event.key.toLowerCase();
    const handled =
      this.handleMultiplierKey(key) || this.handleDigitKey(key) || this.handleCommandKey(key);
    if (!handled) return;
    event.preventDefault();
    this.markKeyboardInput();
  }

  private markKeyboardInput(): void {
    this.keyboardInput.set(true);
    this.clearKeyboardInputTimer();
    this.keyboardInputTimer = setTimeout(() => {
      this.keyboardInputTimer = null;
      this.keyboardInput.set(false);
    }, KEYBOARD_INPUT_HOLD_MS);
  }

  private clearKeyboardInputTimer(): void {
    if (this.keyboardInputTimer === null) return;
    clearTimeout(this.keyboardInputTimer);
    this.keyboardInputTimer = null;
  }

  private vibrateOnCommit(): void {
    try {
      navigator.vibrate?.(COMMIT_HAPTIC_MS);
    } catch {
      /* unsupported or blocked */
    }
  }

  private isTurnTotalAllowed(): boolean {
    return this.showTurnTotal() && this.turnTotalSupported();
  }

  private shouldHandleShortcut(event: KeyboardEvent): boolean {
    if (this.disabled() || this.inputMode() === 'total') return false;
    if (event.ctrlKey || event.metaKey || event.altKey || event.repeat) return false;
    return !this.isTypingTarget(event.target);
  }

  private isTypingTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    if (target.isContentEditable) return true;
    return ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
  }

  private handleMultiplierKey(key: string): boolean {
    const multiplier = MULTIPLIER_KEYS[key];
    if (!multiplier) return false;
    this.selectMultiplier(multiplier);
    return true;
  }

  private handleCommandKey(key: string): boolean {
    switch (key) {
      case 'b':
        this.clearPendingDigits();
        this.submitSegment(25);
        return true;
      case 'm':
        this.clearPendingDigits();
        this.submitMiss();
        return true;
      case 'enter':
        if (!this.pendingDigits()) return false;
        this.commitPendingDigits();
        return true;
      case 'escape':
        if (!this.pendingDigits()) return false;
        this.clearPendingDigits();
        return true;
      default:
        return false;
    }
  }

  private handleDigitKey(key: string): boolean {
    if (!/^[0-9]$/.test(key)) return false;
    const pending = this.pendingDigits();
    if (pending) {
      this.completePendingDigits(pending, key);
    } else {
      this.startPendingDigits(key);
    }
    return true;
  }

  private startPendingDigits(digit: string): void {
    if (digit === '0') {
      this.submitMiss();
      return;
    }
    if (digit !== '1' && digit !== '2') {
      this.submitSegment(Number(digit));
      return;
    }
    this.pendingDigits.set(digit);
    this.clearPendingDigitsTimer();
    this.pendingDigitsTimer = setTimeout(() => this.commitPendingDigits(), DIGIT_COMMIT_DELAY_MS);
  }

  private completePendingDigits(pending: string, digit: string): void {
    const combined = Number(pending + digit);
    if (combined <= 20 || combined === 25) {
      this.clearPendingDigits();
      this.submitSegment(combined);
      return;
    }
    this.commitPendingDigits();
    this.startPendingDigits(digit);
  }

  private commitPendingDigits(): void {
    const pending = this.pendingDigits();
    this.clearPendingDigits();
    if (!pending) return;
    this.markKeyboardInput();
    this.submitSegment(Number(pending));
  }

  private clearPendingDigits(): void {
    this.clearPendingDigitsTimer();
    this.pendingDigits.set('');
  }

  private clearPendingDigitsTimer(): void {
    if (this.pendingDigitsTimer === null) return;
    clearTimeout(this.pendingDigitsTimer);
    this.pendingDigitsTimer = null;
  }

  private resetTotal(): void {
    this.totalScore.set(null);
    const totalInput = this.totalInputEl()?.nativeElement;
    if (totalInput) totalInput.value = '';
  }

  /**
   * Close the native <dialog> before the @if tears it down — removing an
   * element while still [open] can leave stale top-layer/inert state behind.
   */
  private closeCheckoutDialog(): void {
    const dialog = this.checkoutDialogEl()?.nativeElement;
    if (dialog?.open) dialog.close();
  }

  private focusTotalInput(): void {
    // setTimeout(0) ensures Angular has rendered the @if branch and
    // disabled state has propagated to the DOM before we focus.
    setTimeout(() => {
      const el = this.totalInputEl()?.nativeElement;
      if (el && !el.disabled) {
        el.focus();
        el.select?.();
      }
    }, 0);
  }

  private loadStoredMode(): ThrowInputMode {
    try {
      const v = localStorage.getItem(STORAGE_KEY);
      if (v === 'board' || v === 'numeric' || v === 'total') return v;
    } catch {
      /* ignore */
    }
    return 'numeric';
  }

  setInputMode(mode: ThrowInputMode): void {
    if (mode === 'total' && !this.isTurnTotalAllowed()) return;
    this.clearPendingDigits();
    this.inputMode.set(mode);
    // Persist only user-initiated choices — the automatic fallback (Total
    // becoming unsupported) must not overwrite the stored preference.
    try {
      localStorage.setItem(STORAGE_KEY, mode);
    } catch {
      /* ignore */
    }
  }

  selectMultiplier(m: 1 | 2 | 3): void {
    this.selectedMultiplier.set(m);
  }

  submitSegment(segment: number): void {
    if (this.disabled()) return;
    let multiplier: 1 | 2 | 3 = this.selectedMultiplier();
    if (segment === 25 && multiplier === 3) multiplier = 2;
    const t: Throw = {
      segment,
      multiplier,
      score: segment * multiplier,
      isValid: true,
    };
    this.throwSubmitted.emit(t);
    this.vibrateOnCommit();
    this.selectedMultiplier.set(1);
  }

  submitMiss(): void {
    if (this.disabled()) return;
    this.throwSubmitted.emit({ segment: 0, multiplier: 1, score: 0, isValid: true });
    this.vibrateOnCommit();
    this.selectedMultiplier.set(1);
  }

  submitTotal(): void {
    if (this.disabled() || !this.totalSubmittable()) return;
    if (this.isCheckoutTotal()) {
      // An exact-zero total is a declared checkout — ask how many darts.
      this.checkoutSnapshot.set({
        total: this.totalScore()!,
        remaining: this.remaining()!,
        options: this.checkoutOptions(),
      });
      this.checkoutPromptOpen.set(true);
      return;
    }
    this.turnSubmitted.emit({ total: this.totalScore()! });
    this.resetTotal();
  }

  confirmCheckout(darts: 1 | 2 | 3): void {
    if (this.disabled()) {
      this.cancelCheckout();
      return;
    }
    const snapshot = this.checkoutSnapshot();
    if (!this.checkoutPromptOpen() || snapshot === null || !snapshot.options.includes(darts)) return;
    this.closeCheckoutDialog();
    this.turnSubmitted.emit({ total: snapshot.total, checkoutDarts: darts });
    this.resetTotal();
    this.checkoutSnapshot.set(null);
    this.checkoutPromptOpen.set(false);
  }

  cancelCheckout(): void {
    // Keep the entered total so the player can correct it.
    this.closeCheckoutDialog();
    this.checkoutSnapshot.set(null);
    this.checkoutPromptOpen.set(false);
    this.focusTotalInput();
  }

  onCheckoutOverlayClick(event: MouseEvent): void {
    // Clicks on the dimmed backdrop (the <dialog> itself) cancel; clicks
    // inside the card land on its descendants and are ignored here.
    if (event.target === event.currentTarget) this.cancelCheckout();
  }
}
