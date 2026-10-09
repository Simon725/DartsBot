// Standard dartboard dimensions in millimeters.
// https://www.darts1.com/regelnen.asp — radii of rings from board center.
export const BULL_INNER_R = 6.35;   // 50 (double bull)
export const BULL_OUTER_R = 15.9;   // 25 (single bull)
export const TRIPLE_INNER_R = 99;
export const TRIPLE_OUTER_R = 107;
export const DOUBLE_INNER_R = 162;
export const DOUBLE_OUTER_R = 170;

// Segments in clockwise order starting from segment 20 at the top (angle = 90deg).
// Each segment subtends 18 degrees.
export const SEGMENT_ORDER = [
  20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5,
] as const;

export interface LandedDart {
  segment: number; // 1-20 or 25
  multiplier: 1 | 2 | 3;
}

const TAU = Math.PI * 2;

function segmentForAngle(angleRad: number): number {
  // Normalize so 0 is at the top (segment 20), increasing clockwise.
  // Math angle: 0 = +x axis, increases counter-clockwise.
  // Convert: clockwise angle from top = (PI/2 - angleRad) mod TAU.
  let a = Math.PI / 2 - angleRad;
  a = ((a % TAU) + TAU) % TAU;
  const segmentIndex = Math.floor((a + Math.PI / 20) / (TAU / 20)) % 20;
  return SEGMENT_ORDER[segmentIndex]!;
}

export function pointToLanded(x: number, y: number): LandedDart {
  const r = Math.hypot(x, y);
  if (r <= BULL_INNER_R) return { segment: 25, multiplier: 2 };
  if (r <= BULL_OUTER_R) return { segment: 25, multiplier: 1 };
  if (r > DOUBLE_OUTER_R) return { segment: 0, multiplier: 1 }; // miss
  const angle = Math.atan2(y, x);
  const segment = segmentForAngle(angle);
  if (r >= TRIPLE_INNER_R && r <= TRIPLE_OUTER_R) return { segment, multiplier: 3 };
  if (r >= DOUBLE_INNER_R && r <= DOUBLE_OUTER_R) return { segment, multiplier: 2 };
  return { segment, multiplier: 1 };
}

export function targetToPoint(segment: number, multiplier: 1 | 2 | 3): { x: number; y: number } {
  if (segment === 25) {
    return { x: 0, y: multiplier === 2 ? 0 : (BULL_INNER_R + BULL_OUTER_R) / 2 };
  }
  const index = SEGMENT_ORDER.indexOf(segment as (typeof SEGMENT_ORDER)[number]);
  if (index < 0) return { x: 0, y: 0 };
  const angleClockwiseFromTop = index * (TAU / 20);
  const mathAngle = Math.PI / 2 - angleClockwiseFromTop;
  let r: number;
  if (multiplier === 3) r = (TRIPLE_INNER_R + TRIPLE_OUTER_R) / 2;
  else if (multiplier === 2) r = (DOUBLE_INNER_R + DOUBLE_OUTER_R) / 2;
  else r = (BULL_OUTER_R + TRIPLE_INNER_R) / 2;
  return { x: r * Math.cos(mathAngle), y: r * Math.sin(mathAngle) };
}

/**
 * Aim for the FAT single — the outer single band between the triple and
 * double rings. Used by weaker bots: ±25mm scatter still mostly lands on
 * the intended segment, instead of roulette'ing between treble/single/miss.
 *
 * For segment 20 this yields (0, 134.5mm) — a forgiving target for an
 * accuracy floor around σ ≈ 20–25mm.
 */
export function fatSinglePoint(segment: number): { x: number; y: number } {
  const index = SEGMENT_ORDER.indexOf(segment as (typeof SEGMENT_ORDER)[number]);
  if (index < 0) return { x: 0, y: 0 };
  const angleClockwiseFromTop = index * (TAU / 20);
  const mathAngle = Math.PI / 2 - angleClockwiseFromTop;
  // Centre of the outer single ring.
  const r = (TRIPLE_OUTER_R + DOUBLE_INNER_R) / 2;
  return { x: r * Math.cos(mathAngle), y: r * Math.sin(mathAngle) };
}
