import { Component, computed, effect, input, output, signal } from '@angular/core';
import {
  BULL_INNER_R,
  BULL_OUTER_R,
  DOUBLE_INNER_R,
  DOUBLE_OUTER_R,
  SEGMENT_ORDER,
  TRIPLE_INNER_R,
  TRIPLE_OUTER_R,
  botBullThrow,
  type Player,
} from '@darts/shared';

interface BoardPoint {
  x: number;
  y: number;
}

interface Standing {
  playerIndex: number;
  player: Player;
  color: string;
  point: BoardPoint | null;
  distance: number | null;
  throwLabel: string | null;
  isLeader: boolean;
}

type BullOffOutcome = { kind: 'winner'; playerIndex: number } | { kind: 'tie'; playerIndices: number[] };

const BOT_THROW_DELAY_MS = 1100;
const NUMBER_RING_R = 192;
const PLAYER_COLORS = ['#f1e8d3', '#6fb7ff', '#ffb347', '#c39bff', '#7ee0b0', '#ff7aa8', '#ffe066', '#9ad1d4'];

function pointOnBoard(radius: number, degreesFromTop: number): BoardPoint {
  const radians = (degreesFromTop * Math.PI) / 180;
  return { x: radius * Math.sin(radians), y: -radius * Math.cos(radians) };
}

function wedgePath(innerR: number, outerR: number, fromDeg: number, toDeg: number): string {
  const outerStart = pointOnBoard(outerR, fromDeg);
  const outerEnd = pointOnBoard(outerR, toDeg);
  const innerEnd = pointOnBoard(innerR, toDeg);
  const innerStart = pointOnBoard(innerR, fromDeg);
  return [
    `M ${outerStart.x} ${outerStart.y}`,
    `A ${outerR} ${outerR} 0 0 1 ${outerEnd.x} ${outerEnd.y}`,
    `L ${innerEnd.x} ${innerEnd.y}`,
    `A ${innerR} ${innerR} 0 0 0 ${innerStart.x} ${innerStart.y}`,
    'Z',
  ].join(' ');
}

function bullRing(distance: number): 'inner' | 'outer' | null {
  if (distance <= BULL_INNER_R) return 'inner';
  if (distance <= BULL_OUTER_R) return 'outer';
  return null;
}

function segmentAt(point: BoardPoint): number {
  const degreesFromTop = (Math.atan2(point.x, -point.y) * 180) / Math.PI;
  const index = Math.floor((degreesFromTop + 360 + 9) / 18) % SEGMENT_ORDER.length;
  return SEGMENT_ORDER[index]!;
}

function ringName(distance: number): string {
  if (distance >= DOUBLE_INNER_R) return 'Double';
  if (distance >= TRIPLE_INNER_R && distance <= TRIPLE_OUTER_R) return 'Treble';
  return 'Single';
}

function describeThrow(point: BoardPoint): string {
  const distance = Math.hypot(point.x, point.y);
  const millimetres = `${distance.toFixed(1)} mm`;
  if (distance <= BULL_INNER_R) return `Bullseye · ${millimetres}`;
  if (distance <= BULL_OUTER_R) return `Outer bull · ${millimetres}`;
  if (distance > DOUBLE_OUTER_R) return 'Off the board';
  return `${ringName(distance)} ${segmentAt(point)} · ${millimetres}`;
}

function isTie(a: number, b: number): boolean {
  return a === b || (bullRing(a) !== null && bullRing(a) === bullRing(b));
}

const BOARD_SEGMENTS = SEGMENT_ORDER.map((number, index) => {
  const from = index * 18 - 9;
  const to = index * 18 + 9;
  const isDark = index % 2 === 0;
  return {
    number,
    isDark,
    innerSingle: wedgePath(BULL_OUTER_R, TRIPLE_INNER_R, from, to),
    treble: wedgePath(TRIPLE_INNER_R, TRIPLE_OUTER_R, from, to),
    outerSingle: wedgePath(TRIPLE_OUTER_R, DOUBLE_INNER_R, from, to),
    double: wedgePath(DOUBLE_INNER_R, DOUBLE_OUTER_R, from, to),
    label: pointOnBoard(NUMBER_RING_R, index * 18),
  };
});

@Component({
  selector: 'app-bull-off',
  templateUrl: './bull-off.component.html',
  styleUrl: './bull-off.component.css',
})
export class BullOffComponent {
  readonly players = input.required<Player[]>();
  readonly decided = output<number>();
  readonly cancelled = output<void>();

  readonly segments = BOARD_SEGMENTS;
  readonly BULL_INNER_R = BULL_INNER_R;
  readonly BULL_OUTER_R = BULL_OUTER_R;
  readonly DOUBLE_OUTER_R = DOUBLE_OUTER_R;

