import { Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';

function isGameUrl(url: string): boolean {
  return url.startsWith('/game/');
}

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink],
  templateUrl: './app.html',
  styleUrl: './app.css',
  host: { '[class.on-game-route]': 'isGameRoute()' },
})
export class App {
  private readonly router = inject(Router);

  readonly isGameRoute = toSignal(
    this.router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      map((event) => isGameUrl(event.urlAfterRedirects)),
    ),
    { initialValue: isGameUrl(this.router.url) },
  );
}
