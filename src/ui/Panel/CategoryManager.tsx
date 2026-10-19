import { useId, useState, type FormEvent } from "react";
import type { CalendarEvent, Category } from "../../data/types";
import { addCategory, editCategory, removeCategory, reorderCategory } from "../../state/appStore";
import styles from "./Panel.module.css";

interface CategoryManagerProps {
  categories: Category[];
  events: Map<string, CalendarEvent>;
}

/** Create, rename, recolor, reorder, hide/show, and delete-with-reassign (§5.4). */
export function CategoryManager({ categories, events }: CategoryManagerProps) {
  const [error, setError] = useState<string | null>(null);
  const run = (p: Promise<void>) =>
    p.then(
      () => setError(null),
      (err: unknown) => setError(err instanceof Error ? err.message : String(err)),
    );

  const usage = new Map<string, number>();
  for (const e of events.values()) for (const id of e.categoryIds) usage.set(id, (usage.get(id) ?? 0) + 1);

  return (
    <div className={styles.form}>
      <ul className={styles.categoryList}>
        {categories.map((c, i) => (
          <CategoryRow
            key={c.id}
            category={c}
            first={i === 0}
            last={i === categories.length - 1}
            eventCount={usage.get(c.id) ?? 0}
            others={categories.filter((o) => o.id !== c.id)}
            run={run}
          />
        ))}
      </ul>
      {error && <p role="alert" className={styles.error}>{error}</p>}
      <NewCategory run={run} existing={categories} />
    </div>
  );
}

interface RowProps {
  category: Category;
  first: boolean;
  last: boolean;
  eventCount: number;
  others: Category[];
  run: (p: Promise<void>) => Promise<void>;
}

function CategoryRow({ category: c, first, last, eventCount, others, run }: RowProps) {
  const [name, setName] = useState(c.name);
  const [deleting, setDeleting] = useState(false);
  const [moveTo, setMoveTo] = useState(others[others.length - 1]?.id ?? "");
  const id = useId();

  const commitName = () => {
    const trimmed = name.trim();
    if (!trimmed) setName(c.name);
    else if (trimmed !== c.name) void run(editCategory(c.id, { name: trimmed }));
  };

  return (
    <li className={styles.categoryRow}>
      <div className={styles.categoryMain}>
        <input
          type="color"
          value={c.color}
          aria-label={`Color for ${c.name}`}
          onChange={(e) => void run(editCategory(c.id, { color: e.target.value }))}
        />
        <input
          className={styles.categoryName}
          value={name}
          aria-label={`Name for ${c.name}`}
          onChange={(e) => setName(e.target.value)}
          onBlur={commitName}
          onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
        />
      </div>
      <div className={styles.categoryTools}>
        <button type="button" aria-label={`Move ${c.name} up`} disabled={first} onClick={() => void run(reorderCategory(c.id, -1))}>
          ↑
        </button>
        <button type="button" aria-label={`Move ${c.name} down`} disabled={last} onClick={() => void run(reorderCategory(c.id, 1))}>
          ↓
        </button>
        <button type="button" aria-pressed={!c.visible} onClick={() => void run(editCategory(c.id, { visible: !c.visible }))}>
          {c.visible ? "Hide" : "Show"}
        </button>
        <button type="button" className={styles.danger} onClick={() => setDeleting(true)} disabled={others.length === 0}>
          Delete
        </button>
      </div>
      {deleting && (
        <div className={styles.confirm} role="alertdialog" aria-label={`Delete ${c.name}`}>
          {eventCount > 0 ? (
            <>
              <label htmlFor={`${id}-move`}>
                “{c.name}” has {eventCount} event{eventCount === 1 ? "" : "s"}. Move {eventCount === 1 ? "it" : "them"} to:
              </label>
              <select id={`${id}-move`} value={moveTo} onChange={(e) => setMoveTo(e.target.value)}>
                {others.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </>
          ) : (
            <p>Delete “{c.name}”?</p>
          )}
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.danger}
              onClick={() => void run(removeCategory(c.id, eventCount > 0 ? moveTo : undefined))}
            >
              {eventCount > 0 ? "Move and delete" : "Delete category"}
            </button>
            <button type="button" onClick={() => setDeleting(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </li>
  );
}

function NewCategory({ run, existing }: { run: (p: Promise<void>) => Promise<void>; existing: Category[] }) {
  const [name, setName] = useState("");
  const [color, setColor] = useState("#7fb8d8");
  const [error, setError] = useState<string | null>(null);
  const id = useId();

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return setError("Enter a name.");
    if (existing.some((c) => c.name.toLowerCase() === trimmed.toLowerCase())) return setError("That name is already used.");
    setError(null);
    void run(addCategory(trimmed, color)).then(() => setName(""));
  };

  return (
    <form className={styles.newCategory} onSubmit={onSubmit} noValidate>
      <label htmlFor={`${id}-name`}>New category</label>
      <div className={styles.categoryMain}>
        <input type="color" value={color} aria-label="New category color" onChange={(e) => setColor(e.target.value)} />
        <input id={`${id}-name`} className={styles.categoryName} value={name} onChange={(e) => setName(e.target.value)} aria-invalid={!!error} />
        <button type="submit">Add</button>
      </div>
      {error && <p className={styles.error}>{error}</p>}
    </form>
  );
}
