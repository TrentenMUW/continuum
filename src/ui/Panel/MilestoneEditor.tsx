import { useId, useState, type FormEvent } from "react";
import type { Milestone } from "../../data/types";
import { closePanel, removeMilestone, saveMilestone } from "../../state/appStore";
import { calDateOf, isCalDate } from "../../time/calDate";
import { isMilestoneComplete } from "../../time/milestones";
import styles from "./Panel.module.css";

interface MilestoneEditorProps {
  milestone: Milestone | null; // null: a new milestone
  zone: string;
  now: number;
}

/** Add or edit a milestone (§5.7): a zero-duration gateway on a calendar day. */
export function MilestoneEditor({ milestone, zone, now }: MilestoneEditorProps) {
  const today = calDateOf(now, zone);
  const [title, setTitle] = useState(milestone?.title ?? "");
  const [targetDate, setTargetDate] = useState(milestone?.targetDate ?? today);
  const [description, setDescription] = useState(milestone?.description ?? "");
  const [mode, setMode] = useState<Milestone["completionMode"]>(milestone?.completionMode ?? "manual");
  const [completed, setCompleted] = useState(milestone?.completed ?? false);
  const [attempted, setAttempted] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ids = useId();

  const errors = {
    title: attempted && !title.trim() ? "Enter a title." : undefined,
    date: attempted && !isCalDate(targetDate) ? "Enter a date." : undefined,
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setAttempted(true);
    if (!title.trim() || !isCalDate(targetDate)) return;
    try {
      await saveMilestone(milestone?.id ?? null, {
        title: title.trim(),
        targetDate,
        description: description.trim() || undefined,
        completionMode: mode,
        completed: mode === "manual" && completed,
        // Keep the original completion date if it was already complete.
        completedAt: mode === "manual" && completed ? (milestone?.completed ? milestone.completedAt : today) : undefined,
      });
      closePanel();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const derived = isCalDate(targetDate) && isMilestoneComplete({ ...(milestone ?? emptyMilestone), targetDate, completionMode: "date-based" }, today);
  const field = (name: string) => `${ids}-${name}`;

  return (
    <form className={styles.form} onSubmit={onSubmit} noValidate>
      <div className={styles.field}>
        <label htmlFor={field("title")}>Title</label>
        <input id={field("title")} value={title} onChange={(e) => setTitle(e.target.value)} aria-invalid={!!errors.title} autoFocus />
        {errors.title && <p className={styles.error}>{errors.title}</p>}
      </div>

      <div className={styles.field}>
        <label htmlFor={field("date")}>Date</label>
        <input id={field("date")} type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} aria-invalid={!!errors.date} />
        {errors.date && <p className={styles.error}>{errors.date}</p>}
      </div>

      <fieldset className={styles.fieldset}>
        <legend>Completes</legend>
        <label className={styles.check}>
          <input type="radio" name={field("mode")} checked={mode === "manual"} onChange={() => setMode("manual")} />
          When I mark it complete (an achievement)
        </label>
        <label className={styles.check}>
          <input type="radio" name={field("mode")} checked={mode === "date-based"} onChange={() => setMode("date-based")} />
          When its date arrives (a birthday, an anniversary)
        </label>
      </fieldset>

      {mode === "manual" ? (
        <label className={styles.check}>
          <input type="checkbox" checked={completed} onChange={(e) => setCompleted(e.target.checked)} />
          Completed
          {milestone?.completed && milestone.completedAt && completed && <span className={styles.muted}> (on {milestone.completedAt})</span>}
        </label>
      ) : (
        <p className={styles.muted}>{derived ? "Complete: its date has arrived." : "Not yet: it completes on its date."}</p>
      )}

      <div className={styles.field}>
        <label htmlFor={field("description")}>Description</label>
        <textarea id={field("description")} rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>

      {error && <p role="alert" className={styles.error}>{error}</p>}

      {confirmingDelete && milestone ? (
        <div className={styles.confirm} role="alertdialog" aria-label="Confirm delete">
          <p>Delete “{milestone.title}”? This can't be undone.</p>
          <div className={styles.actions}>
            <button type="button" className={styles.danger} onClick={() => void removeMilestone(milestone.id)} autoFocus>
              Delete milestone
            </button>
            <button type="button" onClick={() => setConfirmingDelete(false)}>
              Keep it
            </button>
          </div>
        </div>
      ) : (
        <div className={styles.actions}>
          <button type="submit" className={styles.primary}>
            {milestone ? "Save" : "Add milestone"}
          </button>
          <button type="button" onClick={closePanel}>
            Cancel
          </button>
          {milestone && (
            <button type="button" className={styles.danger} onClick={() => setConfirmingDelete(true)}>
              Delete
            </button>
          )}
        </div>
      )}
    </form>
  );
}

const emptyMilestone: Milestone = {
  id: "",
  title: "",
  targetDate: "",
  completed: false,
  completionMode: "manual",
  createdAt: "",
  updatedAt: "",
};
