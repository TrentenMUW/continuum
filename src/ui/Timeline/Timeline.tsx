import { TZDate } from "@date-fns/tz";
import { format } from "date-fns";
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import { isBenchmarkMode } from "../../data/benchmark";
import type { EventIndex, Occurrence } from "../../data/index";
import type { AppSettings, Category, Milestone } from "../../data/types";
import { moveMilestone } from "../../state/appStore";
import { useRenderWindow, viewportStore } from "../../state/viewportStore";
import { calDateOf, startOfCalDate } from "../../time/calDate";
import { layoutLanes } from "../../time/lanes";
import { isMilestoneComplete, nearestMidnight } from "../../time/milestones";
import { rulerTicks } from "../../time/ticks";
import { tOf, wheelZoomFactor } from "../../time/viewport";
import { LaneLabels } from "./LaneLabels";
import { Lanes } from "./Lanes";
import { NowMarker } from "./NowMarker";
import { Ruler } from "./Ruler";
import styles from "./Timeline.module.css";

export interface PlacedMilestone {
  milestone: Milestone;
  t: number;
  dateLabel: string;
  complete: boolean;
}

interface TimelineProps {
  settings: AppSettings;
  zone: string;
  categories: Category[];
  milestones: Milestone[];
  index: EventIndex;
  eventsVersion: number;
  selectedId: string | null;
  onSelectEvent: (occ: Occurrence) => void;
  onOpenMilestone: (m: Milestone) => void;
  onEditCategories: () => void;
}

const WHEEL_LINE_PX = 16;
const KEY_PAN_FRACTION = 0.1;
const KEY_ZOOM = 1.25;

