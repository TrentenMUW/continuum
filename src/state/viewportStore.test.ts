// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DAY_MS, MINUTE_MS, spanOf, tOf, xOf } from "../time/viewport";
import { resetViewportStoreForTests, setClockForTests, viewportStore as vs } from "./viewportStore";

const W = 1200;
const T0 = Date.UTC(2026, 9, 18, 16, 0, 0);

let clockMs = T0;
let perfMs = 0;
let reducedMotion = true;
let queue = new Map<number, FrameRequestCallback>();
let nextId = 1;

/** Run every pending animation frame once (frames queued during the run wait). */
function runFrame(): void {
  const batch = [...queue.values()];
  queue = new Map();
  for (const cb of batch) cb(perfMs);
}

const nowX = () => W * 0.25;
const timeAtNowX = () => tOf(vs.getViewport(), nowX());

beforeEach(() => {
  resetViewportStoreForTests();
  clockMs = T0;
  perfMs = 0;
  reducedMotion = true;
  queue = new Map();
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    const id = nextId++;
    queue.set(id, cb);
    return id;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => queue.delete(id));
  vi.stubGlobal("matchMedia", (q: string) => ({ matches: q.includes("reduce") && reducedMotion }));
  vi.spyOn(performance, "now").mockImplementation(() => perfMs);
  setClockForTests(() => clockMs);
  vs.init(W, 3 * DAY_MS, 0.25);
  runFrame();
});

afterEach(() => {
  resetViewportStoreForTests();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("live-follow (D9, §5.3)", () => {
  it("starts live with Now at 25% and the default 3-day span", () => {
    expect(vs.isLive()).toBe(true);
    expect(xOf(vs.getViewport(), T0)).toBeCloseTo(nowX(), 9);
    expect(spanOf(vs.getViewport(), W)).toBeCloseTo(3 * DAY_MS, 3);
  });

  it("derives position from the clock each frame, with no drift from irregular frames", () => {
    for (const step of [16, 17, 33, 1, 250, 16.7, 5000, 3, 60_000]) {
      clockMs += step;
      runFrame();
      expect(vs.getViewport().anchorTime).toBe(clockMs);
      expect(xOf(vs.getViewport(), clockMs)).toBeCloseTo(nowX(), 9);
    }
  });

  it("moves the timeline left at the true rate for the scale", () => {
    const v = vs.getViewport();
    const x0 = xOf(v, T0 + 60 * MINUTE_MS);
    clockMs += 10 * MINUTE_MS;
    runFrame();
    const x1 = xOf(vs.getViewport(), T0 + 60 * MINUTE_MS);
    expect(x0 - x1).toBeCloseTo(10 * MINUTE_MS * v.scale, 6);
  });

  it("keeps requesting frames while live and stops once live is off", () => {
    expect(queue.size).toBe(1);
    vs.panBy(-10);
    runFrame();
    expect(queue.size).toBe(0);
  });

  it("panning turns live off and the view stops following the clock", () => {
    vs.panBy(-200);
    runFrame();
    expect(vs.isLive()).toBe(false);
    const before = timeAtNowX();
    clockMs += 10 * MINUTE_MS;
    runFrame();
    expect(timeAtNowX()).toBeCloseTo(before, 3);
  });

  it("zooming while live keeps Now at its position and stays live", () => {
    vs.zoomAt(900, 2);
    clockMs += 1000;
    runFrame();
    expect(vs.isLive()).toBe(true);
    expect(spanOf(vs.getViewport(), W)).toBeCloseTo(1.5 * DAY_MS, 3);
    expect(xOf(vs.getViewport(), clockMs)).toBeCloseTo(nowX(), 9);
  });

  it("zooming while not live keeps the cursor timestamp fixed", () => {
    vs.panBy(-300);
    runFrame();
    const before = tOf(vs.getViewport(), 900);
    vs.zoomAt(900, 2);
    runFrame();
    expect(tOf(vs.getViewport(), 900)).toBeCloseTo(before, 3);
  });
});

describe("Return to Now", () => {
  it("restores Now at 25% and resumes live, keeping the zoom (reduced motion: instant)", () => {
    vs.zoomAt(600, 4);
    vs.panBy(-5000);
    runFrame();
    const scale = vs.getViewport().scale;
    clockMs += 30 * MINUTE_MS;

    vs.returnToNow();
    runFrame();
    expect(vs.isLive()).toBe(true);
    expect(vs.getViewport().scale).toBe(scale);
    expect(xOf(vs.getViewport(), clockMs)).toBeCloseTo(nowX(), 9);
  });

  it("animates when motion is allowed and lands exactly on the moving Now", () => {
    reducedMotion = false;
    vs.panBy(W * 3);
    runFrame();
    vs.returnToNow();
    expect(vs.isLive()).toBe(false);

    for (let i = 0; i < 30; i++) {
      perfMs += 16;
      clockMs += 16;
      runFrame();
    }
    expect(vs.isLive()).toBe(true);
    expect(xOf(vs.getViewport(), clockMs)).toBeCloseTo(nowX(), 9);
  });
});

describe("visibility change", () => {
  it("recomputes immediately on return and doesn't start a second frame loop", () => {
    clockMs += 60 * MINUTE_MS; // the tab was hidden; no frames ran
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));

    expect(xOf(vs.getViewport(), clockMs)).toBeCloseTo(nowX(), 9);
    expect(queue.size).toBe(1);
  });
});
