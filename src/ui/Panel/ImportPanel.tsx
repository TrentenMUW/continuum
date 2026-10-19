import { TZDate } from "@date-fns/tz";
import { format } from "date-fns";
import { useId, useState, type ChangeEvent } from "react";
import { checkBackup, type Backup } from "../../data/backup";
import { CSV_EXAMPLE, parseCsv, type CsvParse } from "../../import/csv";
import { ImportError, parseIcs } from "../../import/ics";
import { buildCsvPlan, buildIcsPlan, type ImportPlan, type Outcome } from "../../import/preview";
import { closePanel, importCsv, importIcs, restoreFrom, type ReadyState } from "../../state/appStore";
import styles from "./Panel.module.css";

type Stage =
  | { kind: "pick" }
  | { kind: "ics"; fileName: string; plan: ImportPlan }
  | { kind: "csv"; fileName: string; parse: CsvParse; plan: ImportPlan }
  | { kind: "json"; fileName: string; backup: Backup; counts: { events: number; categories: number; milestones: number } }
  | { kind: "done"; message: string };

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

const OUTCOME_LABEL: Record<Outcome, string> = { new: "New", updated: "Updated", unchanged: "Unchanged", skipped: "Skipped" };

/** Import .ics or .csv with a preview before anything is written, or restore a JSON backup (§5.8–5.10). */
export function ImportPanel({ state }: { state: ReadyState }) {
  const [stage, setStage] = useState<Stage>({ kind: "pick" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const misc = state.categories.find((c) => c.name === "Miscellaneous") ?? state.categories[state.categories.length - 1];
  const [categoryId, setCategoryId] = useState(misc?.id ?? "");
  const [unknownMode, setUnknownMode] = useState<"create" | "misc">("create");
  const [confirmed, setConfirmed] = useState(false);
  const ids = useId();

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // choosing the same file again still fires
    if (!file) return;
    setError(null);
    setConfirmed(false);
    const text = await file.text();
    const ext = file.name.toLowerCase().split(".").pop();
    try {
      if (ext === "ics") {
        setStage({ kind: "ics", fileName: file.name, plan: buildIcsPlan(parseIcs(text, state.zone), state.events.values(), state.zone) });
      } else if (ext === "csv") {
        const parse = parseCsv(text, state.categories, state.zone);
        setStage({ kind: "csv", fileName: file.name, parse, plan: buildCsvPlan(parse, state.zone) });
      } else if (ext === "json") {
        const check = checkBackup(text);
        if (!check.ok) throw new ImportError(check.error);
        setStage({ kind: "json", fileName: file.name, backup: check.backup, counts: check.counts });
      } else {
        throw new ImportError("Choose an .ics, .csv, or Continuum backup (.json) file.");
      }
    } catch (err) {
      setStage({ kind: "pick" });
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const run = async (action: () => Promise<void>, message: string) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      setStage({ kind: "done", message });
    } catch (err) {
      // Imports and restores run in one transaction, so a failure changed nothing.
      setError(`Nothing was changed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  };

  const fmt = (t: number) => format(new TZDate(t, state.zone), "d MMM yyyy");

  const planSummary = (plan: ImportPlan) => (
    <>
      <table className={styles.counts}>
        <tbody>
          {(Object.keys(OUTCOME_LABEL) as Outcome[]).map((o) => (
            <tr key={o}>
              <th scope="row">{OUTCOME_LABEL[o]}</th>
              <td>{plan.counts[o]}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {plan.range && (
        <p className={styles.muted}>
          From {fmt(plan.range.start)} to {fmt(plan.range.end)}
          {plan.range.openEnded && ", and some events repeat with no end"}
        </p>
      )}
      {plan.sample.length > 0 && (
        <div className={styles.field}>
          <span className={styles.label}>For example</span>
          <ul className={styles.sample}>
            {plan.sample.map((i, k) => (
              <li key={k}>
                <strong>{i.title}</strong>
                {i.start !== undefined && <span className={styles.muted}> · {fmt(i.start)}</span>}
                {i.outcome === "updated" && <span className={styles.muted}> (updated{i.reason ? `: ${i.reason}` : ""})</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
      {plan.counts.skipped > 0 && (
        <details>
          <summary>Why {plan.counts.skipped} {plan.counts.skipped === 1 ? "was" : "were"} skipped</summary>
          <ul className={styles.sample}>
            {plan.items
              .filter((i) => i.outcome === "skipped")
              .map((i, k) => (
                <li key={k}>
                  <strong>{i.title}</strong>: {i.reason}
                </li>
              ))}
          </ul>
        </details>
      )}
      {plan.warnings.length > 0 && (
        <ul className={styles.warnings}>
          {plan.warnings.map((w, k) => (
            <li key={k}>{w}</li>
          ))}
        </ul>
      )}
    </>
  );

  return (
    <div className={styles.form}>
      {stage.kind !== "done" && (
        <div className={styles.field}>
          <label htmlFor={`${ids}-file`}>Choose a file</label>
          <input id={`${ids}-file`} type="file" accept=".ics,.csv,.json,text/calendar,text/csv,application/json" onChange={onFile} />
          <p className={styles.muted}>
            A calendar export (.ics), a spreadsheet (.csv), or a Continuum backup (.json). Nothing is saved until you confirm.
          </p>
        </div>
      )}

      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}

      {stage.kind === "pick" && (
        <details>
          <summary>CSV format</summary>
          <pre className={styles.code}>{CSV_EXAMPLE}</pre>
          <p className={styles.muted}>
            Timed rows use ISO 8601 with an offset. All-day rows use YYYY-MM-DD with an inclusive end, which may be empty for one day.
            Separate categories with “;”. The rrule column is optional.
          </p>
        </details>
      )}

      {stage.kind === "ics" && (
        <section aria-label="Import preview" className={styles.form}>
          <h3 className={styles.subhead}>{stage.fileName}</h3>
          {planSummary(stage.plan)}
          <div className={styles.field}>
            <label htmlFor={`${ids}-cat`}>Put new events in</label>
            <select id={`${ids}-cat`} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              {state.categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <p className={styles.muted}>Updated events keep the categories they already have.</p>
          </div>
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.primary}
              disabled={busy || stage.plan.counts.new + stage.plan.counts.updated === 0}
              onClick={() =>
                void run(
                  () => importIcs(stage.plan, categoryId),
                  `Imported ${stage.plan.counts.new} new and ${stage.plan.counts.updated} updated. ${stage.plan.counts.unchanged} unchanged, ${stage.plan.counts.skipped} skipped.`,
                )
              }
            >
              Import
            </button>
            <button type="button" onClick={closePanel}>
              Cancel
            </button>
          </div>
        </section>
      )}

      {stage.kind === "csv" && (
        <section aria-label="Import preview" className={styles.form}>
          <h3 className={styles.subhead}>{stage.fileName}</h3>
          {stage.parse.errors.length > 0 ? (
            <>
              <p className={styles.error}>
                {stage.parse.errors.length} {stage.parse.errors.length === 1 ? "row has a problem" : "rows have problems"}, so nothing will be
                imported. Fix the file and choose it again.
              </p>
              <ul className={styles.warnings} aria-label="Row errors">
                {stage.parse.errors.map((e, k) => (
                  <li key={k}>
                    Row {e.row}: {e.message}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <>
              {planSummary(stage.plan)}
              {stage.parse.unknownCategories.length > 0 && (
                <fieldset className={styles.fieldset}>
                  <legend>Unknown categories: {stage.parse.unknownCategories.join(", ")}</legend>
                  <label className={styles.check}>
                    <input type="radio" name={`${ids}-unknown`} checked={unknownMode === "create"} onChange={() => setUnknownMode("create")} />
                    Create them as new categories
                  </label>
                  <label className={styles.check}>
                    <input type="radio" name={`${ids}-unknown`} checked={unknownMode === "misc"} onChange={() => setUnknownMode("misc")} />
                    Put those events in Miscellaneous
                  </label>
                </fieldset>
              )}
              <div className={styles.actions}>
                <button
                  type="button"
                  className={styles.primary}
                  disabled={busy || stage.parse.rows.length === 0}
                  onClick={() => void run(() => importCsv(stage.parse, unknownMode), `Imported ${plural(stage.parse.rows.length, "event")}.`)}
                >
                  Import
                </button>
                <button type="button" onClick={closePanel}>
                  Cancel
                </button>
              </div>
            </>
          )}
        </section>
      )}

      {stage.kind === "json" && (
        <section aria-label="Restore preview" className={styles.form}>
          <h3 className={styles.subhead}>{stage.fileName}</h3>
          <p>
            Backup from {format(new Date(stage.backup.exportedAt), "d MMM yyyy, HH:mm")}: {plural(stage.counts.events, "event")},{" "}
            {plural(stage.counts.categories, "category", "categories")}, {plural(stage.counts.milestones, "milestone")}.
          </p>
          <div className={styles.confirm}>
            <p>Restoring replaces everything you have now: every event, category, milestone, and setting.</p>
            <label className={styles.check}>
              <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />I understand. Replace all my data.
            </label>
            <div className={styles.actions}>
              <button
                type="button"
                className={styles.danger}
                disabled={!confirmed || busy}
                onClick={() => void run(() => restoreFrom(stage.backup), "Your data was restored from the backup.")}
              >
                Restore backup
              </button>
              <button type="button" onClick={closePanel}>
                Cancel
              </button>
            </div>
          </div>
        </section>
      )}

      {stage.kind === "done" && (
        <>
          <p role="status">{stage.message}</p>
          <div className={styles.actions}>
            <button type="button" className={styles.primary} onClick={closePanel}>
              Done
            </button>
            <button type="button" onClick={() => setStage({ kind: "pick" })}>
              Import another file
            </button>
          </div>
        </>
      )}
    </div>
  );
}
