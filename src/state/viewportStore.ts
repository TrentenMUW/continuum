// The viewport store (D5). Lives outside React: input handlers mutate it directly,
// and subscribers are notified at most once per animation frame.
//
// Live-follow (D9, §5.3): while `live`, every frame re-derives the viewport from the
// clock, so Now sits at `nowFraction` of the width and the timeline moves left at the
// true rate. Positions always come from the clock, never from accumulated per-frame steps.

import { useLayoutEffect, useSyncExternalStore, type RefObject } from "react";
import { snapTarget } from "../time/snap";
import {
  layerOffset,
  makeRenderWindow,
  normalize,
  panBy as panViewport,
  spanOf,
  tOf,
  viewportAt,
  windowStillValid,
  zoomAt as zoomViewport,
  zoomToSpan,
  type RenderWindow,
  type Viewport,
} from "../time/viewport";

type Listener = () => void;

const SNAP_IDLE_MS = 200; // D8: a zoom gesture "ends" after ~200 ms without wheel events
const SNAP_ANIM_MS = 220;
const RETURN_ANIM_MS = 400;
const BUTTON_ZOOM = 1.5;

type Animation =
  | { kind: "span"; from: number; to: number; x: number; startedAt: number }
  | { kind: "return"; fromTime: number; startedAt: number };

let viewport: Viewport = { anchorTime: 0, anchorX: 0, scale: 1 };
let widthPx = 0;
let renderWindow: RenderWindow | null = null;
let initialized = false;
let live = false;
let nowFraction = 0.25;
let snap = { enabled: false, threshold: 0.15 };
let clock: () => number = () => Date.now();

const listeners = new Set<Listener>();
let frameScheduled = false;
let animation: Animation | null = null;
let snapTimer: ReturnType<typeof setTimeout> | undefined;

function nowX(): number {
  return widthPx * nowFraction;
}

let frameId = 0;

function requestFrame(): void {
  if (frameScheduled) return;
  frameScheduled = true;
  frameId = requestAnimationFrame(frame);
}

function ease(p: number): number {
  return 1 - Math.pow(1 - p, 3);
}

function frame(): void {
  frameScheduled = false;
  const now = clock();

  if (animation?.kind === "span") {
    const p = Math.min(1, (performance.now() - animation.startedAt) / SNAP_ANIM_MS);
    // Interpolate the span geometrically so the motion feels uniform.
    const span = animation.from * Math.pow(animation.to / animation.from, ease(p));
    viewport = zoomToSpan(viewport, animation.x, span, widthPx);
    if (p >= 1) animation = null;
  } else if (animation?.kind === "return") {
    const p = Math.min(1, (performance.now() - animation.startedAt) / RETURN_ANIM_MS);
    // Glide the time at the Now position toward the (still moving) current time.
    const t = animation.fromTime + (now - animation.fromTime) * ease(p);
    viewport = { anchorTime: t, anchorX: nowX(), scale: viewport.scale };
    if (p >= 1) {
      animation = null;
      live = true;
    }
  }

  if (live) viewport = { anchorTime: now, anchorX: nowX(), scale: viewport.scale };

  if (!renderWindow || !windowStillValid(renderWindow, viewport, widthPx)) {
    if (!live) viewport = normalize(viewport, widthPx);
    renderWindow = makeRenderWindow(viewport, widthPx);
  }
  for (const l of listeners) l();

  // Live mode needs a frame every frame; otherwise only while animating.
  if (live || animation) requestFrame();
}

