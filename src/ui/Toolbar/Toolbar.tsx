import styles from "./Toolbar.module.css";

interface ToolbarProps {
  live: boolean;
  snapEnabled: boolean;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onToggleSnap: () => void;
  onReturnToNow: () => void;
}

/** §5.11 toolbar. Controls are disabled until the stage that implements them. */
export function Toolbar({ live, snapEnabled, onZoomIn, onZoomOut, onToggleSnap, onReturnToNow }: ToolbarProps) {
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
        <span
          className={live ? styles.liveOn : styles.liveOff}
          role="status"
          aria-label={live ? "Live: following now" : "Live: off"}
        >
          LIVE
        </span>
        <button type="button" title="Return to Now (N)" onClick={onReturnToNow} disabled={live}>
          Return to Now
        </button>
      </div>

      <div className={styles.group}>
        <button type="button" aria-label="Zoom out" title="Zoom out (−)" onClick={onZoomOut}>
          −
        </button>
        <button type="button" aria-label="Zoom in" title="Zoom in (+)" onClick={onZoomIn}>
          +
        </button>
        <button
          type="button"
          aria-pressed={snapEnabled}
          className={snapEnabled ? styles.toggleOn : undefined}
          title="Snap zoom to a day, week, month, or year"
          onClick={onToggleSnap}
        >
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
