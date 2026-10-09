import {
  Component,
  ElementRef,
  computed,
  effect,
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

@Component({
  selector: 'app-throw-input',
  standalone: true,
  imports: [FormsModule, SpotlightDirective],
  templateUrl: './throw-input.component.html',
  styleUrl: './throw-input.component.css',
})
export class ThrowInputComponent {
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
    const total = this.turnTotalSupported();
    return [
      { key: 'board' as const, label: 'Board', enabled: true, hint: 'Dartboard layout' },
      { key: 'numeric' as const, label: 'Numeric', enabled: true, hint: '20→1 + bull' },
      {
        key: 'total' as const,
        label: 'Total',
        enabled: total,
        hint: total ? 'One number per turn' : this.turnTotalDisabledReason(),
      },
    ];
  });

  readonly activeTabIndex = computed(() =>
    Math.max(0, this.modeTabs().findIndex((tab) => tab.key === this.inputMode())),
  );

  constructor() {
    effect(() => {
      // If turn-total becomes unsupported and we're on it, fall back to numeric.
      if (!this.turnTotalSupported() && this.inputMode() === 'total') {
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
    return 'board';
  }

  setInputMode(mode: ThrowInputMode): void {
    if (mode === 'total' && !this.turnTotalSupported()) return;
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
    this.selectedMultiplier.set(1);
  }

  submitMiss(): void {
    if (this.disabled()) return;
    this.throwSubmitted.emit({ segment: 0, multiplier: 1, score: 0, isValid: true });
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
    this.totalScore.set(null);
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
    this.totalScore.set(null);
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
