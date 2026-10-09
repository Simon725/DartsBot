import { Component, computed, input } from '@angular/core';

interface RollingChar {
  key: string;
  digit: number | null;
  text: string;
}

const DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

@Component({
  selector: 'app-rolling-number',
  template: `
    <span class="visually-hidden">{{ value() }}</span>
    <span class="chars" aria-hidden="true">
      @for (char of chars(); track char.key) {
        @if (char.digit === null) {
          <span class="static">{{ char.text }}</span>
        } @else {
          <span class="slot">
            <span class="reel" [style.transform]="'translateY(' + char.digit * -10 + '%)'">
              @for (d of digits; track d) {
                <span>{{ d }}</span>
              }
            </span>
          </span>
        }
      }
    </span>
  `,
  styles: `
    :host {
      display: inline-block;
      font-variant-numeric: tabular-nums;
    }

    .chars {
      display: inline-flex;
    }

    .slot {
      display: inline-block;
      height: 1em;
      line-height: 1;
      clip-path: inset(0 -1em);
    }

    .reel {
      display: flex;
      flex-direction: column;
      transition: transform 0.6s var(--ease-out);
    }

    .reel > span,
    .static {
      display: block;
      height: 1em;
      line-height: 1;
    }

    .visually-hidden {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip: rect(0 0 0 0);
      white-space: nowrap;
    }
  `,
})
export class RollingNumberComponent {
  readonly value = input.required<string | number>();

  readonly digits = DIGITS;

  readonly chars = computed<RollingChar[]>(() => {
    const text = String(this.value());
    const length = text.length;
    return [...text].map((ch, i) => {
      const positionFromRight = length - 1 - i;
      const digit = /\d/.test(ch) ? Number(ch) : null;
      return { key: `${positionFromRight}`, digit, text: ch };
    });
  });
}
