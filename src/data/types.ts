// Data model from docs/SPEC.md §6.

export type Instant = string; // UTC ISO 8601, e.g. "2026-10-18T16:00:00.000Z"
export type CalDate = string; // "YYYY-MM-DD"
export type OccurrenceKey = string; // original start: Instant for timed series, CalDate for all-day series

export interface CalendarEvent {
  id: string;
  title: string;
  description?: string;
  location?: string;
  allDay: boolean;
  start?: Instant; // timed events
  end?: Instant;
  startDate?: CalDate; // all-day events; endDate is EXCLUSIVE
  endDate?: CalDate;
  timeZone: string; // IANA; the zone recurrence is expanded in
  categoryIds: string[]; // at least one
  recurrence?: {
    rrule: string;
    exdates: OccurrenceKey[];
  };
  recurrenceParentId?: string; // set on an override of one occurrence
  recurrenceId?: OccurrenceKey; // the occurrence it replaces
  source: "manual" | "ics" | "csv";
  externalUid?: string;
  importBatchId?: string;
  createdAt: Instant;
  updatedAt: Instant;
}

export interface Milestone {
  id: string;
  title: string;
  description?: string;
  targetDate: CalDate;
  completed: boolean; // manual milestones only; date-based is derived (D12)
  completedAt?: CalDate;
  completionMode: "manual" | "date-based";
  createdAt: Instant;
  updatedAt: Instant;
}

export interface Category {
  id: string;
  name: string;
  color: string;
  order: number;
  visible: boolean;
}

export interface AppSettings {
  theme: "dark" | "light";
  snapEnabled: boolean;
  snapThreshold: number;
  timeZone: string | "auto";
  defaultSpanMs: number;
  pastEventOpacity: number;
  nowMarkerPosition: number;
  weekStartsOn: 1;
}

export interface Meta {
  schemaVersion: number;
  seeded: boolean;
}

// Settings and meta are single rows in their own tables.
export interface SettingsRow extends AppSettings {
  id: "app";
}

export interface MetaRow extends Meta {
  id: "meta";
}
