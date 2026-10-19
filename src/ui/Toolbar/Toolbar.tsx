import styles from "./Toolbar.module.css";

interface ToolbarProps {
  live: boolean;
  ready: boolean;
  snapEnabled: boolean;
  onAddEvent: () => void;
  onAddMilestone: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onToggleSnap: () => void;
  onReturnToNow: () => void;
  onImport: () => void;
  onExport: () => void;
  onSettings: () => void;
}

/** §5.11 toolbar. Controls are disabled until the data has loaded. */
export function Toolbar({
  live,
  ready,
  snapEnabled,
  onAddEvent,
  onAddMilestone,
  onZoomIn,
  onZoomOut,
  onToggleSnap,
  onReturnToNow,
  onImport,
  onExport,
  onSettings,
}: ToolbarProps) {
  return (
    <header className={styles.toolbar} role="toolbar" aria-label="Continuum controls">
      <h1 className={styles.title}>Continuum</h1>

      <div className={styles.group}>
        <button type="button" className={styles.primary} disabled={!ready} onClick={onAddEvent}>
          Add Event
        </button>
        <button type="button" disabled={!ready} onClick={onAddMilestone}>
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
        <button type="button" disabled={!ready} onClick={onImport} title="Import .ics or .csv, or restore a backup">
          Import
        </button>
        <button type="button" disabled={!ready} onClick={onExport} title="Download a full JSON backup">
          Export
        </button>
        <button type="button" disabled={!ready} onClick={onSettings}>
          Settings
        </button>
      </div>
    </header>
  );
}
