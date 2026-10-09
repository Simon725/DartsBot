import { Component, computed, input, model } from '@angular/core';

export interface SegmentOption<T> {
  value: T;
  label: string;
}

@Component({
  selector: 'app-segmented-control',
  template: `
    <div
      class="track"
      role="radiogroup"
      [attr.aria-label]="label()"
      [style.--count]="options().length"
      [style.--index]="selectedIndex()"
    >
      <span class="indicator" [class.hidden]="selectedIndex() < 0" aria-hidden="true"></span>
      @for (option of options(); track option.label) {
        <button
          type="button"
          role="radio"
          class="segment"
          [class.active]="option.value === value()"
          [attr.aria-checked]="option.value === value()"
          (click)="value.set(option.value)"
        >
          {{ option.label }}
        </button>
      }
    </div>
  `,
  styles: `
    :host {
      display: block;
    }

    .track {
      position: relative;
      display: grid;
      grid-template-columns: repeat(var(--count), minmax(0, 1fr));
      padding: 4px;
      background: rgba(14, 10, 10, 0.7);
      border: 1px solid var(--bg-line);
      border-radius: 999px;
      isolation: isolate;
    }

    .indicator {
      position: absolute;
      inset: 4px auto 4px 4px;
      width: calc((100% - 8px) / var(--count));
      border-radius: 999px;
      background: linear-gradient(180deg, #a3202a, var(--oxblood));
      box-shadow: 0 0 0 1px var(--match-red), 0 6px 18px -6px var(--match-red-glow),
        inset 0 1px 0 rgba(255, 255, 255, 0.16);
      transform: translateX(calc(var(--index) * 100%));
      transition: transform 0.35s var(--ease-thud);
      z-index: -1;
    }

    .indicator.hidden {
      opacity: 0;
    }

    .segment {
      min-height: 44px;
      padding: 0 0.6rem;
      border-radius: 999px;
      font-size: 0.9rem;
      font-weight: 600;
      color: var(--ink-mute);
      white-space: nowrap;
      transition: color 0.2s var(--ease-out);
    }

    .segment:hover {
      color: var(--cream);
    }

    .segment.active {
      color: var(--cream);
    }
  `,
})
export class SegmentedControlComponent<T> {
  readonly options = input.required<readonly SegmentOption<T>[]>();
  readonly label = input.required<string>();
  readonly value = model.required<T>();

  readonly selectedIndex = computed(() =>
    this.options().findIndex((option) => option.value === this.value()),
  );
}
