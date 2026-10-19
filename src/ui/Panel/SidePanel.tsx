import { useEffect } from "react";
import { closePanel, type ReadyState } from "../../state/appStore";
import { viewportStore } from "../../state/viewportStore";
import { CategoryManager } from "./CategoryManager";
import { EventEditor } from "./EventEditor";
import styles from "./Panel.module.css";

/** The collapsible side panel (§5.6): event editor or category manager. */
export function SidePanel({ state }: { state: ReadyState }) {
  const { panel } = state;

  useEffect(() => {
    if (panel.kind === "none") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closePanel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [panel.kind]);

  if (panel.kind === "none") return null;

  const event = panel.kind === "event" && panel.eventId ? (state.events.get(panel.eventId) ?? null) : null;
  const title = panel.kind === "categories" ? "Categories" : event ? "Edit event" : "New event";

  return (
    <aside className={styles.panel} aria-label={title}>
      <header className={styles.header}>
        <h2>{title}</h2>
        <button type="button" className={styles.close} aria-label="Close panel" onClick={closePanel}>
          ×
        </button>
      </header>
      <div className={styles.body}>
        {panel.kind === "event" && (
          // Remount per event so the form starts from that event's values.
          <EventEditor
            key={panel.eventId ?? "new"}
            event={event}
            categories={state.categories}
            zone={state.zone}
            now={viewportStore.now()}
          />
        )}
        {panel.kind === "categories" && <CategoryManager categories={state.categories} events={state.events} />}
      </div>
    </aside>
  );
}