  readonly round = signal(1);
  private readonly contenders = signal<number[] | null>(null);
  private readonly throws = signal<Record<number, BoardPoint>>({});
  readonly pending = signal<BoardPoint | null>(null);
  private aiming = false;

  readonly activeContenders = computed(() => this.contenders() ?? this.players().map((_, index) => index));

  readonly turnIndex = computed(() => {
    const thrown = this.throws();
    return this.activeContenders().find((index) => !(index in thrown)) ?? null;
  });

  readonly currentPlayer = computed(() => {
    const index = this.turnIndex();
    return index === null ? null : this.players()[index]!;
  });

  readonly isHumanTurn = computed(() => this.currentPlayer()?.isBot === false);

  readonly outcome = computed<BullOffOutcome | null>(() => {
    if (this.turnIndex() !== null) return null;
    const ranked = this.rankedDistances();
    const best = ranked[0]!;
    const tied = ranked.filter((entry) => isTie(entry.distance, best.distance));
    if (tied.length > 1) return { kind: 'tie', playerIndices: tied.map((entry) => entry.playerIndex) };
    return { kind: 'winner', playerIndex: best.playerIndex };
  });

  readonly winner = computed(() => {
    const outcome = this.outcome();
    return outcome?.kind === 'winner' ? this.players()[outcome.playerIndex]! : null;
  });

  readonly tiedNames = computed(() => {
    const outcome = this.outcome();
    if (outcome?.kind !== 'tie') return '';
    return outcome.playerIndices.map((index) => this.players()[index]!.name).join(' & ');
  });

  readonly standings = computed<Standing[]>(() => {
    const thrown = this.throws();
    const leaderDistance = this.rankedDistances()[0]?.distance ?? null;
    return this.activeContenders().map((playerIndex) => {
      const point = thrown[playerIndex] ?? null;
      const distance = point ? Math.hypot(point.x, point.y) : null;
      return {
        playerIndex,
        player: this.players()[playerIndex]!,
        color: this.colorFor(playerIndex),
        point,
        distance,
        throwLabel: point ? describeThrow(point) : null,
        isLeader: distance !== null && leaderDistance !== null && isTie(distance, leaderDistance),
      };
    });
  });

  readonly pendingColor = computed(() => {
    const index = this.turnIndex();
    return index === null ? PLAYER_COLORS[0]! : this.colorFor(index);
  });

  constructor() {
    effect((onCleanup) => {
      const index = this.turnIndex();
      const player = this.currentPlayer();
      if (index === null || !player?.isBot) return;
      const timer = setTimeout(() => this.recordThrow(index, botBullThrow(player)), BOT_THROW_DELAY_MS);
      onCleanup(() => clearTimeout(timer));
    });
  }

  colorFor(playerIndex: number): string {
    return PLAYER_COLORS[playerIndex % PLAYER_COLORS.length]!;
  }

  startAiming(event: PointerEvent): void {
    if (!this.isHumanTurn()) return;
    this.aiming = true;
    (event.currentTarget as Element).setPointerCapture(event.pointerId);
    this.aimAt(event);
  }

  moveAim(event: PointerEvent): void {
    if (this.aiming) this.aimAt(event);
  }

  stopAiming(): void {
    this.aiming = false;
  }

  confirmThrow(): void {
    const index = this.turnIndex();
    const point = this.pending();
    if (index === null || !point || !this.isHumanTurn()) return;
    this.recordThrow(index, point);
  }

  rethrow(): void {
    const outcome = this.outcome();
    if (outcome?.kind !== 'tie') return;
    this.contenders.set(outcome.playerIndices);
    this.throws.set({});
    this.round.update((round) => round + 1);
  }

  startMatch(): void {
    const outcome = this.outcome();
    if (outcome?.kind === 'winner') this.decided.emit(outcome.playerIndex);
  }

  skip(): void {
    this.decided.emit(0);
  }

  private aimAt(event: PointerEvent): void {
    const svg = (event.currentTarget as SVGGraphicsElement).ownerSVGElement ?? (event.currentTarget as SVGSVGElement);
    const matrix = svg.getScreenCTM();
    if (!matrix) return;
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
    this.pending.set({ x: point.x, y: point.y });
  }

  private recordThrow(playerIndex: number, point: BoardPoint): void {
    this.throws.update((thrown) => ({ ...thrown, [playerIndex]: point }));
    this.pending.set(null);
  }

  private rankedDistances(): { playerIndex: number; distance: number }[] {
    const thrown = this.throws();
    return Object.entries(thrown)
      .map(([index, point]) => ({ playerIndex: Number(index), distance: Math.hypot(point.x, point.y) }))
      .sort((a, b) => a.distance - b.distance);
  }
}
