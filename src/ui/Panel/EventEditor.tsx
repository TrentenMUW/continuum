import { useId, useState, type FormEvent } from "react";
import type { Scope } from "../../data/repo/recurrence";
import type { CalendarEvent, Category } from "../../data/types";
import {
  draftStartDate,
  draftToFields,
  NO_REPEAT,
  repeatFromRule,
  validateDraft,
  type DraftErrors,
  type EventDraft,
  type RepeatDraft,
} from "../../data/validate";
import { closePanel, deleteRecurring, removeEvent, saveEvent, saveRecurring } from "../../state/appStore";
import { addCalDays, calDateOf, fromLocalInput, parseCalDate, toLocalInput } from "../../time/calDate";
import { WEEKDAYS, type Freq, type Weekday } from "../../time/rrule";
import { HOUR_MS } from "../../time/viewport";
import styles from "./Panel.module.css";

/** The occurrence of a series that was clicked, with its own times. */
export interface OccurrenceContext {
  series: CalendarEvent;
  key: string;
  start: number;
  end: number;
}

interface EventEditorProps {
  event: CalendarEvent | null; // null: a new event
  /** Set when editing one occurrence of a series (the series itself, or an override record). */
  occurrence?: OccurrenceContext;
  categories: Category[];
  zone: string;
  now: number;
}

const SCOPE_LABELS: Record<Scope, string> = {
  this: "This occurrence",
  following: "This and following",
  all: "All occurrences",
};

const WEEKDAY_NAMES: Record<Weekday, string> = { MO: "Mon", TU: "Tue", WE: "Wed", TH: "Thu", FR: "Fri", SA: "Sat", SU: "Sun" };
const UNIT: Record<Freq, string> = { DAILY: "day", WEEKLY: "week", MONTHLY: "month", YEARLY: "year" };

