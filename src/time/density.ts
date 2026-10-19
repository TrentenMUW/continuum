// D10: events narrower than 1 px become per-pixel-column coverage bins.

import { layerX, type RenderWindow } from "./viewport";

export interface DensityRun {
  x: number; // layer px
  width: number;
  opacity: number; // fraction of the column's time covered, quantized
}

const LEVELS = 50; // opacity quantization; adjacent equal columns merge into one rect

/**
 * Any column with some activity is drawn at least this dark, so sparse events stay
 * visible at wide zoom (agreed with Trenten, Stage 4). Above it, opacity is the true fraction.
 */
export const MIN_DENSITY_OPACITY = 0.25;

/**
 * An edge computed as 3.9999999 px is really the boundary at 4. Without this, the floor
 * below would turn floating-point slivers into a visible column.
 */
function snapToColumn(p: number): number {
  const r = Math.round(p);
  return Math.abs(p - r) < 1e-6 ? r : p;
}

/** Merge overlapping [start, end) intervals so covered time is never counted twice. */
export function mergeIntervals(intervals: ReadonlyArray<readonly [number, number]>): Array<[number, number]> {
  const sorted = [...intervals].sort((a, b) => a[0] - b[0]);
  const out: Array<[number, number]> = [];
  for (const [s, e] of sorted) {
    const last = out[out.length - 1];
    if (last && s <= last[1]) last[1] = Math.max(last[1], e);
    else out.push([s, e]);
  }
  return out;
}

/**
 * Coverage per 1-px column across the render window, as runs of equal opacity.
 * Short events are never widened: a 5-minute event still occupies only its own column,
 * which is drawn at MIN_DENSITY_OPACITY rather than its true ~0.0005 coverage.
 */
export function densityRuns(
  intervals: ReadonlyArray<readonly [number, number]>,
  rw: RenderWindow,
  /** Whole-series bands that cover a fraction of their span on average (see seriesCoverage). */
  bands: ReadonlyArray<{ start: number; end: number; coverage: number }> = [],
): DensityRun[] {
  if (intervals.length === 0 && bands.length === 0) return [];
  const c0 = Math.floor(layerX(rw, rw.winStart));
  const c1 = Math.ceil(layerX(rw, rw.winEnd));
  const cols = c1 - c0;
  if (cols <= 0) return [];
  const cov = new Float64Array(cols);

  const add = (s: number, e: number, weight: number) => {
    const p0 = Math.max(0, snapToColumn(layerX(rw, s) - c0));
    const p1 = Math.min(cols, snapToColumn(layerX(rw, e) - c0));
    if (p1 <= p0) return;
    for (let col = Math.floor(p0); col < Math.ceil(p1); col++) {
      cov[col]! += weight * (Math.min(p1, col + 1) - Math.max(p0, col));
    }
  };
  for (const [s, e] of mergeIntervals(intervals)) add(s, e, 1);
  for (const b of bands) add(b.start, b.end, b.coverage);

  const runs: DensityRun[] = [];
  for (let col = 0; col < cols; col++) {
    const c = cov[col]!;
    if (c <= 0) continue;
    const q = Math.max(MIN_DENSITY_OPACITY, Math.round(Math.min(1, c) * LEVELS) / LEVELS);
    const last = runs[runs.length - 1];
    if (last && last.opacity === q && last.x + last.width === c0 + col) last.width += 1;
    else runs.push({ x: c0 + col, width: 1, opacity: q });
  }
  return runs;
}
