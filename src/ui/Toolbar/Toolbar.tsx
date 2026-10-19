import styles from "./Toolbar.module.css";

interface ToolbarProps {
  live: boolean;
}

/** §5.11 toolbar. Controls are disabled until the stage that implements them. */
export function Toolbar({ live }: ToolbarProps) {
  return (
    <header className={styles.toolbar} role="toolbar" aria-label="Continuum controls">
      <h1 className={styles.title}>Continuum</h1>

      <div className={styles.group}>
        <button type="button" className={styles.primary} disabled title="Coming in Stage 4">
          Add Event
        </button>
        <button type="button" disabled title="Coming in Stage 6">
          Add Milestone
        </button>
      </div>

      <div className={styles.group}>
        <span className={live ? styles.liveOn : styles.liveOff} aria-label={live ? "Live: following now" : "Live: off"}>
          LIVE
        </span>
        <button type="button" disabled title="Coming in Stage 3">
          Return to Now
        </button>
      </div>

      <div className={styles.group}>
        <button type="button" aria-label="Zoom out" disabled title="Coming in Stage 2">
          −
        </button>
        <button type="button" aria-label="Zoom in" disabled title="Coming in Stage 2">
          +
        </button>
        <button type="button" aria-pressed={false} disabled title="Coming in Stage 2">
          Snap
        </button>
      </div>

      <div className={`${styles.group} ${styles.end}`}>
        <button type="button" disabled title="Coming in Stage 7">
          Import
        </button>
        <button type="button" disabled title="Coming in Stage 7">
          Export
        </button>
        <button type="button" disabled title="Coming in Stage 8">
          Settings
        </button>
      </div>
    </header>
  );
}
