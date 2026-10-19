import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { AppSettings, Category, Milestone } from "../../data/types";
import { useRenderWindow, viewportStore } from "../../state/viewportStore";
import { calDateOf, startOfCalDate } from "../../time/calDate";
import { rulerTicks } from "../../time/ticks";
import { wheelZoomFactor } from "../../time/viewport";
import { LaneLabels } from "./LaneLabels";
import { Lanes } from "./Lanes";
import { Ruler } from "./Ruler";
import styles from "./Timeline.module.css";

export interface PlacedMilestone {
  milestone: Milestone;
  t: number;
  complete: boolean;
}

interface TimelineProps {
  settings: AppSettings;
  zone: string;
  categories: Category[];
  milestones: Milestone[];
}

const WHEEL_LINE_PX = 16;
const KEY_PAN_FRACTION = 0.1;
const KEY_ZOOM = 1.25;

export function Timeline({ settings, zone, categories, milestones }: TimelineProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const plotRef = useRef<HTMLDivElement>(null);
  const rw = useRenderWindow();

  // Measure the plot width; the first measurement sets up the initial view (D9).
  useEffect(() => {
    const el = plotRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const width = Math.round(entry!.contentRect.width);
      if (width <= 0) return;
      if (!viewportStore.isInitialized()) {
        viewportStore.init(width, settings.defaultSpanMs, settings.nowMarkerPosition, Date.now());
      } else {
        viewportStore.setWidth(width);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [settings.defaultSpanMs, settings.nowMarkerPosition]);

  // Wheel: vertical zooms around the cursor, pinch zooms, horizontal or Shift pans (D7).
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const unit = e.deltaMode === 1 ? WHEEL_LINE_PX : e.deltaMode === 2 ? viewportStore.getWidth() : 1;
      const dx = e.deltaX * unit;
      const dy = e.deltaY * unit;
      const x = e.clientX - (plotRef.current?.getBoundingClientRect().left ?? 0);
      if (e.ctrlKey) viewportStore.wheelZoom(x, wheelZoomFactor(dy, true));
      else if (e.shiftKey) viewportStore.panBy(-(dy || dx));
      else if (Math.abs(dx) > Math.abs(dy)) viewportStore.panBy(-dx);
      else if (dy !== 0) viewportStore.wheelZoom(x, wheelZoomFactor(dy, false));
    };
    root.addEventListener("wheel", onWheel, { passive: false });
    return () => root.removeEventListener("wheel", onWheel);
  }, []);

  // Keyboard: â†/â†’ pan, +/âˆ’ zoom (D7). N (Return to Now) arrives with live time in Stage 3.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
      const w = viewportStore.getWidth();
      switch (e.key) {
        case "ArrowLeft":
          viewportStore.panBy(w * KEY_PAN_FRACTION);
          break;
        case "ArrowRight":
          viewportStore.panBy(-w * KEY_PAN_FRACTION);
          break;
        case "+":
        case "=":
          viewportStore.zoomAt(w / 2, KEY_ZOOM);
          viewportStore.snapNow(w / 2);
          break;
        case "-":
        case "_":
          viewportStore.zoomAt(w / 2, 1 / KEY_ZOOM);
          viewportStore.snapNow(w / 2);
          break;
        default:
          return;
      }
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Ticks depend only on the render window, so panning inside the buffer reuses them.
  const ticks = useMemo(() => (rw ? rulerTicks(rw.scale, rw.winStart, rw.winEnd, zone) : null), [rw, zone]);

  const placedMilestones = useMemo<PlacedMilestone[]>(() => {
    const today = calDateOf(Date.now(), zone);
    return milestones.map((m) => ({
      milestone: m,
      t: startOfCalDate(m.targetDate, zone),
      // D12: date-based milestones complete when their date arrives; others only by toggle.
      complete: m.completionMode === "date-based" ? today >= m.targetDate : m.completed,
    }));
  }, [milestones, zone]);

  // Only milestones inside the buffered window are drawn (§7).
  const windowMilestones = useMemo(
    () => (rw ? placedMilestones.filter((m) => m.t >= rw.winStart && m.t <= rw.winEnd) : []),
    [placedMilestones, rw],
  );

  const visibleCategories = useMemo(() => categories.filter((c) => c.visible), [categories]);
  const drag = useDragToPan();

  return (
    <div ref={rootRef} className={styles.timeline}>
      <div className={styles.header}>
        <div className={styles.corner} title="Display time zone">
          {zone}
        </div>
        <div ref={plotRef} className={styles.plot} {...drag}>
          {rw && ticks && <Ruler rw={rw} ticks={ticks} milestones={windowMilestones} />}
        </div>
      </div>
      <div className={styles.body}>
        <LaneLabels categories={visibleCategories} />
        <div className={styles.plot} {...drag}>
          {rw && ticks && <Lanes rw={rw} ticks={ticks} laneCount={visibleCategories.length} milestones={windowMilestones} />}
        </div>
      </div>
    </div>
  );
}

/** Drag on empty timeline pans (D7). */
function useDragToPan() {
  const [handlers] = useState(() => {
    let lastX: number | null = null;
    return {
      onPointerDown(e: ReactPointerEvent<HTMLElement>) {
        if (e.button !== 0) return;
        lastX = e.clientX;
        e.currentTarget.setPointerCapture(e.pointerId);
      },
      onPointerMove(e: ReactPointerEvent<HTMLElement>) {
        if (lastX === null) return;
        viewportStore.panBy(e.clientX - lastX);
        lastX = e.clientX;
      },
      onPointerUp(e: ReactPointerEvent<HTMLElement>) {
        lastX = null;
        e.currentTarget.releasePointerCapture(e.pointerId);
      },
      onPointerCancel() {
        lastX = null;
      },
    };
  });
  return handlers;
}
