import { memo, useId, useLayoutEffect, useRef, type KeyboardEvent, type ReactNode } from "react";
import { occurrenceId, type Occurrence } from "../../data/index";
import type { Category } from "../../data/types";
import { useLayerTransform, viewportStore } from "../../state/viewportStore";
import { LANE_PAD, ROW_HEIGHT, rowY, type LaneLayout, type PlacedRect } from "../../time/lanes";
import type { RulerTicks } from "../../time/ticks";
import { layerX, type RenderWindow } from "../../time/viewport";
import { describeOccurrence } from "./describe";
import type { PlacedMilestone } from "./Timeline";
import styles from "./Timeline.module.css";

interface LanesProps {
  rw: RenderWindow;
  ticks: RulerTicks;
  lanes: LaneLayout[];
  totalHeight: number;
  categories: Map<string, Category>;
  milestones: PlacedMilestone[];
  pastOpacity: number;
  zone: string;
  /** occurrenceId() of the selected occurrence. */
  selectedId: string | null;
  onSelect: (occ: Occurrence) => void;
}

export const Lanes = memo(function Lanes({
  rw,
  ticks,
  lanes,
  totalHeight,
  categories,
  milestones,
  pastOpacity,
  zone,
  selectedId,
  onSelect,
}: LanesProps) {
  const layerRef = useRef<SVGGElement>(null);
  useLayerTransform(layerRef, rw);

  return (
    // Lanes are drawn at least as tall as the scroll area, so gridlines reach the bottom.
    <svg className={styles.lanesSvg} style={{ minHeight: totalHeight }} role="group" aria-label="Events">
      {lanes.map((lane, i) => (
        <rect
          key={lane.categoryId}
          x={0}
          y={lane.top}
          width="100%"
          height={lane.height}
          className={i % 2 ? styles.laneOdd : styles.laneEven}
        />
      ))}
      <g ref={layerRef}>
        {ticks.minor.map(({ t }) => {
          const x = layerX(rw, t);
          return <line key={`m${t}`} x1={x} x2={x} y1={0} y2="100%" className={styles.gridline} />;
        })}
        {ticks.majors.map(({ t }) => {
          const x = layerX(rw, t);
          return <line key={`M${t}`} x1={x} x2={x} y1={0} y2="100%" className={styles.gridlineStrong} />;
        })}
        <PastMask rw={rw} pastOpacity={pastOpacity}>
          {lanes.map((lane) => {
            const color = categories.get(lane.categoryId)?.color ?? "#9a9a9a";
            return (
              <g key={lane.categoryId}>
                {lane.density.map((d) => (
                  <rect
                    key={`d${d.x}`}
                    x={d.x}
                    y={lane.top + LANE_PAD}
                    width={d.width}
                    height={ROW_HEIGHT}
                    fill={color}
                    fillOpacity={d.opacity}
                    aria-hidden="true"
                  />
                ))}
                {lane.rects.map((r) => (
                  <EventShape
                    key={occurrenceId(r.occ)}
                    rect={r}
                    y={rowY(lane.top, r.row)}
                    color={color}
                    label={describeOccurrence(r.occ, zone)}
                    selected={occurrenceId(r.occ) === selectedId}
                    onSelect={onSelect}
                  />
                ))}
              </g>
            );
          })}
        </PastMask>
        {milestones.map(({ milestone, t, complete }) => {
          const x = layerX(rw, t);
          return (
            <line
              key={milestone.id}
              x1={x}
              x2={x}
              y1={0}
              y2="100%"
              className={styles.milestoneLine}
              strokeDasharray={complete ? undefined : "4 3"}
            />
          );
        })}
      </g>
    </svg>
  );
});

interface EventShapeProps {
  rect: PlacedRect;
  y: number;
  color: string;
  label: string;
  selected: boolean;
  onSelect: (occ: Occurrence) => void;
}

/** One appearance of an event in one lane: focusable, labeled, with a hover tooltip (§5.11). */
function EventShape({ rect, y, color, label, selected, onSelect }: EventShapeProps) {
  const onKeyDown = (e: KeyboardEvent<SVGGElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      e.stopPropagation();
      onSelect(rect.occ);
    }
  };
  return (
    <g
      className={styles.event}
      role="button"
      tabIndex={0}
      aria-label={label}
      aria-pressed={selected}
      onClick={() => onSelect(rect.occ)}
      onKeyDown={onKeyDown}
    >
      <title>{label}</title>
      <rect
        x={rect.x}
        y={y}
        width={Math.max(1, rect.width)}
        height={ROW_HEIGHT}
        rx={Math.min(4, rect.width / 2)}
        fill={color}
        className={selected ? styles.eventSelected : undefined}
      />
      {rect.showTitle && (
        // A nested <svg> clips the title to the rectangle.
        <svg x={rect.x} y={y} width={Math.max(0, rect.width)} height={ROW_HEIGHT} aria-hidden="true">
          <text x={6} y={ROW_HEIGHT / 2} dominantBaseline="central" className={styles.eventTitle}>
            {rect.occ.event.title}
          </text>
        </svg>
      )}
    </g>
  );
}

/**
 * D11: events are drawn once. One alpha mask, split at Now's x and updated each frame,
 * makes the past portion `pastOpacity` and leaves the future portion opaque.
 */
function PastMask({ rw, pastOpacity, children }: { rw: RenderWindow; pastOpacity: number; children?: ReactNode }) {
  const id = `past-mask-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const pastRef = useRef<SVGRectElement>(null);
  const futureRef = useRef<SVGRectElement>(null);
  const left = layerX(rw, rw.winStart) - 10;
  const right = layerX(rw, rw.winEnd) + 10;

  useLayoutEffect(() => {
    const apply = () => {
      const split = Math.min(right, Math.max(left, layerX(rw, viewportStore.now())));
      pastRef.current?.setAttribute("width", String(split - left));
      futureRef.current?.setAttribute("x", String(split));
      futureRef.current?.setAttribute("width", String(right - split));
    };
    apply();
    return viewportStore.subscribe(apply);
  }, [rw, left, right]);

  return (
    <>
      <defs>
        <mask id={id} maskUnits="userSpaceOnUse" x={left} y={0} width={right - left} height="100%" style={{ maskType: "alpha" }}>
          <rect ref={pastRef} x={left} y={0} height="100%" fill="#fff" fillOpacity={pastOpacity} />
          <rect ref={futureRef} y={0} height="100%" fill="#fff" />
        </mask>
      </defs>
      <g mask={`url(#${id})`}>{children}</g>
    </>
  );
}