export function Timeline({
  settings,
  zone,
  categories,
  milestones,
  index,
  eventsVersion,
  selectedId,
  onSelectEvent,
  onOpenMilestone,
  onEditCategories,
}: TimelineProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const plotRef = useRef<HTMLDivElement>(null);
  const rw = useRenderWindow();

  // Measure the plot width; the first measurement sets up the initial live view (D9).
  useEffect(() => {
    const el = plotRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const width = Math.round(entry!.contentRect.width);
      if (width <= 0) return;
      if (!viewportStore.isInitialized()) {
        viewportStore.init(width, settings.defaultSpanMs, settings.nowMarkerPosition);
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

  // Keyboard: Left/Right pan, +/- zoom, N returns to Now (D7).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target;
      if (target instanceof Element && target.closest("input, textarea, select, [contenteditable='true']")) return;
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
        case "n":
        case "N":
          viewportStore.returnToNow();
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
  const ticks = useMemo(() => (rw ? measured("ticks", () => rulerTicks(rw.scale, rw.winStart, rw.winEnd, zone)) : null), [rw, zone]);

  const milestoneDrag = useMilestoneDrag(plotRef, zone, onOpenMilestone);

  const placedMilestones = useMemo<PlacedMilestone[]>(() => {
    const today = calDateOf(Date.now(), zone);
    return milestones.map((m) => {
      // While dragging, show the milestone at the day it would snap to.
      const targetDate = milestoneDrag.preview?.id === m.id ? milestoneDrag.preview.date : m.targetDate;
      return {
        milestone: m,
        t: startOfCalDate(targetDate, zone),
        dateLabel: format(new TZDate(startOfCalDate(targetDate, zone), zone), "EEE d MMM yyyy"),
        complete: isMilestoneComplete({ ...m, targetDate }, today),
      };
    });
  }, [milestones, zone, milestoneDrag.preview]);

  // Only milestones inside the buffered window are drawn (§7).
  const windowMilestones = useMemo(
    () => (rw ? placedMilestones.filter((m) => m.t >= rw.winStart && m.t <= rw.winEnd) : []),
    [placedMilestones, rw],
  );

  const visibleCategories = useMemo(() => categories.filter((c) => c.visible), [categories]);
  const categoryById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);

  // Query and lay out only the buffered window (D4, D5, §7); panning inside it reuses this.
  const occurrences = useMemo(
    () => (rw ? measured("query", () => index.query(rw.winStart, rw.winEnd, 1 / rw.scale)) : []),
    // eventsVersion changes whenever the index is patched in place.
    [rw, index, eventsVersion],
  );
  const layout = useMemo(
    () => (rw ? measured("layout", () => layoutLanes(occurrences, visibleCategories.map((c) => c.id), rw)) : null),
    [occurrences, visibleCategories, rw],
  );

  const drag = useDragToPan();

  return (
    <div ref={rootRef} className={styles.timeline}>
      <div className={styles.header}>
        <div className={styles.corner}>
          <span title="Display time zone">{zone}</span>
          <button type="button" className={styles.cornerButton} onClick={onEditCategories}>
            Categories
          </button>
        </div>
        <div ref={plotRef} className={styles.plot} {...drag}>
          {rw && ticks && <Ruler rw={rw} ticks={ticks} milestones={windowMilestones} handlers={milestoneDrag.handlers} />}
        </div>
      </div>
      <div className={styles.body}>
        <LaneLabels categories={visibleCategories} heights={layout?.lanes.map((l) => l.height) ?? []} />
        <div className={styles.plot} {...drag}>
          {rw && ticks && layout && (
            <Lanes
              rw={rw}
              ticks={ticks}
              lanes={layout.lanes}
              totalHeight={layout.totalHeight}
              categories={categoryById}
              milestones={windowMilestones}
              milestoneHandlers={milestoneDrag.handlers}
              pastOpacity={settings.pastEventOpacity}
              zone={zone}
              selectedId={selectedId}
              onSelect={onSelectEvent}
            />
          )}
        </div>
      </div>
      <NowMarker zone={zone} />
    </div>
  );
}

const MEASURE = isBenchmarkMode();

/** In ?benchmark mode only, record how long each step takes (read with performance.getEntriesByType("measure")). */
function measured<T>(name: string, fn: () => T): T {
  if (!MEASURE) return fn();
  const t0 = performance.now();
  const out = fn();
  performance.measure(`continuum:${name}`, { start: t0, end: performance.now() });
  return out;
}

const DRAG_THRESHOLD_PX = 3;

export interface MilestoneHandlers {
  onPointerDown: (m: Milestone, e: ReactPointerEvent<SVGElement>) => void;
  onPointerMove: (e: ReactPointerEvent<SVGElement>) => void;
  onPointerUp: (e: ReactPointerEvent<SVGElement>) => void;
  onOpen: (m: Milestone) => void;
}

/**
 * Drag a milestone to reschedule it (D12). It snaps to the nearest local midnight
 * while moving and saves on release. A press without movement opens it instead.
 */
function useMilestoneDrag(plotRef: RefObject<HTMLDivElement | null>, zone: string, onOpen: (m: Milestone) => void) {
  const [preview, setPreview] = useState<{ id: string; date: string } | null>(null);
  const state = useRef<{ m: Milestone; downX: number; moved: boolean; date: string } | null>(null);
  const openRef = useRef(onOpen);
  openRef.current = onOpen;

  const [handlers] = useState<MilestoneHandlers>(() => ({
    onPointerDown(m, e) {
      if (e.button !== 0) return;
      e.stopPropagation(); // not a pan
      state.current = { m, downX: e.clientX, moved: false, date: m.targetDate };
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    onPointerMove(e) {
      const s = state.current;
      if (!s) return;
      e.stopPropagation();
      if (!s.moved && Math.abs(e.clientX - s.downX) < DRAG_THRESHOLD_PX) return;
      s.moved = true;
      const x = e.clientX - (plotRef.current?.getBoundingClientRect().left ?? 0);
      const date = nearestMidnight(tOf(viewportStore.getViewport(), x), zone);
      if (date !== s.date) {
        s.date = date;
        setPreview({ id: s.m.id, date });
      }
    },
    onPointerUp(e) {
      const s = state.current;
      state.current = null;
      if (!s) return;
      e.stopPropagation();
      e.currentTarget.releasePointerCapture(e.pointerId);
      if (!s.moved) openRef.current(s.m);
      else if (s.date !== s.m.targetDate) void moveMilestone(s.m.id, s.date).finally(() => setPreview(null));
      else setPreview(null);
    },
    onOpen: (m) => openRef.current(m),
  }));
  return { handlers, preview };
}

/**
 * Drag on the timeline pans (D7). The pointer is captured only once it has moved a few
 * pixels, so a plain click still reaches the event under it and doesn't end live mode.
 */
function useDragToPan() {
  const [handlers] = useState(() => {
    let downX: number | null = null;
    let lastX = 0;
    let dragging = false;
    return {
      onPointerDown(e: ReactPointerEvent<HTMLElement>) {
        if (e.button !== 0) return;
        downX = lastX = e.clientX;
        dragging = false;
      },
      onPointerMove(e: ReactPointerEvent<HTMLElement>) {
        if (downX === null) return;
        if (!dragging) {
          if (Math.abs(e.clientX - downX) < DRAG_THRESHOLD_PX) return;
          dragging = true;
          e.currentTarget.setPointerCapture(e.pointerId);
        }
        if (e.clientX === lastX) return;
        viewportStore.panBy(e.clientX - lastX);
        lastX = e.clientX;
      },
      onPointerUp(e: ReactPointerEvent<HTMLElement>) {
        if (dragging) e.currentTarget.releasePointerCapture(e.pointerId);
        downX = null;
        dragging = false;
      },
      onPointerCancel() {
        downX = null;
        dragging = false;
      },
    };
  });
  return handlers;
}
