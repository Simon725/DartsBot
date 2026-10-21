import { Component, DestroyRef, computed, effect, inject, input, output, signal } from '@angular/core';
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

interface BoardView {
  x: number;
  y: number;
  size: number;
}

interface ClientPoint {
  x: number;
  y: number;
}

interface PinchStart {
  anchor: BoardPoint;
  distance: number;
  size: number;
}

type BullOffOutcome = { kind: 'winner'; playerIndex: number } | { kind: 'tie'; playerIndices: number[] };

const BOT_THROW_DELAY_MS = 1100;
const NUMBER_RING_R = 192;
const FULL_VIEW: BoardView = { x: -215, y: -215, size: 430 };
const MAX_ZOOM = 8;
const ZOOM_STEP = 2;
const ZOOM_ANIMATION_MS = 260;
const WHEEL_ZOOM_SPEED = 0.002;
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

function clampView(view: BoardView): BoardView {
  const size = Math.min(FULL_VIEW.size, Math.max(FULL_VIEW.size / MAX_ZOOM, view.size));
  const maxOffset = FULL_VIEW.x + FULL_VIEW.size - size;
  return {
    size,
    x: Math.min(maxOffset, Math.max(FULL_VIEW.x, view.x)),
    y: Math.min(maxOffset, Math.max(FULL_VIEW.y, view.y)),
  };
}

function viewAround(center: BoardPoint, size: number): BoardView {
  return clampView({ x: center.x - size / 2, y: center.y - size / 2, size });
}

