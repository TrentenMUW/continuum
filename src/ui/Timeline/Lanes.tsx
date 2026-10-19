import { memo, useRef } from "react";
import { useLayerTransform } from "../../state/viewportStore";
import type { RulerTicks } from "../../time/ticks";
import { layerX, type RenderWindow } from "../../time/viewport";
import type { PlacedMilestone } from "./Timeline";
import styles from "./Timeline.module.css";

export const LANE_HEIGHT = 36;

interface LanesProps {
  rw: RenderWindow;
  ticks: RulerTicks;
  laneCount: number;
  milestones: PlacedMilestone[];
}

export const Lanes = memo(function Lanes({ rw, ticks, laneCount, milestones }: LanesProps) {
  const layerRef = useRef<SVGGElement>(null);
  useLayerTransform(layerRef, rw);
  const height = Math.max(1, laneCount) * LANE_HEIGHT;

  return (
    // Lanes are drawn at least as tall as the scroll area, so gridlines reach the bottom.
    <svg className={styles.lanesSvg} style={{ minHeight: height }} role="presentation">
      {Array.from({ length: laneCount }, (_, i) => (
        <rect
          key={i}
          x={0}
          y={i * LANE_HEIGHT}
          width="100%"
          height={LANE_HEIGHT}
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
