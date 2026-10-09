/**
 * Calibrate σ → expected 3-dart average when aiming at T20.
 *
 * Runs N throws aimed at T20 for each σ and reports the mean 3-dart score.
 * Use the output to build the avg → σ inverse table baked into bot.ts.
 */

// Inlined copy of the dartboard model (keeps this script standalone).
const BULL_INNER_R = 6.35;
const BULL_OUTER_R = 15.9;
const TRIPLE_INNER_R = 99;
const TRIPLE_OUTER_R = 107;
const DOUBLE_INNER_R = 162;
const DOUBLE_OUTER_R = 170;
const SEGMENT_ORDER = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];

const TAU = Math.PI * 2;

function segmentForAngle(angleRad) {
  let a = Math.PI / 2 - angleRad;
  a = ((a % TAU) + TAU) % TAU;
  const idx = Math.floor((a + Math.PI / 20) / (TAU / 20)) % 20;
  return SEGMENT_ORDER[idx];
}

function pointToLanded(x, y) {
  const r = Math.hypot(x, y);
  if (r <= BULL_INNER_R) return { segment: 25, multiplier: 2 };
  if (r <= BULL_OUTER_R) return { segment: 25, multiplier: 1 };
  if (r > DOUBLE_OUTER_R) return { segment: 0, multiplier: 1 };
  const angle = Math.atan2(y, x);
  const segment = segmentForAngle(angle);
  if (r >= TRIPLE_INNER_R && r <= TRIPLE_OUTER_R) return { segment, multiplier: 3 };
  if (r >= DOUBLE_INNER_R && r <= DOUBLE_OUTER_R) return { segment, multiplier: 2 };
  return { segment, multiplier: 1 };
}

function targetToPoint(segment, multiplier) {
  if (segment === 25) return { x: 0, y: multiplier === 2 ? 0 : (BULL_INNER_R + BULL_OUTER_R) / 2 };
  const idx = SEGMENT_ORDER.indexOf(segment);
  if (idx < 0) return { x: 0, y: 0 };
  const angleClockwiseFromTop = idx * (TAU / 20);
  const mathAngle = Math.PI / 2 - angleClockwiseFromTop;
  let r;
  if (multiplier === 3) r = (TRIPLE_INNER_R + TRIPLE_OUTER_R) / 2;
  else if (multiplier === 2) r = (DOUBLE_INNER_R + DOUBLE_OUTER_R) / 2;
  else r = (BULL_OUTER_R + TRIPLE_INNER_R) / 2;
  return { x: r * Math.cos(mathAngle), y: r * Math.sin(mathAngle) };
}

function gaussian() {
  const u1 = Math.max(Math.random(), Number.EPSILON);
  const u2 = Math.random();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

function meanScoreAimingT20(sigma, n = 20000) {
  const aim = targetToPoint(20, 3);
  let total = 0;
  for (let i = 0; i < n; i++) {
    const x = aim.x + gaussian() * sigma;
    const y = aim.y + gaussian() * sigma;
    const landed = pointToLanded(x, y);
    total += landed.segment * landed.multiplier;
  }
  return (total / n) * 3; // 3-dart avg
}

console.log('sigma_mm,3dart_avg');
for (let s = 3; s <= 60; s += 1) {
  console.log(`${s},${meanScoreAimingT20(s).toFixed(2)}`);
}