function easeOutQuart(progress: number): number {
  return 1 - (1 - progress) ** 4;
}

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function midpoint(a: ClientPoint, b: ClientPoint): ClientPoint {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function distanceBetween(a: ClientPoint, b: ClientPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
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
  private pendingBeforeAim: BoardPoint | null = null;
  private readonly activePointers = new Map<number, ClientPoint>();
  private pinch: PinchStart | null = null;
  private zoomFrame: number | undefined;

  readonly view = signal<BoardView>(FULL_VIEW);
  readonly viewBox = computed(() => {
    const { x, y, size } = this.view();
    return `${x} ${y} ${size} ${size}`;
  });
  readonly markerScale = computed(() => this.view().size / FULL_VIEW.size);
  readonly isZoomed = computed(() => this.view().size < FULL_VIEW.size - 0.01);
  readonly canZoomIn = computed(() => this.view().size > FULL_VIEW.size / MAX_ZOOM + 0.01);

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
    inject(DestroyRef).onDestroy(() => this.stopZoomAnimation());
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

  markerTransform(point: BoardPoint): string {
    return `translate(${point.x} ${point.y}) scale(${this.markerScale()})`;
  }

  onPointerDown(event: PointerEvent): void {
    this.stopZoomAnimation();
    (event.currentTarget as Element).setPointerCapture(event.pointerId);
    this.activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (this.activePointers.size === 2) {
      this.startPinch(event);
      return;
    }
    if (this.activePointers.size > 1 || !this.isHumanTurn()) return;
    this.aiming = true;
    this.pendingBeforeAim = this.pending();
    this.aimAt(event);
  }

  onPointerMove(event: PointerEvent): void {
    if (!this.activePointers.has(event.pointerId)) return;
    this.activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (this.pinch) {
      this.updatePinch(event);
      return;
    }
    if (this.aiming) this.aimAt(event);
  }

  onPointerUp(event: PointerEvent): void {
    this.activePointers.delete(event.pointerId);
    if (this.activePointers.size < 2) this.pinch = null;
    if (this.activePointers.size === 0) this.aiming = false;
  }

  onWheel(event: WheelEvent): void {
    const zoomingOut = event.deltaY > 0;
    if (zoomingOut && !this.isZoomed()) return;
    event.preventDefault();
    this.stopZoomAnimation();
    const lineHeight = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 16 : 1;
    const factor = Math.exp(event.deltaY * lineHeight * WHEEL_ZOOM_SPEED);
    const svg = event.currentTarget as SVGSVGElement;
    this.zoomAround(svg, { x: event.clientX, y: event.clientY }, this.view().size * factor);
  }

  zoomIn(): void {
    this.animateViewTo(viewAround(this.zoomFocus(), this.view().size / ZOOM_STEP));
  }

  zoomOut(): void {
    this.animateViewTo(viewAround(this.zoomFocus(), this.view().size * ZOOM_STEP));
  }

  resetZoom(): void {
    this.animateViewTo(FULL_VIEW);
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
    const point = this.toBoardPoint(event.currentTarget as SVGSVGElement, { x: event.clientX, y: event.clientY });
    if (point) this.pending.set(point);
  }

  private startPinch(event: PointerEvent): void {
    if (this.aiming) {
      this.aiming = false;
      this.pending.set(this.pendingBeforeAim);
    }
    const [first, second] = [...this.activePointers.values()] as [ClientPoint, ClientPoint];
    const anchor = this.toBoardPoint(event.currentTarget as SVGSVGElement, midpoint(first, second));
    if (!anchor) return;
    this.pinch = { anchor, distance: distanceBetween(first, second), size: this.view().size };
  }

  private updatePinch(event: PointerEvent): void {
    const pinch = this.pinch!;
    const [first, second] = [...this.activePointers.values()] as [ClientPoint, ClientPoint];
    const size = (pinch.size * pinch.distance) / Math.max(1, distanceBetween(first, second));
    this.placeAnchor(event.currentTarget as SVGSVGElement, pinch.anchor, midpoint(first, second), size);
  }

  private zoomAround(svg: SVGSVGElement, client: ClientPoint, size: number): void {
    const anchor = this.toBoardPoint(svg, client);
    if (anchor) this.placeAnchor(svg, anchor, client, size);
  }

  private placeAnchor(svg: SVGSVGElement, anchor: BoardPoint, client: ClientPoint, size: number): void {
    const rect = svg.getBoundingClientRect();
    const clampedSize = clampView({ ...this.view(), size }).size;
    const fractionX = (client.x - rect.left) / rect.width;
    const fractionY = (client.y - rect.top) / rect.height;
    this.view.set(
      clampView({ x: anchor.x - fractionX * clampedSize, y: anchor.y - fractionY * clampedSize, size: clampedSize }),
    );
  }

  private toBoardPoint(svg: SVGSVGElement, client: ClientPoint): BoardPoint | null {
    const matrix = svg.getScreenCTM();
    if (!matrix) return null;
    const point = new DOMPoint(client.x, client.y).matrixTransform(matrix.inverse());
    return { x: point.x, y: point.y };
  }

  private zoomFocus(): BoardPoint {
    const pending = this.pending();
    if (pending) return pending;
    if (!this.isZoomed()) return { x: 0, y: 0 };
    const { x, y, size } = this.view();
    return { x: x + size / 2, y: y + size / 2 };
  }

  private animateViewTo(target: BoardView): void {
    this.stopZoomAnimation();
    if (prefersReducedMotion()) {
      this.view.set(target);
      return;
    }
    const start = this.view();
    const startedAt = performance.now();
    const step = (now: number) => {
      const progress = easeOutQuart(Math.min(1, (now - startedAt) / ZOOM_ANIMATION_MS));
      this.view.set({
        x: start.x + (target.x - start.x) * progress,
        y: start.y + (target.y - start.y) * progress,
        size: start.size + (target.size - start.size) * progress,
      });
      this.zoomFrame = progress < 1 ? requestAnimationFrame(step) : undefined;
    };
    this.zoomFrame = requestAnimationFrame(step);
  }

  private stopZoomAnimation(): void {
    if (this.zoomFrame !== undefined) cancelAnimationFrame(this.zoomFrame);
    this.zoomFrame = undefined;
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
