import { Directive, ElementRef, inject } from '@angular/core';

@Directive({
  selector: '[appSpotlight]',
  host: {
    class: 'spotlight',
    '(pointermove)': 'track($event)',
  },
})
export class SpotlightDirective {
  private readonly element = inject(ElementRef<HTMLElement>);

  track(event: PointerEvent): void {
    const host = this.element.nativeElement as HTMLElement;
    const rect = host.getBoundingClientRect();
    host.style.setProperty('--spot-x', `${event.clientX - rect.left}px`);
    host.style.setProperty('--spot-y', `${event.clientY - rect.top}px`);
  }
}
