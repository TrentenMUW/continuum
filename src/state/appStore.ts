import { useSyncExternalStore } from "react";
import { getDb, type ContinuumDB } from "../data/db";
import { listCategories } from "../data/repo/categories";
import { listMilestones } from "../data/repo/milestones";
import { loadSettings, saveSettings } from "../data/repo/settings";
import { seedIfNeeded } from "../data/seed";
import type { AppSettings, Category, Milestone } from "../data/types";

export type AppState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; settings: AppSettings; categories: Category[]; milestones: Milestone[] };

type Listener = () => void;

let state: AppState = { status: "loading" };
const listeners = new Set<Listener>();

function setState(next: AppState): void {
  state = next;
  for (const l of listeners) l();
}

export function getAppState(): AppState {
  return state;
}

export function subscribeApp(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useAppState<T>(selector: (s: AppState) => T): T {
  return useSyncExternalStore(subscribeApp, () => selector(state));
}

let initPromise: Promise<void> | undefined;
let activeDb: ContinuumDB | undefined;

/** Open the database, seed on first run (D2), and load settings and records. Idempotent. */
export function initApp(db: ContinuumDB = getDb()): Promise<void> {
  activeDb ??= db;
  initPromise ??= (async () => {
    try {
      await seedIfNeeded(db);
      const [settings, categories, milestones] = await Promise.all([
        loadSettings(db),
        listCategories(db),
        listMilestones(db),
      ]);
      setState({ status: "ready", settings, categories, milestones });
    } catch (err) {
      setState({ status: "error", message: err instanceof Error ? err.message : String(err) });
    }
  })();
  return initPromise;
}

/** Apply a settings change in memory and persist it. */
export async function updateSettings(patch: Partial<AppSettings>): Promise<void> {
  if (state.status !== "ready" || !activeDb) return;
  setState({ ...state, settings: { ...state.settings, ...patch } });
  await saveSettings(activeDb, patch);
}

/** Test helper: forget loaded state so initApp can run again against another database. */
export function resetAppStoreForTests(): void {
  state = { status: "loading" };
  initPromise = undefined;
  activeDb = undefined;
  listeners.clear();
}