function prefersReducedMotion(): boolean {
  return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function onVisibilityChange(): void {
  // rAF is paused in background tabs; recompute immediately on return (§5.3).
  if (document.visibilityState === "visible") {
    // Replace any pending frame rather than starting a second rAF chain.
    if (frameScheduled) cancelAnimationFrame(frameId);
    frameScheduled = false;
    frame();
  }
}

export const viewportStore = {
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  getViewport: (): Viewport => viewport,
  getWidth: (): number => widthPx,
  getRenderWindow: (): RenderWindow | null => renderWindow,
  isLive: (): boolean => live,
  now: (): number => clock(),
  isInitialized: (): boolean => initialized,

  /** First layout: show `spanMs` with Now at `fraction` of the width, live (D9). */
  init(width: number, spanMs: number, fraction: number): void {
    widthPx = width;
    nowFraction = fraction;
    viewport = viewportAt(clock(), nowX(), spanMs, width);
    live = true;
    initialized = true;
    renderWindow = null;
    if (typeof document !== "undefined") document.addEventListener("visibilitychange", onVisibilityChange);
    requestFrame();
  },

  setWidth(width: number): void {
    if (width === widthPx || width <= 0) return;
    widthPx = width;
    viewport = zoomViewport(viewport, live ? nowX() : 0, 1, widthPx); // re-clamp the scale for the new width
    requestFrame();
  },

  setSnap(enabled: boolean, threshold: number): void {
    snap = { enabled, threshold };
  },

  /** Manual panning turns live-follow off (§5.3). */
  panBy(dx: number): void {
    animation = null;
    live = false;
    viewport = panViewport(viewport, dx);
    requestFrame();
  },

  /**
   * Zoom around `x`, keeping the timestamp under it fixed. In live mode the zoom
   * centers on the Now marker instead, so Now stays put and live-follow stays on.
   */
  zoomAt(x: number, factor: number): void {
    if (animation?.kind === "span") animation = null;
    viewport = zoomViewport(viewport, this.zoomOrigin(x), factor, widthPx);
    requestFrame();
  },

  zoomOrigin(x: number): number {
    return live || animation?.kind === "return" ? nowX() : x;
  },

  /** A wheel zoom step. Snapping is considered once the wheel has been idle (D8). */
  wheelZoom(x: number, factor: number): void {
    this.zoomAt(x, factor);
    clearTimeout(snapTimer);
    snapTimer = setTimeout(() => this.snapNow(x), SNAP_IDLE_MS);
  },

  zoomButton(direction: 1 | -1): void {
    const x = widthPx / 2;
    this.animateToSpan(spanOf(viewport, widthPx) / Math.pow(BUTTON_ZOOM, direction), x, () => this.snapNow(x));
  },

  /** If snapping is on and the span is near a target, settle on it. */
  snapNow(x: number): void {
    if (!snap.enabled) return;
    const target = snapTarget(spanOf(viewport, widthPx), snap.threshold);
    if (target !== null) this.animateToSpan(target, x);
  },

  animateToSpan(spanMs: number, x: number, then?: () => void): void {
    const origin = this.zoomOrigin(x);
    if (prefersReducedMotion()) {
      viewport = zoomToSpan(viewport, origin, spanMs, widthPx);
      requestFrame();
      then?.();
      return;
    }
    animation = { kind: "span", from: spanOf(viewport, widthPx), to: spanMs, x: origin, startedAt: performance.now() };
    requestFrame();
    if (then) setTimeout(then, SNAP_ANIM_MS + 20);
  },

  /** Put Now back at its position and resume live-follow, keeping the current zoom (D9). */
  returnToNow(): void {
    if (live) return;
    if (prefersReducedMotion()) {
      animation = null;
      live = true;
    } else {
      animation = { kind: "return", fromTime: tOf(viewport, nowX()), startedAt: performance.now() };
    }
    requestFrame();
  },
};

/** Re-renders only when the render window is replaced, not on every pan frame. */
export function useRenderWindow(): RenderWindow | null {
  return useSyncExternalStore(viewportStore.subscribe, viewportStore.getRenderWindow);
}

export function useLive(): boolean {
  return useSyncExternalStore(viewportStore.subscribe, viewportStore.isLive);
}

/**
 * Keep an SVG group's transform in step with the viewport on every frame without
 * involving React. `rw` is the window the group's children were laid out for.
 */
export function useLayerTransform(ref: RefObject<SVGGElement | null>, rw: RenderWindow | null): void {
  useLayoutEffect(() => {
    if (!rw) return;
    const apply = () => {
      ref.current?.setAttribute("transform", `translate(${layerOffset(rw, viewportStore.getViewport())} 0)`);
    };
    apply();
    return viewportStore.subscribe(apply);
  }, [ref, rw]);
}

/** Test hooks: swap the clock and reset all module state. */
export function setClockForTests(fn: () => number): void {
  clock = fn;
}

export function resetViewportStoreForTests(): void {
  if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onVisibilityChange);
  viewport = { anchorTime: 0, anchorX: 0, scale: 1 };
  widthPx = 0;
  renderWindow = null;
  initialized = false;
  live = false;
  nowFraction = 0.25;
  snap = { enabled: false, threshold: 0.15 };
  clock = () => Date.now();
  listeners.clear();
  if (frameScheduled) cancelAnimationFrame(frameId);
  frameScheduled = false;
  animation = null;
  clearTimeout(snapTimer);
}
