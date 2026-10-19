import { useEffect, useState } from "react";
import type { Occurrence } from "../data/index";
import type { Milestone } from "../data/types";
import { backupFile, getAppState, initApp, openPanel, updateSettings, useAppState } from "../state/appStore";
import { downloadText } from "./download";
import { ErrorBoundary } from "./ErrorBoundary";
import { useLive, viewportStore } from "../state/viewportStore";
import { SidePanel } from "./Panel/SidePanel";
import { Timeline } from "./Timeline/Timeline";
import { Toolbar } from "./Toolbar/Toolbar";
import styles from "./App.module.css";

const selectEvent = (o: Occurrence) =>
  openPanel({ kind: "event", eventId: o.event.id, occurrenceKey: o.event.recurrence ? o.key : undefined });
const editCategories = () => openPanel({ kind: "categories" });
const openMilestone = (m: Milestone) => openPanel({ kind: "milestone", milestoneId: m.id });

export function App() {
  const ready = useAppState((s) => (s.status === "ready" ? s : null));
  const errorMessage = useAppState((s) => (s.status === "error" ? s.message : null));
  const status = useAppState((s) => s.status);
  const live = useLive();
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    void initApp();
  }, []);

  // Theme (D18): dark by default, light from Settings.
  const theme = ready?.settings.theme ?? "dark";
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const snapEnabled = ready?.settings.snapEnabled ?? false;
  const snapThreshold = ready?.settings.snapThreshold ?? 0.15;
  useEffect(() => viewportStore.setSnap(snapEnabled, snapThreshold), [snapEnabled, snapThreshold]);

  const toggleSnap = () => {
    const s = getAppState();
    if (s.status === "ready") void updateSettings({ snapEnabled: !s.settings.snapEnabled });
  };

  // Matches occurrenceId(): series occurrences are "id@key".
  const selectedId =
    ready?.panel.kind === "event" && ready.panel.eventId
      ? ready.panel.occurrenceKey
        ? `${ready.panel.eventId}@${ready.panel.occurrenceKey}`
        : ready.panel.eventId
      : null;

  return (
    <div className={styles.app}>
      <Toolbar
        live={live}
        ready={!!ready}
        snapEnabled={snapEnabled}
        onAddEvent={() => openPanel({ kind: "event", eventId: null })}
        onAddMilestone={() => openPanel({ kind: "milestone", milestoneId: null })}
        onImport={() => openPanel({ kind: "import" })}
        onSettings={() => openPanel({ kind: "settings" })}
        onExport={() =>
          void backupFile().then(
            ({ filename, json }) => downloadText(filename, json),
            (err: unknown) => setNotice(`The backup couldn't be created: ${err instanceof Error ? err.message : String(err)}`),
          )
        }
        onReturnToNow={() => viewportStore.returnToNow()}
        onZoomIn={() => viewportStore.zoomButton(1)}
        onZoomOut={() => viewportStore.zoomButton(-1)}
        onToggleSnap={toggleSnap}
      />
      <main className={styles.main} aria-busy={status === "loading"}>
        {status === "error" && (
          <div role="alert" className={styles.failure}>
            <h2>Continuum couldn't open its storage.</h2>
            <p>
              It keeps your data in this browser's local storage (IndexedDB). That can be blocked in some private windows or by browser
              settings that block site data. Allow site data for this page, then reload.
            </p>
            <p className={styles.detail}>{errorMessage}</p>
            <button type="button" onClick={() => location.reload()}>
              Reload
            </button>
          </div>
        )}
        {notice && (
          <p role="alert" className={styles.notice}>
            {notice}{" "}
            <button type="button" onClick={() => setNotice(null)}>
              Dismiss
            </button>
          </p>
        )}
        {ready?.benchmark && (
          <p role="note" className={styles.banner}>
            Benchmark mode: 1,000 sample events and 50 repeating series in a separate database. Your own data isn't shown or changed.
          </p>
        )}
        {ready && (
          <>
            <div className={styles.timelineArea}>
              <ErrorBoundary what="the timeline">
              <Timeline
                settings={ready.settings}
                zone={ready.zone}
                categories={ready.categories}
                milestones={ready.milestones}
                index={ready.index}
                eventsVersion={ready.eventsVersion}
                selectedId={selectedId}
                onSelectEvent={selectEvent}
                onOpenMilestone={openMilestone}
                onEditCategories={editCategories}
              />
              </ErrorBoundary>
            </div>
            <ErrorBoundary what="the side panel">
              <SidePanel state={ready} />
            </ErrorBoundary>
          </>
        )}
      </main>
    </div>
  );
}
