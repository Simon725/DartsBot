import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { GAME_CATALOG } from '../../core/game-catalog';
import { SpotlightDirective } from '../../shared/spotlight.directive';

const BOARD_ORDER = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];

interface BoardSegment {
  number: number;
  path: string;
}

interface CricketTarget {
  label: string;
  marks: 0 | 1 | 2 | 3;
}

function polar(radius: number, degrees: number): string {
  const radians = ((degrees - 90) * Math.PI) / 180;
  return `${(50 + radius * Math.cos(radians)).toFixed(2)} ${(50 + radius * Math.sin(radians)).toFixed(2)}`;
}

function segmentPath(index: number): string {
  const start = index * 18 - 8;
  const end = index * 18 + 8;
  const outer = 46;
  const inner = 34;
  return [
    `M ${polar(outer, start)}`,
    `A ${outer} ${outer} 0 0 1 ${polar(outer, end)}`,
    `L ${polar(inner, end)}`,
    `A ${inner} ${inner} 0 0 0 ${polar(inner, start)}`,
    'Z',
  ].join(' ');
}

@Component({
  selector: 'app-home',
  imports: [RouterLink, SpotlightDirective],
  templateUrl: './home.component.html',
  styleUrl: './home.component.css',
})
export class HomeComponent {
  readonly games = GAME_CATALOG;

  readonly x01Leg = [
    { remaining: 501, thrown: '' },
    { remaining: 401, thrown: '100' },
    { remaining: 261, thrown: '140' },
    { remaining: 81, thrown: '180' },
    { remaining: 0, thrown: 'T15 D18' },
  ];

  readonly boardSegments: BoardSegment[] = BOARD_ORDER.map((number, index) => ({
    number,
    path: segmentPath(index),
  }));

  readonly cricketTargets: CricketTarget[] = [
    { label: '20', marks: 3 },
    { label: '19', marks: 3 },
    { label: '18', marks: 2 },
    { label: '17', marks: 1 },
    { label: '16', marks: 3 },
    { label: '15', marks: 0 },
    { label: 'B', marks: 2 },
  ];

  readonly killerLives = [
    { number: 7, lives: [true, true, true] },
    { number: 14, lives: [true, true, false] },
    { number: 3, lives: [true, false, false] },
  ];

  readonly shanghaiRounds = [1, 2, 3, 4, 5, 6, 7];
  readonly shanghaiHits: Record<number, readonly boolean[]> = {
    1: [true, false, false],
    2: [true, true, false],
    3: [false, false, true],
    4: [true, false, false],
    5: [true, true, true],
    6: [false, true, false],
    7: [false, false, false],
  };

  readonly checkoutDarts = [1, 2, 3, 4, 5, 6, 7, 8, 9];
}
