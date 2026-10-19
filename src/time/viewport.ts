// Viewport math (D6, D7). Pure: no React, no DOM, no Date.now().

export const MINUTE_MS = 60_000;
export const HOUR_MS = 60 * MINUTE_MS;
export const DAY_MS = 24 * HOUR_MS; // nominal; used for span lengths, never for calendar stepping
export const YEAR_MS = 365.25 * DAY_MS; // nominal

/** D7: the visible span is clamped to 10 minutes … 150 years. */
export const MIN_SPAN_MS = 10 * MINUTE_MS;
export const MAX_SPAN_MS = 150 * YEAR_MS;

/** x(t) = anchorX + (t − anchorTime) · scale */
export interface Viewport {
  anchorTime: number; // ms since epoch
  anchorX: number; // px from the timeline's left edge
  scale: number; // px per ms
}

export function xOf(v: Viewport, t: number): number {
  return v.anchorX + (t - v.anchorTime) * v.scale;
}

export function tOf(v: Viewport, x: number): number {
  return v.anchorTime + (x - v.anchorX) / v.scale;
}

export function spanOf(v: Viewport, widthPx: number): number {
  return widthPx / v.scale;
}

export function clampScale(scale: number, widthPx: number): number {
  const min = widthPx / MAX_SPAN_MS;
  const max = widthPx / MIN_SPAN_MS;
  return Math.min(max, Math.max(min, scale));
}

/** A viewport showing `spanMs` with time `t` at pixel `x`. */
export function viewportAt(t: number, x: number, spanMs: number, widthPx: number): Viewport {
  return { anchorTime: t, anchorX: x, scale: clampScale(widthPx / spanMs, widthPx) };
}

/**
 * Re-anchor on the cursor and change the scale, so the timestamp under `x`
 * stays exactly at `x` (the cursor-centered zoom invariant).
 */
export function zoomAt(v: Viewport, x: number, factor: number, widthPx: number): Viewport {
  return { anchorTime: tOf(v, x), anchorX: x, scale: clampScale(v.scale * factor, widthPx) };
}

/** Zoom so the visible span becomes `spanMs`, keeping the timestamp under `x` fixed. */
export function zoomToSpan(v: Viewport, x: number, spanMs: number, widthPx: number): Viewport {
  return { anchorTime: tOf(v, x), anchorX: x, scale: clampScale(widthPx / spanMs, widthPx) };
}

/** Positive dx drags content right, revealing the past. */
export function panBy(v: Viewport, dx: number): Viewport {
  return { ...v, anchorX: v.anchorX + dx };
}

/** Keep anchorX within the visible area so it never grows without bound while panning. */
export function normalize(v: Viewport, widthPx: number): Viewport {
  if (v.anchorX >= 0 && v.anchorX <= widthPx) return v;
  const x = widthPx / 2;
  return { anchorTime: tOf(v, x), anchorX: x, scale: v.scale };
}

/** Wheel zoom factor per D7: scale *= exp(−deltaY · k). One 100px notch ≈ 12%. */
export const WHEEL_ZOOM_K = Math.log(1 / 0.88) / 100;
/** Trackpad pinch (ctrlKey + wheel) sends small deltas, so it needs a larger k. */
export const PINCH_ZOOM_K = 0.01;

export function wheelZoomFactor(deltaY: number, pinch: boolean): number {
  return Math.exp(-deltaY * (pinch ? PINCH_ZOOM_K : WHEEL_ZOOM_K));
}

/**
 * The range React lays out (D5). Items are positioned relative to `refTime`
 * at `scale`; a per-frame transform moves the whole layer. It's replaced only when
 * the scale changes or the visible range leaves [winStart, winEnd].
 */
export interface RenderWindow {
  refTime: number;
  scale: number;
  winStart: number;
  winEnd: number;
  widthPx: number;
}

/** Visible range plus one viewport width on each side (§7). */
export function makeRenderWindow(v: Viewport, widthPx: number): RenderWindow {
  const visStart = tOf(v, 0);
  const visEnd = tOf(v, widthPx);
  const span = visEnd - visStart;
  return { refTime: visStart, scale: v.scale, winStart: visStart - span, winEnd: visEnd + span, widthPx };
}

export function windowStillValid(rw: RenderWindow, v: Viewport, widthPx: number): boolean {
  return (
    rw.scale === v.scale &&
    rw.widthPx === widthPx &&
    tOf(v, 0) >= rw.winStart &&
    tOf(v, widthPx) <= rw.winEnd
  );
}

/** Pixel offset to apply to a layer laid out for `rw`, so it lines up with `v`. */
export function layerOffset(rw: RenderWindow, v: Viewport): number {
  return xOf(v, rw.refTime);
}

/** x of `t` inside a layer laid out for `rw`. Small numbers, even in 2100 (D6). */
export function layerX(rw: RenderWindow, t: number): number {
  return (t - rw.refTime) * rw.scale;
}
