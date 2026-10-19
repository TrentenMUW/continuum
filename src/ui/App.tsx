import { useEffect } from "react";
import { getAppState, initApp, updateSettings, useAppState } from "../state/appStore";
import { useLive, viewportStore } from "../state/viewportStore";
import { resolveDisplayZone } from "../time/zones";
import { Timeline } from "./Timeline/Timeline";
import { Toolbar } from "./Toolbar/Toolbar";
import styles from "./App.module.css";

export function App() {
  const ready = useAppState((s) => (s.status === "ready" ? s : null));
  const errorMessage = useAppState((s) => (s.status === "error" ? s.message : null));
  const status = useAppState((s) => s.status);
  const live = useLive();

  useEffect(() => {
    void initApp();
  }, []);

  const snapEnabled = ready?.settings.snapEnabled ?? false;
  const snapThreshold = ready?.settings.snapThreshold ?? 0.15;
  useEffect(() => viewportStore.setSnap(snapEnabled, snapThreshold), [snapEnabled, snapThreshold]);

  const toggleSnap = () => {
    const s = getAppState();
    if (s.status === "ready") void updateSettings({ snapEnabled: !s.settings.snapEnabled });
  };

  return (
    <div className={styles.app}>
      <Toolbar
        live={live}
        snapEnabled={snapEnabled}
        onReturnToNow={() => viewportStore.returnToNow()}
        onZoomIn={() => viewportStore.zoomButton(1)}
        onZoomOut={() => viewportStore.zoomButton(-1)}
        onToggleSnap={toggleSnap}
      />
      <main className={styles.main} aria-busy={status === "loading"}>
        {status === "error" && (
          <p role="alert" className={styles.message}>
            Couldn't open local storage: {errorMessage}
          </p>
        )}
        {ready && (
          <Timeline
            settings={ready.settings}
            zone={resolveDisplayZone(ready.settings.timeZone)}
            categories={ready.categories}
            milestones={ready.milestones}
          />
        )}
      </main>
    </div>
  );
}
