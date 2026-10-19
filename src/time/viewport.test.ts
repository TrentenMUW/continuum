import { describe, expect, it } from "vitest";
import {
  DAY_MS,
  HOUR_MS,
  MAX_SPAN_MS,
  MIN_SPAN_MS,
  layerOffset,
  layerX,
  makeRenderWindow,
  normalize,
  panBy,
  spanOf,
  tOf,
  viewportAt,
  windowStillValid,
  xOf,
  zoomAt,
  zoomToSpan,
  type Viewport,
} from "./viewport";

const W = 1600;
const t2026 = Date.UTC(2026, 9, 18, 16, 0, 0);
const v0: Viewport = viewportAt(t2026, W * 0.25, 3 * DAY_MS, W);

describe("viewport mapping (D6)", () => {
  it("round-trips x → t → x and t → x → t", () => {
    for (const x of [-500, 0, 1, 400, 799.5, W, W + 300]) {
      expect(xOf(v0, tOf(v0, x))).toBeCloseTo(x, 9);
    }
    for (const t of [t2026 - 5 * DAY_MS, t2026, t2026 + 12_345, t2026 + 2 * DAY_MS]) {
      expect(tOf(v0, xOf(v0, t))).toBeCloseTo(t, 3);
    }
  });

  it("width equals duration × scale", () => {
    const start = t2026 + 3 * HOUR_MS;
    const end = start + 90 * 60_000;
    expect(xOf(v0, end) - xOf(v0, start)).toBeCloseTo(90 * 60_000 * v0.scale, 9);
    // The same 90 minutes is equally wide anywhere on the line.
    const later = Date.UTC(2041, 2, 3);
    expect(xOf(v0, later + 90 * 60_000) - xOf(v0, later)).toBeCloseTo(90 * 60_000 * v0.scale, 6);
  });

  it("keeps millisecond precision near 2100 at the tightest zoom", () => {
    const t2100 = Date.UTC(2100, 0, 1, 0, 0, 0, 0);
    const v = viewportAt(t2100, 300, MIN_SPAN_MS, W);
    for (const dt of [1, 7, 999, 60_000]) {
      const x = xOf(v, t2100 + dt);
      expect(Math.abs(x - (300 + dt * v.scale))).toBeLessThan(1e-6);
      expect(Math.abs(tOf(v, x) - (t2100 + dt))).toBeLessThan(0.01);
    }
  });

  it("keeps layer coordinates small and exact far from the reference time", () => {
    // The anchor is in 2026 but the layer is laid out around 2100.
    const t2100 = Date.UTC(2100, 5, 1);
    const v = viewportAt(t2100, 400, MIN_SPAN_MS, W);
    const rw = makeRenderWindow(v, W);
    const x = layerOffset(rw, v) + layerX(rw, t2100 + 1000);
    expect(Math.abs(x - xOf(v, t2100 + 1000))).toBeLessThan(1e-6);
    expect(Math.abs(layerX(rw, t2100))).toBeLessThan(W * 2);
  });
});

describe("zoom (D7)", () => {
  it("keeps the timestamp under the cursor fixed", () => {
    for (const x of [0, 123.4, 800, W]) {
      const before = tOf(v0, x);
      const z = zoomAt(v0, x, 1.37, W);
      expect(tOf(z, x)).toBeCloseTo(before, 3);
      const z2 = zoomAt(z, x, 0.41, W);
      expect(tOf(z2, x)).toBeCloseTo(before, 3);
    }
  });

  it("keeps the cursor timestamp fixed across many wheel steps", () => {
    let v = v0;
    const x = 977;
    const before = tOf(v, x);
    for (let i = 0; i < 200; i++) v = zoomAt(v, x, i % 2 ? 1.12 : 0.9, W);
    expect(tOf(v, x)).toBeCloseTo(before, 0);
  });

  it("clamps the span to 10 minutes … 150 years", () => {
    expect(spanOf(zoomAt(v0, 0, 1e12, W), W)).toBeCloseTo(MIN_SPAN_MS, 3);
    expect(spanOf(zoomAt(v0, 0, 1e-12, W), W) / MAX_SPAN_MS).toBeCloseTo(1, 9);
  });

  it("zoomToSpan hits the span and keeps the cursor timestamp", () => {
    const x = 640;
    const z = zoomToSpan(v0, x, 7 * DAY_MS, W);
    expect(spanOf(z, W)).toBeCloseTo(7 * DAY_MS, 3);
    expect(tOf(z, x)).toBeCloseTo(tOf(v0, x), 3);
  });
});

describe("pan", () => {
  it("moves content by dx without changing scale", () => {
    const p = panBy(v0, 250);
    expect(p.scale).toBe(v0.scale);
    expect(xOf(p, t2026)).toBeCloseTo(xOf(v0, t2026) + 250, 9);
  });

  it("normalize keeps the mapping identical", () => {
    const far = panBy(v0, 1e6);
    const n = normalize(far, W);
    expect(n.anchorX).toBeGreaterThanOrEqual(0);
    expect(n.anchorX).toBeLessThanOrEqual(W);
    for (const x of [0, 500, W]) expect(tOf(n, x)).toBeCloseTo(tOf(far, x), 2);
  });
});

describe("render window (D5)", () => {
  it("buffers one viewport width on each side", () => {
    const rw = makeRenderWindow(v0, W);
    const span = spanOf(v0, W);
    expect(rw.winStart).toBeCloseTo(tOf(v0, 0) - span, 3);
    expect(rw.winEnd).toBeCloseTo(tOf(v0, W) + span, 3);
  });

  it("stays valid while panning inside the buffer and invalidates outside it or on zoom", () => {
    const rw = makeRenderWindow(v0, W);
    expect(windowStillValid(rw, panBy(v0, W * 0.9), W)).toBe(true);
    expect(windowStillValid(rw, panBy(v0, -W * 0.9), W)).toBe(true);
    expect(windowStillValid(rw, panBy(v0, W * 1.1), W)).toBe(false);
    expect(windowStillValid(rw, zoomAt(v0, 10, 1.01, W), W)).toBe(false);
    expect(windowStillValid(rw, v0, W + 1)).toBe(false);
  });
});
