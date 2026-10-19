import type { AppSettings, Category, Milestone } from "./types";

export const DAY_MS = 24 * 60 * 60 * 1000;

export const DEFAULT_SETTINGS: AppSettings = {
  theme: "dark",
  snapEnabled: false,
  snapThreshold: 0.15,
  timeZone: "auto",
  defaultSpanMs: 3 * DAY_MS, // a span length for the initial zoom, not a calendar duration
  pastEventOpacity: 0.35,
  nowMarkerPosition: 0.25,
  weekStartsOn: 1,
};

/** SPEC §5.4, in lane order. */
export const DEFAULT_CATEGORIES: ReadonlyArray<Pick<Category, "name" | "color">> = [
  { name: "Sleep & Rest", color: "#6F86C9" },
  { name: "Work & Career", color: "#E0A040" },
  { name: "Education", color: "#9B7FDB" },
  { name: "Health & Exercise", color: "#3DB5A0" },
  { name: "Hobbies & Recreation", color: "#E07AAE" },
  { name: "Social & Relationships", color: "#E8806A" },
  { name: "Life & Logistics", color: "#8A9AB0" },
  { name: "Miscellaneous", color: "#9A9A9A" },
];

/** D2: the only seeded milestone. */
export const SEED_MILESTONE: Pick<Milestone, "title" | "targetDate" | "completed" | "completionMode"> = {
  title: "65th Birthday / Retirement",
  targetDate: "2065-01-01",
  completed: false,
  completionMode: "date-based",
};
