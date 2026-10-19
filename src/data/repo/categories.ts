import type { ContinuumDB } from "../db";
import type { Category } from "../types";

export function listCategories(db: ContinuumDB): Promise<Category[]> {
  return db.categories.orderBy("order").toArray();
}

export async function createCategory(db: ContinuumDB, name: string, color: string): Promise<Category> {
  return db.transaction("rw", db.categories, async () => {
    const last = await db.categories.orderBy("order").last();
    const category: Category = { id: crypto.randomUUID(), name: name.trim(), color, order: (last?.order ?? 0) + 1, visible: true };
    await db.categories.add(category);
    return category;
  });
}

export async function updateCategory(
  db: ContinuumDB,
  id: string,
  patch: Partial<Pick<Category, "name" | "color" | "visible">>,
): Promise<void> {
  const clean = { ...patch, ...(patch.name !== undefined ? { name: patch.name.trim() } : {}) };
  const changed = await db.categories.update(id, clean);
  if (changed === 0 && !(await db.categories.get(id))) throw new Error(`No category ${id}`);
}

/** Swap a category with its neighbor above (-1) or below (+1) in lane order. */
export async function moveCategory(db: ContinuumDB, id: string, direction: -1 | 1): Promise<void> {
  await db.transaction("rw", db.categories, async () => {
    const all = await db.categories.orderBy("order").toArray();
    const i = all.findIndex((c) => c.id === id);
    const j = i + direction;
    if (i < 0 || j < 0 || j >= all.length) return;
    const a = all[i]!;
    const b = all[j]!;
    await db.categories.update(a.id, { order: b.order });
    await db.categories.update(b.id, { order: a.order });
  });
}

export async function countEventsInCategory(db: ContinuumDB, id: string): Promise<number> {
  return db.events.where("categoryIds").equals(id).count();
}

/**
 * Delete a category (§5.4). If events still use it, `moveEventsTo` must name another
 * category; those events get it in place of the deleted one. Runs in one transaction.
 */
export async function deleteCategory(db: ContinuumDB, id: string, moveEventsTo?: string): Promise<void> {
  await db.transaction("rw", [db.categories, db.events], async () => {
    const users = await db.events.where("categoryIds").equals(id).toArray();
    if (users.length > 0) {
      if (!moveEventsTo || moveEventsTo === id) {
        throw new Error("This category still has events. Choose where to move them.");
      }
      if (!(await db.categories.get(moveEventsTo))) throw new Error("The target category doesn't exist.");
      const stamp = new Date().toISOString();
      for (const e of users) {
        const ids = e.categoryIds.map((c) => (c === id ? moveEventsTo : c));
        await db.events.update(e.id, { categoryIds: [...new Set(ids)], updatedAt: stamp });
      }
    }
    await db.categories.delete(id);
  });
}
