import { inject } from '@angular/core';
import { Router, Routes, type CanMatchFn } from '@angular/router';
import { findGame } from './core/game-catalog';

const knownGame: CanMatchFn = (_route, segments) =>
  findGame(segments[1]?.path) ? true : inject(Router).parseUrl('/');

export const routes: Routes = [
  {
    path: '',
    title: 'Oche',
    loadComponent: () => import('./features/home/home.component').then((m) => m.HomeComponent),
  },
  {
    path: 'play/:mode',
    canMatch: [knownGame],
    title: (route) => `${findGame(route.paramMap.get('mode'))?.title} · Oche`,
    loadComponent: () => import('./features/setup/setup.component').then((m) => m.SetupComponent),
  },
  {
    path: 'game/:id',
    loadComponent: () => import('./features/game/game.component').then((m) => m.GameComponent),
  },
  { path: '**', redirectTo: '' },
];
