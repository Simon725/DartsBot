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
        &minus;
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
        +
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
      height: 44px;
      border-radius: 999px;
      font-size: 1.3rem;
      font-weight: 500;
      color: var(--brass);
      transition: background 0.2s var(--ease-out), color 0.2s var(--ease-out),
        transform 0.2s var(--ease-thud);
    }

    .step:hover:not(:disabled) {
      background: rgba(200, 165, 87, 0.12);
      color: var(--cream);
    }

    .step:active:not(:disabled) {
      transform: scale(0.92);
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