/** Editor for one event (§5.6), including recurrence and the D13 edit scopes. */
export function EventEditor({ event, occurrence, categories, zone, now }: EventEditorProps) {
  const [draft, setDraft] = useState<EventDraft>(() => initialDraft(event, occurrence, zone, now));
  const [attempted, setAttempted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [pending, setPending] = useState<null | "save" | "delete">(null);
  const [scope, setScope] = useState<Scope>("this");
  const ids = useId();

  const recurring = !!occurrence;
  const errors: DraftErrors = attempted ? validateDraft(draft, zone) : {};
  const set = <K extends keyof EventDraft>(key: K, value: EventDraft[K]) => setDraft((d) => ({ ...d, [key]: value }));
  const setRepeat = (patch: Partial<RepeatDraft>) => setDraft((d) => ({ ...d, repeat: { ...d.repeat, ...patch, touched: true } }));

  // An occurrence can't carry its own rule, so a changed rule rules out "this occurrence".
  const scopes: Scope[] = draft.repeat.touched ? ["following", "all"] : ["this", "following", "all"];

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

  const chooseFreq = (freq: RepeatDraft["freq"]) =>
    setDraft((d) => {
      const weekdays = freq === "WEEKLY" && d.repeat.weekdays.length === 0 ? [weekdayOf(draftStartDate(d))].filter(Boolean) as Weekday[] : d.repeat.weekdays;
      return { ...d, repeat: { ...d.repeat, freq, weekdays, touched: true, custom: false } };
    });

  const run = async (action: () => Promise<unknown>) => {
    setSaving(true);
    setSaveError(null);
    try {
      await action();
      closePanel();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
      setPending(null);
    }
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    setAttempted(true);
    if (Object.keys(validateDraft(draft, zone)).length > 0) return;
    if (recurring) {
      setScope(scopes[0]!);
      setPending("save");
      return;
    }
    void run(() => saveEvent(event?.id ?? null, draftToFields(draft, zone)));
  };

  const confirmScope = () => {
    if (!event) return;
    if (pending === "save") void run(() => saveRecurring(event.id, occurrence?.key, draftToFields(draft, zone), scope));
    if (pending === "delete") void run(() => deleteRecurring(event.id, occurrence?.key, scope));
  };

  const field = (name: string) => `${ids}-${name}`;
  const errorId = (name: keyof DraftErrors) => (errors[name] ? `${ids}-${name}-error` : undefined);
  const r = draft.repeat;

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
        <input type="checkbox" checked={draft.allDay} disabled={recurring} onChange={(e) => toggleAllDay(e.target.checked)} />
        All day
        {recurring && <span className={styles.muted}> (fixed for a repeating event)</span>}
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

      <fieldset className={styles.fieldset} aria-describedby={errorId("repeat")}>
        <legend>Repeat</legend>
        {r.custom && !r.touched ? (
          <>
            <p className={styles.muted}>Custom rule: {r.original}</p>
            <div className={styles.actions}>
              <button type="button" onClick={() => setRepeat({ custom: false })}>
                Replace with a simple rule
              </button>
            </div>
          </>
        ) : (
          <>
            <select aria-label="Repeat" value={r.freq} onChange={(e) => chooseFreq(e.target.value as RepeatDraft["freq"])}>
              <option value="NONE">Does not repeat</option>
              <option value="DAILY">Daily</option>
              <option value="WEEKLY">Weekly</option>
              <option value="MONTHLY">Monthly</option>
              <option value="YEARLY">Yearly</option>
            </select>
            {r.freq !== "NONE" && (
              <>
                <label className={styles.inline}>
                  Every
                  <input
                    className={styles.short}
                    inputMode="numeric"
                    aria-label="Repeat every"
                    value={r.interval}
                    onChange={(e) => setRepeat({ interval: e.target.value })}
                  />
                  {UNIT[r.freq]}
                  {r.interval.trim() === "1" ? "" : "s"}
                </label>
                {r.freq === "WEEKLY" && (
                  <div className={styles.weekdays} role="group" aria-label="On days">
                    {WEEKDAYS.map((w) => (
                      <label key={w} className={styles.weekday}>
                        <input
                          type="checkbox"
                          checked={r.weekdays.includes(w)}
                          onChange={(e) => setRepeat({ weekdays: e.target.checked ? [...r.weekdays, w] : r.weekdays.filter((x) => x !== w) })}
                        />
                        {WEEKDAY_NAMES[w]}
                      </label>
                    ))}
                  </div>
                )}
                {r.freq === "MONTHLY" && draftStartDate(draft) && (
                  <p className={styles.muted}>On day {parseCalDateSafe(draftStartDate(draft))} of the month (months without it are skipped).</p>
                )}
                <div role="radiogroup" aria-label="Ends" className={styles.ends}>
                  <label className={styles.check}>
                    <input type="radio" name={field("ends")} checked={r.ends === "never"} onChange={() => setRepeat({ ends: "never" })} />
                    Never ends
                  </label>
                  <label className={styles.check}>
                    <input type="radio" name={field("ends")} checked={r.ends === "on"} onChange={() => setRepeat({ ends: "on", untilDate: r.untilDate || draftStartDate(draft) })} />
                    Ends on
                    <input type="date" aria-label="Ends on date" value={r.untilDate} disabled={r.ends !== "on"} onChange={(e) => setRepeat({ untilDate: e.target.value })} />
                  </label>
                  <label className={styles.check}>
                    <input type="radio" name={field("ends")} checked={r.ends === "after"} onChange={() => setRepeat({ ends: "after" })} />
                    Ends after
                    <input className={styles.short} inputMode="numeric" aria-label="Number of occurrences" value={r.count} disabled={r.ends !== "after"} onChange={(e) => setRepeat({ count: e.target.value })} />
                    times
                  </label>
                </div>
              </>
            )}
          </>
        )}
        {errors.repeat && <p id={errorId("repeat")} className={styles.error}>{errors.repeat}</p>}
      </fieldset>

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

      {pending === "delete" && !recurring ? (
        <div className={styles.confirm} role="alertdialog" aria-label="Confirm delete">
          <p>Delete “{event?.title}”? This can't be undone.</p>
          <div className={styles.actions}>
            <button type="button" className={styles.danger} onClick={() => event && void run(() => removeEvent(event.id))} autoFocus>
              Delete event
            </button>
            <button type="button" onClick={() => setPending(null)}>
              Keep it
            </button>
          </div>
        </div>
      ) : pending ? (
        <div className={pending === "delete" ? styles.confirm : styles.scope} role="group" aria-label={pending === "delete" ? "Delete which occurrences" : "Save to which occurrences"}>
          <p>{pending === "delete" ? `Delete “${draft.title || event?.title}”:` : "Apply these changes to:"}</p>
          {(pending === "delete" ? (["this", "following", "all"] as Scope[]) : scopes).map((s) => (
            <label key={s} className={styles.check}>
              <input type="radio" name={field("scope")} checked={scope === s} onChange={() => setScope(s)} />
              {SCOPE_LABELS[s]}
            </label>
          ))}
          <div className={styles.actions}>
            <button type="button" className={pending === "delete" ? styles.danger : styles.primary} onClick={confirmScope} disabled={saving} autoFocus>
              {pending === "delete" ? "Delete" : "Save"}
            </button>
            <button type="button" onClick={() => setPending(null)}>
              Back
            </button>
          </div>
        </div>
      ) : (
        <div className={styles.actions}>
          <button type="submit" className={styles.primary} disabled={saving}>
            {event ? "Save" : "Add event"}
          </button>
          <button type="button" onClick={closePanel}>
            Cancel
          </button>
          {event && (
            <button
              type="button"
              className={styles.danger}
              onClick={() => {
                setScope("this");
                setPending("delete");
              }}
            >
              Delete
            </button>
          )}
        </div>
      )}

    </form>
  );
}

function parseCalDateSafe(d: string): number | string {
  try {
    return parseCalDate(d).day;
  } catch {
    return "?";
  }
}

function weekdayOf(date: string): Weekday | undefined {
  try {
    const { year, month, day } = parseCalDate(date);
    return (["SU", "MO", "TU", "WE", "TH", "FR", "SA"] as const)[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
  } catch {
    return undefined;
  }
}

function initialDraft(event: CalendarEvent | null, occ: OccurrenceContext | undefined, zone: string, now: number): EventDraft {
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
    repeat: { ...NO_REPEAT },
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
    // An override shows its series' rule, which "following" and "all" edits would change.
    repeat: repeatFromRule((occ?.series ?? event).recurrence?.rrule, zone),
  };
  if (event.allDay) {
    // A series occurrence shows its own dates; an override or one-off shows its stored ones.
    const startDate = occ && event.recurrence ? occ.key : event.startDate ?? "";
    const lengthDays = event.startDate && event.endDate ? dayDiff(event.startDate, event.endDate) : 1;
    return { ...common, startDate, endDate: addCalDays(startDate, Math.max(1, lengthDays) - 1) };
  }
  const start = occ && event.recurrence ? occ.start : event.start ? Date.parse(event.start) : now;
  const end = occ && event.recurrence ? occ.end : event.end ? Date.parse(event.end) : now;
  return { ...common, startLocal: toLocalInput(start, zone), endLocal: toLocalInput(end, zone) };
}

function dayDiff(a: string, b: string): number {
  const x = parseCalDate(a);
  const y = parseCalDate(b);
  return Math.round((Date.UTC(y.year, y.month - 1, y.day) - Date.UTC(x.year, x.month - 1, x.day)) / 86_400_000);
}
