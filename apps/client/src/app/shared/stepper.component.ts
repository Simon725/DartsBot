import { Component, input, model } from '@angular/core';
import { RollingNumberComponent } from './rolling-number.component';

@Component({
  selector: 'app-stepper',
  imports: [RollingNumberComponent],
  template: `
    <div class="stepper" role="group" [attr.aria-label]="label()">
      <button
        type="button"
        class="step"
        [disabled]="value() <= min()"
        (click)="change(-1)"
        [attr.aria-label]="'Fewer ' + label()"
      >
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <path d="M6 12h12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
        </svg>
      </button>
      <output class="value" aria-live="polite">
        <app-rolling-number [value]="value()" />
      </output>
      <button
        type="button"
        class="step"
        [disabled]="value() >= max()"
        (click)="change(1)"
        [attr.aria-label]="'More ' + label()"
      >
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <path d="M6 12h12M12 6v12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
        </svg>
      </button>
    </div>
  `,
  styles: `
    :host {
      display: inline-block;
    }

    .stepper {
      display: inline-grid;
      grid-template-columns: 44px 3.2rem 44px;
      align-items: center;
      padding: 4px;
      background: rgba(14, 10, 10, 0.7);
      border: 1px solid var(--bg-line);
      border-radius: 999px;
    }

    .step {
      display: grid;
      place-items: center;
      height: 44px;
      border-radius: 999px;
      color: var(--brass);
      transition: background-color 0.2s var(--ease-out), color 0.2s var(--ease-out),
        transform 110ms cubic-bezier(0.23, 1, 0.32, 1);
    }

    @media (hover: hover) and (pointer: fine) {
      .step:hover:not(:disabled) {
        background: rgba(200, 165, 87, 0.12);
        color: var(--cream);
      }
    }

    .step:active:not(:disabled) {
      transform: scale(0.97);
    }

    @media (prefers-reduced-motion: reduce) {
      .step:active:not(:disabled) {
        transform: none;
      }
    }

    .step:disabled {
      color: var(--ink-faint);
      opacity: 0.45;
      cursor: not-allowed;
    }

    .value {
      text-align: center;
      font-family: var(--font-display);
      font-size: 1.6rem;
      line-height: 1;
      color: var(--cream);
      font-variant-numeric: tabular-nums;
    }
  `,
})
export class StepperComponent {
  readonly label = input.required<string>();
  readonly min = input(1);
  readonly max = input(9);
  readonly value = model.required<number>();

  change(delta: number): void {
    const next = this.value() + delta;
    if (next < this.min() || next > this.max()) return;
    this.value.set(next);
  }
}
