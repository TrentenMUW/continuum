import type { Category } from "../../data/types";
import { laneHeight } from "../../time/lanes";
import styles from "./Timeline.module.css";

/**
 * The sticky label column (§5.4). It sits outside the SVG, so panning never touches it.
 * Heights follow each lane's row count.
 */
export function LaneLabels({ categories, heights }: { categories: Category[]; heights: number[] }) {
  return (
    <ul className={styles.laneLabels} aria-label="Category lanes">
      {categories.map((c, i) => (
        <li key={c.id} className={styles.laneLabel} style={{ height: heights[i] ?? laneHeight(1) }}>
          <span className={styles.swatch} style={{ background: c.color }} aria-hidden="true" />
          {c.name}
        </li>
      ))}
    </ul>
  );
}
