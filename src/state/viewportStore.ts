// The viewport store (D5). Lives outside React: input handlers mutate it directly,
// and subscribers are notified at most once per animation frame.

import { useLayoutEffect, useSyncExternalStore, type RefObject } from "react";
import { snapTarget } from "../time/snap";
import {
  layerOffset,
  makeRenderWindow,
  normalize,
  panBy as panViewport,
  spanOf,
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
const BUTTON_ZOOM = 1.5;

let viewport: Viewport = { anchorTime: 0, anchorX: 0, scale: 1 };
let widthPx = 0;
let renderWindow: RenderWindow | null = null;
let initialized = false;
let snap = { enabled: false, threshold: 0.15 };

const listeners = new Set<Listener>();
let frameScheduled = false;
let animation: { from: number; to: number; x: number; startedAt: number } | null = null;
let snapTimer: ReturnType<typeof setTimeout> | undefined;

function requestFrame(): void {
  if (frameScheduled) return;
  frameScheduled = true;
  requestAnimationFrame(frame);
}

function frame(now: number): void {
  frameScheduled = false;
  if (animation) {
    const p = Math.min(1, (now - animation.startedAt) / SNAP_ANIM_MS);
    const eased = 1 - Math.pow(1 - p, 3);
    // Interpolate the span geometrically so the motion feels uniform.
    const span = animation.from * Math.pow(animation.to / animation.from, eased);
    viewport = zoomToSpan(viewport, animation.x, span, widthPx);
    if (p < 1) requestFrame();
    else animation = null;
  }
  if (!renderWindow || !windowStillValid(renderWindow, viewport, widthPx)) {
    viewport = normalize(viewport, widthPx);
    renderWindow = makeRenderWindow(viewport, widthPx);
  }
  for (const l of listeners) l();
}

function cancelAnimation(): void {
  animation = null;
}

function prefersReducedMotion(): boolean {
  return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export const viewportStore = {
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  getViewport: (): Viewport => viewport,
  getWidth: (): number => widthPx,
  getRenderWindow: (): RenderWindow | null => renderWindow,

  /** First layout: show `spanMs` with `now` at `nowFraction` of the width (D9). */
  init(width: number, spanMs: number, nowFraction: number, now: number): void {
    widthPx = width;
    viewport = viewportAt(now, width * nowFraction, spanMs, width);
    initialized = true;
    renderWindow = null;
    requestFrame();
  },

  isInitialized: (): boolean => initialized,

  setWidth(width: number): void {
    if (width === widthPx || width <= 0) return;
    widthPx = width;
    viewport = zoomViewport(viewport, 0, 1, widthPx); // re-clamp the scale for the new width
    requestFrame();
  },

  setSnap(enabled: boolean, threshold: number): void {
    snap = { enabled, threshold };
  },

  panBy(dx: number): void {
    cancelAnimation();
    viewport = panViewport(viewport, dx);
    requestFrame();
  },

  zoomAt(x: number, factor: number): void {
    cancelAnimation();
    viewport = zoomViewport(viewport, x, factor, widthPx);
    requestFrame();
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
    if (prefersReducedMotion()) {
      viewport = zoomToSpan(viewport, x, spanMs, widthPx);
      requestFrame();
      then?.();
      return;
    }
    animation = { from: spanOf(viewport, widthPx), to: spanMs, x, startedAt: performance.now() };
    requestFrame();
    if (then) setTimeout(then, SNAP_ANIM_MS + 20);
  },
};

/** Re-renders only when the render window is replaced, not on every pan frame. */
export function useRenderWindow(): RenderWindow | null {
  return useSyncExternalStore(viewportStore.subscribe, viewportStore.getRenderWindow);
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
