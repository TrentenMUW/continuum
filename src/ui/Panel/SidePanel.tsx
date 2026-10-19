import { useEffect } from "react";
import { closePanel, recurringTarget, type ReadyState } from "../../state/appStore";
import { viewportStore } from "../../state/viewportStore";
import { startOfCalDate } from "../../time/calDate";
import { expandSeries } from "../../time/recurrence";
import { CategoryManager } from "./CategoryManager";
import { EventEditor, type OccurrenceContext } from "./EventEditor";
import styles from "./Panel.module.css";

const DAY_MS = 86_400_000;

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
  const occurrence = panel.kind === "event" && panel.eventId ? occurrenceContext(state, panel.eventId, panel.occurrenceKey) : undefined;
  const title =
    panel.kind === "categories" ? "Categories" : occurrence ? "Edit repeating event" : event ? "Edit event" : "New event";

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
          // Remount per event and occurrence so the form starts from that one's values.
          <EventEditor
            key={`${panel.eventId ?? "new"}@${panel.occurrenceKey ?? ""}`}
            event={event}
            occurrence={occurrence}
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

/** The clicked occurrence of a series (or the series behind an override), with its own times. */
function occurrenceContext(state: ReadyState, eventId: string, occurrenceKey?: string): OccurrenceContext | undefined {
  const target = recurringTarget(state, eventId, occurrenceKey);
  if (!target) return undefined;
  const { series, key } = target;
  const around = series.allDay ? startOfCalDate(key, state.zone) : Date.parse(key);
  const found = expandSeries(series, around - 2 * DAY_MS, around + 2 * DAY_MS, state.zone).find((o) => o.key === key);
  const self = state.events.get(eventId)!;
  const start = found?.start ?? (self.start ? Date.parse(self.start) : around);
  const end = found?.end ?? (self.end ? Date.parse(self.end) : around);
  return { series, key, start, end };
}
