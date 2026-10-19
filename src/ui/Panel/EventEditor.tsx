import { useId, useState, type FormEvent } from "react";
import type { CalendarEvent, Category } from "../../data/types";
import { draftToFields, validateDraft, type DraftErrors, type EventDraft } from "../../data/validate";
import { closePanel, removeEvent, saveEvent } from "../../state/appStore";
import { addCalDays, calDateOf, fromLocalInput, toLocalInput } from "../../time/calDate";
import { HOUR_MS } from "../../time/viewport";
import styles from "./Panel.module.css";

interface EventEditorProps {
  event: CalendarEvent | null; // null: a new event
  categories: Category[];
  zone: string;
  now: number;
}

/** Editor for one event (§5.6). Recurrence arrives in Stage 5. */
export function EventEditor({ event, categories, zone, now }: EventEditorProps) {
  const [draft, setDraft] = useState<EventDraft>(() => initialDraft(event, zone, now));
  const [attempted, setAttempted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const ids = useId();

  const errors: DraftErrors = attempted ? validateDraft(draft, zone) : {};
  const set = <K extends keyof EventDraft>(key: K, value: EventDraft[K]) => setDraft((d) => ({ ...d, [key]: value }));

  const toggleAllDay = (allDay: boolean) =>
    setDraft((d) => {
      if (allDay && !d.startDate) {
        const date = d.startLocal.slice(0, 10) || calDateOf(now, zone);
        const endDate = d.endLocal.slice(0, 10) || date;
        return { ...d, allDay, startDate: date, endDate: endDate < date ? date : endDate };
      }
      if (!allDay && !d.startLocal) {
        const date = d.startDate || calDateOf(now, zone);
        return { ...d, allDay, startLocal: `${date}T09:00`, endLocal: `${date}T10:00` };
      }
      return { ...d, allDay };
    });

  const toggleCategory = (id: string, on: boolean) =>
    setDraft((d) => ({ ...d, categoryIds: on ? [...d.categoryIds, id] : d.categoryIds.filter((c) => c !== id) }));

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setAttempted(true);
    if (Object.keys(validateDraft(draft, zone)).length > 0) return;
    setSaving(true);
    setSaveError(null);
    try {
      await saveEvent(event?.id ?? null, draftToFields(draft, zone));
      closePanel();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async () => {
    if (!event) return;
    try {
      await removeEvent(event.id);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
    }
  };

  const field = (name: string) => `${ids}-${name}`;
  const errorId = (name: keyof DraftErrors) => (errors[name] ? `${ids}-${name}-error` : undefined);

  return (
    <form className={styles.form} onSubmit={onSubmit} noValidate>
      <div className={styles.field}>
        <label htmlFor={field("title")}>Title</label>
        <input
          id={field("title")}
          value={draft.title}
          onChange={(e) => set("title", e.target.value)}
          aria-invalid={!!errors.title}
          aria-describedby={errorId("title")}
          autoFocus
        />
        {errors.title && <p id={errorId("title")} className={styles.error}>{errors.title}</p>}
      </div>

      <label className={styles.check}>
        <input type="checkbox" checked={draft.allDay} onChange={(e) => toggleAllDay(e.target.checked)} />
        All day
      </label>

      <div className={styles.row}>
        <div className={styles.field}>
          <label htmlFor={field("start")}>Start</label>
          {draft.allDay ? (
            <input id={field("start")} type="date" value={draft.startDate} onChange={(e) => set("startDate", e.target.value)} aria-invalid={!!errors.start} aria-describedby={errorId("start")} />
          ) : (
            <input id={field("start")} type="datetime-local" value={draft.startLocal} onChange={(e) => set("startLocal", e.target.value)} aria-invalid={!!errors.start} aria-describedby={errorId("start")} />
          )}
          {errors.start && <p id={errorId("start")} className={styles.error}>{errors.start}</p>}
        </div>
        <div className={styles.field}>
          <label htmlFor={field("end")}>{draft.allDay ? "End (inclusive)" : "End"}</label>
          {draft.allDay ? (
            <input id={field("end")} type="date" value={draft.endDate} onChange={(e) => set("endDate", e.target.value)} aria-invalid={!!errors.end} aria-describedby={errorId("end")} />
          ) : (
            <input id={field("end")} type="datetime-local" value={draft.endLocal} onChange={(e) => set("endLocal", e.target.value)} aria-invalid={!!errors.end} aria-describedby={errorId("end")} />
          )}
          {errors.end && <p id={errorId("end")} className={styles.error}>{errors.end}</p>}
        </div>
      </div>

      <fieldset className={styles.fieldset} aria-invalid={!!errors.categories} aria-describedby={errorId("categories")}>
        <legend>Categories</legend>
        {categories.map((c) => (
          <label key={c.id} className={styles.check}>
            <input type="checkbox" checked={draft.categoryIds.includes(c.id)} onChange={(e) => toggleCategory(c.id, e.target.checked)} />
            <span className={styles.swatch} style={{ background: c.color }} aria-hidden="true" />
            {c.name}
            {!c.visible && <span className={styles.muted}> (hidden)</span>}
          </label>
        ))}
        {errors.categories && <p id={errorId("categories")} className={styles.error}>{errors.categories}</p>}
      </fieldset>

      <div className={styles.field}>
        <label htmlFor={field("location")}>Location</label>
        <input id={field("location")} value={draft.location} onChange={(e) => set("location", e.target.value)} />
      </div>

      <div className={styles.field}>
        <label htmlFor={field("description")}>Description</label>
        <textarea id={field("description")} rows={3} value={draft.description} onChange={(e) => set("description", e.target.value)} />
      </div>

      {saveError && <p role="alert" className={styles.error}>{saveError}</p>}

      <div className={styles.actions}>
        <button type="submit" className={styles.primary} disabled={saving}>
          {event ? "Save" : "Add event"}
        </button>
        <button type="button" onClick={closePanel}>
          Cancel
        </button>
        {event && !confirmingDelete && (
          <button type="button" className={styles.danger} onClick={() => setConfirmingDelete(true)}>
            Delete
          </button>
        )}
      </div>

      {event && confirmingDelete && (
        <div className={styles.confirm} role="alertdialog" aria-label="Confirm delete">
          <p>Delete “{event.title}”? This can't be undone.</p>
          <div className={styles.actions}>
            <button type="button" className={styles.danger} onClick={onDelete} autoFocus>
              Delete event
            </button>
            <button type="button" onClick={() => setConfirmingDelete(false)}>
              Keep it
            </button>
          </div>
        </div>
      )}
    </form>
  );
}

function initialDraft(event: CalendarEvent | null, zone: string, now: number): EventDraft {
  const empty: EventDraft = {
    title: "",
    allDay: false,
    startLocal: "",
    endLocal: "",
    startDate: "",
    endDate: "",
    categoryIds: [],
    description: "",
    location: "",
  };
  if (!event) {
    // The next full hour, for one hour.
    const startLocal = toLocalInput(now + HOUR_MS, zone).slice(0, 14) + "00";
    const start = fromLocalInput(startLocal, zone) ?? now;
    return { ...empty, startLocal, endLocal: toLocalInput(start + HOUR_MS, zone) };
  }
  const common = {
    ...empty,
    title: event.title,
    allDay: event.allDay,
    categoryIds: [...event.categoryIds],
    description: event.description ?? "",
    location: event.location ?? "",
  };
  if (event.allDay && event.startDate && event.endDate) {
    return { ...common, startDate: event.startDate, endDate: addCalDays(event.endDate, -1) };
  }
  return {
    ...common,
    startLocal: event.start ? toLocalInput(Date.parse(event.start), zone) : "",
    endLocal: event.end ? toLocalInput(Date.parse(event.end), zone) : "",
  };
}
