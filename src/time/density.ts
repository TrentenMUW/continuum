// D10: events narrower than 1 px become per-pixel-column coverage bins.

import { layerX, type RenderWindow } from "./viewport";

export interface DensityRun {
  x: number; // layer px
  width: number;
  opacity: number; // fraction of the column's time covered, quantized
}

const LEVELS = 50; // opacity quantization; adjacent equal columns merge into one rect

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
 * Short events are never widened: a 5-minute event in a 2-week column adds ~0.0005.
 */
export function densityRuns(intervals: ReadonlyArray<readonly [number, number]>, rw: RenderWindow): DensityRun[] {
  if (intervals.length === 0) return [];
  const c0 = Math.floor(layerX(rw, rw.winStart));
  const c1 = Math.ceil(layerX(rw, rw.winEnd));
  const cols = c1 - c0;
  if (cols <= 0) return [];
  const cov = new Float64Array(cols);

  for (const [s, e] of mergeIntervals(intervals)) {
    const p0 = Math.max(0, layerX(rw, s) - c0);
    const p1 = Math.min(cols, layerX(rw, e) - c0);
    if (p1 <= p0) continue;
    for (let col = Math.floor(p0); col < Math.ceil(p1); col++) {
      cov[col]! += Math.min(p1, col + 1) - Math.max(p0, col);
    }
  }

  const runs: DensityRun[] = [];
  for (let col = 0; col < cols; col++) {
    const q = Math.round(Math.min(1, cov[col]!) * LEVELS) / LEVELS;
    if (q === 0) continue;
    const last = runs[runs.length - 1];
    if (last && last.opacity === q && last.x + last.width === c0 + col) last.width += 1;
    else runs.push({ x: c0 + col, width: 1, opacity: q });
  }
  return runs;
}
