import { useSyncExternalStore } from "react";
import { getDb, type ContinuumDB } from "../data/db";
import { EventIndex } from "../data/index";
import {
  createCategory,
  deleteCategory,
  listCategories,
  moveCategory,
  updateCategory,
} from "../data/repo/categories";
import { createEvent, deleteEvent, listEvents, updateEvent } from "../data/repo/events";
import { listMilestones } from "../data/repo/milestones";
import { loadSettings, saveSettings } from "../data/repo/settings";
import { seedIfNeeded } from "../data/seed";
import type { AppSettings, CalendarEvent, Category, Milestone } from "../data/types";
import { resolveDisplayZone } from "../time/zones";

export type Panel = { kind: "none" } | { kind: "event"; eventId: string | null } | { kind: "categories" };

export interface ReadyState {
  status: "ready";
  settings: AppSettings;
  zone: string;
  categories: Category[];
  milestones: Milestone[];
  events: Map<string, CalendarEvent>;
  /** In-memory interval index (D4); patched in place, so `eventsVersion` signals changes. */
  index: EventIndex;
  eventsVersion: number;
  panel: Panel;
}

export type AppState = { status: "loading" } | { status: "error"; message: string } | ReadyState;

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
let persistRequested = false;

/** Open the database, seed on first run (D2), and load settings and records. Idempotent. */
export function initApp(db: ContinuumDB = getDb()): Promise<void> {
  activeDb ??= db;
  initPromise ??= (async () => {
    try {
      await seedIfNeeded(db);
      const [settings, categories, milestones, events] = await Promise.all([
        loadSettings(db),
        listCategories(db),
        listMilestones(db),
        listEvents(db),
      ]);
      const zone = resolveDisplayZone(settings.timeZone);
      setState({
        status: "ready",
        settings,
        zone,
        categories,
        milestones,
        events: new Map(events.map((e) => [e.id, e])),
        index: new EventIndex(events, zone),
        eventsVersion: 0,
        panel: { kind: "none" },
      });
    } catch (err) {
      setState({ status: "error", message: err instanceof Error ? err.message : String(err) });
    }
  })();
  return initPromise;
}

function ready(): { s: ReadyState; db: ContinuumDB } {
  if (state.status !== "ready" || !activeDb) throw new Error("The app isn't ready yet.");
  return { s: state, db: activeDb };
}

/** Apply a settings change in memory and persist it. */
export async function updateSettings(patch: Partial<AppSettings>): Promise<void> {
  if (state.status !== "ready" || !activeDb) return;
  const settings = { ...state.settings, ...patch };
  const zone = resolveDisplayZone(settings.timeZone);
  if (zone === state.zone) {
    setState({ ...state, settings });
  } else {
    // All-day events resolve in the display zone, so the index is rebuilt for the new one.
    setState({
      ...state,
      settings,
      zone,
      index: new EventIndex([...state.events.values()], zone),
      eventsVersion: state.eventsVersion + 1,
    });
  }
  await saveSettings(activeDb, patch);
}

export function openPanel(panel: Panel): void {
  if (state.status === "ready") setState({ ...state, panel });
}

export function closePanel(): void {
  openPanel({ kind: "none" });
}

/** D16: ask for durable storage once, after the first user-created data is saved. */
function requestPersistence(): void {
  if (persistRequested) return;
  persistRequested = true;
  void navigator.storage?.persist?.().catch(() => undefined);
}

type EventFields = Omit<CalendarEvent, "id" | "createdAt" | "updatedAt" | "source" | "timeZone">;

/** Create (id null) or update an event, then patch the in-memory index. Returns the saved record. */
export async function saveEvent(id: string | null, fields: EventFields): Promise<CalendarEvent> {
  const { s, db } = ready();
  const saved = id
    ? await updateEvent(db, id, fields)
    : await createEvent(db, { ...fields, source: "manual", timeZone: s.zone });
  const cur = ready().s;
  const events = new Map(cur.events).set(saved.id, saved);
  cur.index.upsert(saved);
  setState({ ...cur, events, eventsVersion: cur.eventsVersion + 1 });
  requestPersistence();
  return saved;
}

export async function removeEvent(id: string): Promise<void> {
  const { db } = ready();
  await deleteEvent(db, id);
  const cur = ready().s;
  const events = new Map(cur.events);
  events.delete(id);
  cur.index.remove(id);
  setState({ ...cur, events, eventsVersion: cur.eventsVersion + 1, panel: { kind: "none" } });
}

async function reloadCategoriesAndEvents(): Promise<void> {
  const { db } = ready();
  const [categories, events] = await Promise.all([listCategories(db), listEvents(db)]);
  const cur = ready().s;
  setState({
    ...cur,
    categories,
    events: new Map(events.map((e) => [e.id, e])),
    index: new EventIndex(events, cur.zone),
    eventsVersion: cur.eventsVersion + 1,
  });
}

async function reloadCategories(): Promise<void> {
  const { db } = ready();
  const categories = await listCategories(db);
  setState({ ...ready().s, categories });
}

export async function addCategory(name: string, color: string): Promise<void> {
  await createCategory(ready().db, name, color);
  await reloadCategories();
  requestPersistence();
}

export async function editCategory(id: string, patch: Partial<Pick<Category, "name" | "color" | "visible">>): Promise<void> {
  await updateCategory(ready().db, id, patch);
  await reloadCategories();
}

export async function reorderCategory(id: string, direction: -1 | 1): Promise<void> {
  await moveCategory(ready().db, id, direction);
  await reloadCategories();
}

export async function removeCategory(id: string, moveEventsTo?: string): Promise<void> {
  await deleteCategory(ready().db, id, moveEventsTo);
  await reloadCategoriesAndEvents();
}

/** Test helper: forget loaded state so initApp can run again against another database. */
export function resetAppStoreForTests(): void {
  state = { status: "loading" };
  initPromise = undefined;
  activeDb = undefined;
  persistRequested = false;
  listeners.clear();
}
