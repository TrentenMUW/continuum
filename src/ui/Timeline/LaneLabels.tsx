import type { Category } from "../../data/types";
import { LANE_HEIGHT } from "./Lanes";
import styles from "./Timeline.module.css";

/** The sticky label column (§5.4). It sits outside the SVG, so panning never touches it. */
export function LaneLabels({ categories }: { categories: Category[] }) {
  return (
    <ul className={styles.laneLabels} aria-label="Category lanes">
      {categories.map((c) => (
        <li key={c.id} className={styles.laneLabel} style={{ height: LANE_HEIGHT }}>
          <span className={styles.swatch} style={{ background: c.color }} aria-hidden="true" />
          {c.name}
        </li>
      ))}
    </ul>
  );
}
