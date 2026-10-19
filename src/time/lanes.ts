// Lane layout (§5.4, §5.5, D10): which events draw as rectangles, their stacking rows,
// density strips for the rest, and each lane's height. Recomputed per render window.

import type { Occurrence } from "../data/index";
import { densityRuns, type DensityRun } from "./density";
import { layerX, type RenderWindow } from "./viewport";

export const ROW_HEIGHT = 28;
export const ROW_GAP = 2;
export const LANE_PAD = 4;
/** D10: narrower than this, an event is drawn only as density. */
export const MIN_RECT_PX = 1;
/** D10: wider than this, an event shows its title. */
export const MIN_TITLE_PX = 40;

export function laneHeight(rows: number): number {
  const r = Math.max(1, rows);
  return LANE_PAD * 2 + r * ROW_HEIGHT + (r - 1) * ROW_GAP;
}

export function rowY(laneTop: number, row: number): number {
  return laneTop + LANE_PAD + row * (ROW_HEIGHT + ROW_GAP);
}

/**
 * Greedy row assignment: each item, in start order, takes the first row whose last
 * item has ended. Touching intervals (end === start) share a row.
 */
export function assignRows(items: ReadonlyArray<{ start: number; end: number }>): { rows: number[]; rowCount: number } {
  const order = items.map((_, i) => i).sort((a, b) => items[a]!.start - items[b]!.start || items[a]!.end - items[b]!.end);
  const rowEnds: number[] = [];
  const rows = new Array<number>(items.length);
  for (const i of order) {
    const it = items[i]!;
    let r = rowEnds.findIndex((end) => end <= it.start);
    if (r === -1) r = rowEnds.push(it.end) - 1;
    else rowEnds[r] = it.end;
    rows[i] = r;
  }
  return { rows, rowCount: rowEnds.length };
}

export interface PlacedRect {
  occ: Occurrence;
  x: number; // layer px, clamped to the window so far-off edges stay small numbers
  width: number;
  row: number;
  showTitle: boolean;
}

export interface LaneLayout {
  categoryId: string;
  top: number;
  height: number;
  rowCount: number;
  rects: PlacedRect[];
  density: DensityRun[];
}

export function layoutLanes(
  occurrences: readonly Occurrence[],
  categoryIds: readonly string[],
  rw: RenderWindow,
): { lanes: LaneLayout[]; totalHeight: number } {
  const byCategory = new Map<string, Occurrence[]>(categoryIds.map((id) => [id, []]));
  // §5.5: one record, one appearance in every selected lane.
  for (const o of occurrences) for (const id of o.event.categoryIds) byCategory.get(id)?.push(o);

  const minX = layerX(rw, rw.winStart) - 10;
  const maxX = layerX(rw, rw.winEnd) + 10;

  let top = 0;
  const lanes: LaneLayout[] = [];
  for (const categoryId of categoryIds) {
    const occs = byCategory.get(categoryId)!;
    const wide: Occurrence[] = [];
    const narrow: Array<[number, number]> = [];
    const bands: Array<{ start: number; end: number; coverage: number }> = [];
    for (const o of occs) {
      if (o.coverage !== undefined) bands.push({ start: o.start, end: o.end, coverage: o.coverage });
      else if ((o.end - o.start) * rw.scale < MIN_RECT_PX) narrow.push([o.start, o.end]);
      else wide.push(o);
    }
    const { rows, rowCount } = assignRows(wide);
    const rects = wide.map((occ, i): PlacedRect => {
      const fullWidth = (occ.end - occ.start) * rw.scale;
      const x0 = Math.max(minX, layerX(rw, occ.start));
      const x1 = Math.min(maxX, layerX(rw, occ.end));
      return { occ, x: x0, width: x1 - x0, row: rows[i]!, showTitle: fullWidth > MIN_TITLE_PX };
    });
    const height = laneHeight(rowCount);
    lanes.push({ categoryId, top, height, rowCount: Math.max(1, rowCount), rects, density: densityRuns(narrow, rw, bands) });
    top += height;
  }
  return { lanes, totalHeight: top };
}
