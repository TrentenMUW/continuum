import type { ContinuumDB } from "../db";
import type { Category } from "../types";

export function listCategories(db: ContinuumDB): Promise<Category[]> {
  return db.categories.orderBy("order").toArray();
}
