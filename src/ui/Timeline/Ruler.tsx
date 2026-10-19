import { memo, useLayoutEffect, useRef, type RefObject } from "react";
import { useLayerTransform, viewportStore } from "../../state/viewportStore";
import type { RulerTicks } from "../../time/ticks";
import { layerX, tOf, type RenderWindow } from "../../time/viewport";
import type { MilestoneHandlers, PlacedMilestone } from "./Timeline";
import styles from "./Timeline.module.css";

export const RULER_HEIGHT = 60;
const MILESTONE_Y = 14;
const MAJOR_Y = 32;
const MINOR_Y = 52;

interface RulerProps {
  rw: RenderWindow;
  ticks: RulerTicks;
  milestones: PlacedMilestone[];
  handlers: MilestoneHandlers;
}

export const Ruler = memo(function Ruler({ rw, ticks, milestones, handlers }: RulerProps) {
  const layerRef = useRef<SVGGElement>(null);
  const contextRef = useRef<HTMLDivElement>(null);
  useLayerTransform(layerRef, rw);
  useContextLabel(contextRef, ticks);

  return (
    <div className={styles.ruler}>
      <svg className={styles.svg} height={RULER_HEIGHT} role="group" aria-label="Time ruler">
        <g ref={layerRef}>
          {ticks.majors.map(({ t, label }) => {
            const x = layerX(rw, t);
            return (
              <g key={`M${t}`}>
                <line x1={x} x2={x} y1={20} y2={RULER_HEIGHT} className={styles.majorTick} />
                <text x={x + 5} y={MAJOR_Y} className={styles.majorLabel}>
                  {label}
                </text>
              </g>
            );
          })}
          {ticks.minor.map(({ t, label }) => {
            const x = layerX(rw, t);
            return (
              <g key={`m${t}`}>
                <line x1={x} x2={x} y1={RULER_HEIGHT - 8} y2={RULER_HEIGHT} className={styles.minorTick} />
                <text x={x + 4} y={MINOR_Y} className={styles.minorLabel}>
                  {label}
                </text>
              </g>
            );
          })}
          {milestones.map(({ milestone, t, complete, dateLabel }) => {
            const x = layerX(rw, t);
            const label = `Milestone: ${milestone.title}, ${dateLabel}, ${complete ? "complete" : "not complete"}. Drag to move.`;
            return (
              <g
                key={milestone.id}
                className={styles.milestone}
                role="button"
                tabIndex={0}
                aria-label={label}
                onPointerDown={(e) => handlers.onPointerDown(milestone, e)}
                onPointerMove={handlers.onPointerMove}
                onPointerUp={handlers.onPointerUp}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    handlers.onOpen(milestone);
                  }
                }}
              >
                <title>{`${milestone.title}, ${dateLabel}`}</title>
                {/* A generous, invisible grab area around the line and its label. */}
                <rect x={x - 6} y={0} width={milestone.title.length * 7 + 20} height={RULER_HEIGHT} fill="transparent" />
                <line
                  x1={x}
                  x2={x}
                  y1={0}
                  y2={RULER_HEIGHT}
                  className={styles.milestoneLine}
                  strokeDasharray={complete ? undefined : "4 3"}
                />
                <text x={x + 6} y={MILESTONE_Y} className={styles.milestoneLabel}>
                  {milestone.title}
                </text>
              </g>
            );
          })}
        </g>
      </svg>
      <div ref={contextRef} className={styles.contextLabel} aria-hidden="true" />
    </div>
  );
});

/**
 * Keep the label of the major period at the left edge visible ("October 2026"
 * while looking at hours), updating text only when it changes.
 */
function useContextLabel(ref: RefObject<HTMLDivElement | null>, ticks: RulerTicks) {
  useLayoutEffect(() => {
    const apply = () => {
      const el = ref.current;
      if (!el) return;
      const left = tOf(viewportStore.getViewport(), 0);
      let label = "";
      for (const m of ticks.majors) {
        if (m.t <= left) label = m.label;
        else break;
      }
      if (el.textContent !== label) el.textContent = label;
      el.hidden = label === "";
    };
    apply();
    return viewportStore.subscribe(apply);
  }, [ref, ticks]);
}
