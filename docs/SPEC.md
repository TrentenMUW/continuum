# Continuum — Project Specification v1.1

A lifelong, local-first planning application that replaces the calendar grid with one continuous, horizontally navigable timeline.

**Changes from v1.0 (PDF):**
- The seed milestone is "65th Birthday / Retirement" on **January 1, 2065** (seed birthdate January 1, 2000).
- Added the assignment's process requirements: CLAUDE.md, LOG.md, stage gates, and the portfolio card.
- Added a Decisions section (§3) that settles the architecture choices v1.0 left open.
- Revised the data model (§6) for all-day events, recurrence overrides, and import identity.
- Added "Verify by hand" checklists to every stage (§9).

**Success criterion:** When you open Continuum, it shouldn't feel like looking at a calendar. It should feel like looking at the future, with every event, commitment, and milestone occupying its own real place along the same uninterrupted line.

---

## 1. Vision and principles

Time is one-dimensional, continuous, and objectively measurable, even though we experience it subjectively. An hour asleep takes up exactly as much space as an hour celebrating. Continuum puts every event on one uninterrupted axis that zooms smoothly from minutes to decades without ever switching views. It is mainly forward-looking: it can hold tomorrow's meals and workouts, graduation, career steps, milestone birthdays, and retirement. The timeline continues indefinitely past retirement into an open, largely unplanned future.

1. **Time is spatial.** Horizontal position represents time, and horizontal distance represents duration.
2. **The future is navigable.** You can explore minutes, days, years, or decades ahead.
3. **Time passes visibly.** A live Now marker stays in place while the timeline moves slowly to the left.
4. **Activities can coexist.** One event can appear in several category lanes without being duplicated in storage.
5. **Milestones are gateways.** Important accomplishments are full-height vertical markers that represent binary transitions.
6. **The future gets more detailed as it approaches.** Near-term plans can be dense while distant years stay mostly empty.
7. **Personal data stays personal.** No accounts, no backend, and no third-party calendar connections.

## 2. Process requirements (TCSS 490 Artifact 2)

- The project lives in its own public repo, `TrentenMUW/continuum`, served at `https://trentenmuw.github.io/continuum/`.
- `CLAUDE.md` holds the persistent project context. It stays short and current, and its "Current status" section is updated at the end of every session.
- `LOG.md` records what was asked and what changed, including what the AI got wrong. Every meaningful step gets an entry.
- Commit small, and commit often.
- **Stage gates:** after each stage, the agent stops and gives Trenten that stage's "Verify by hand" list (§9). Trenten checks the work himself before the next stage starts. This is how the project shows that "what the agent built actually does what you asked."
- When the work is done, Artifact 2's card on the portfolio gets a title, a link, a description, and Trenten's own reflection (see `docs/HANDOFF.md` §5).

## 3. Decisions

These override anything older. Change one only with Trenten's agreement, and log the change.

**D1. Separate repo, deployed by Actions.** The site deploys through a GitHub Actions workflow on every push to `main`. Vite's `base` is `/continuum/`. It's a single page with no client-side router, so refreshing can never 404.

**D2. Seed data.** On the very first run, when the database is empty, seed the 8 default categories, the default settings, and one milestone: "65th Birthday / Retirement", target date 2065-01-01, `completionMode: "date-based"`. Set `meta.seeded = true` so that deleting the milestone never brings it back. `retirementDate` is removed from settings because the milestone record is the source of truth.

**D3. One recurrence engine.** `ical.js` handles both .ics parsing and RRULE iteration, for imported and manual events alike. The `rrule` package is **not** used. Expansion happens in the event's own wall-clock time: iterate occurrences as floating local date-times, then convert each one to an instant in the event's IANA zone. That keeps a weekly 9:00 class at 9:00 across DST changes. When a local time doesn't exist (spring forward), move it forward by the length of the gap, as RFC 5545 specifies. When a local time is ambiguous (fall back), use the first occurrence. Both cases get unit tests.

**D4. IndexedDB is for persistence; queries run in memory.** At startup, load every record from Dexie into an in-memory index: non-recurring events sorted by start (queried with binary search), and recurring series with their bounds. A single person's lifetime of data fits comfortably in memory. Revisit this only if a measurement shows a problem, such as more than 50k records.

**D5. The viewport lives outside React.** The viewport is a small TypeScript store with `subscribe`, read through `useSyncExternalStore` with selectors. Pan and zoom update the store in a `requestAnimationFrame` loop. Visible-window queries and lane layout are recomputed only when the window leaves its buffered range or the scale changes, not on every frame.

**D6. The viewport model.** The viewport is `{ anchorTime (ms), anchorX (px from the timeline's left edge), scale (px per ms) }`, and `x(t) = anchorX + (t − anchorTime) · scale`. Every SVG coordinate is computed relative to the viewport, so absolute time never ends up in a giant `translate`. That keeps precision intact in the year 2100 and beyond.

**D7. Zoom range and input.** The visible span ranges from **10 minutes to 150 years**.
- A vertical wheel zooms continuously around the cursor: `scale *= exp(−deltaY · k)`, with `k` tuned so one notch is about 10–15%.
- A trackpad pinch (`ctrlKey` + wheel) also zooms.
- A horizontal wheel, a horizontal trackpad swipe, or Shift + wheel pans.
- Dragging on empty timeline pans.
- The app fills the viewport, so the page never scrolls. When the lanes are taller than the screen, the lane area scrolls vertically with its own scrollbar.
- Keyboard: ←/→ pan, +/− zoom, N returns to Now.

**D8. Snapping.** When snapping is on and a zoom interaction ends (the wheel has been idle for about 200 ms, or a zoom button was pressed), the view snaps to the nearest target span if the current span is within `snapThreshold` of it (default 15%). The targets are 1 day, 7 days, 30.44 days, and 365.25 days. The cursor's timestamp stays fixed during the snap animation. Snapping changes only the single uniform scale and never distorts time. Labels stay calendar-true regardless.

**D9. The Now marker sits at 25% from the left** in live-follow mode, since the app is forward-looking. Return to Now restores that position and resumes live-follow. The default zoom shows a span of 3 days.

**D10. Events narrower than 1 px aren't drawn as rectangles.** Each lane instead draws a **density strip**: per-pixel-column bins whose opacity is the fraction of that column's time covered by the lane's events. Short events are never artificially widened, and you can still see how busy each part of a decade is. *(Changed in Stage 4, agreed with Trenten: any column with some activity is drawn at an opacity of at least 0.25, so sparse events stay visible at wide zoom. Above that floor, opacity is the true fraction.)* Events wider than about 40 px show their titles. Narrower ones show none, but keep their tooltip and click target.

**D11. Past translucency.** Each event is drawn once, clipped at the Now x-position. The past portion uses `pastEventOpacity` (default 0.35), and the future portion is fully opaque. This is calculated at render time and never stored.

**D12. Milestones work at day resolution.** A milestone's target is a calendar date, positioned at local midnight at the start of that date in the display zone. Dragging snaps to the nearest midnight. Completion for date-based milestones is derived at render time (`today ≥ targetDate`) and not written to storage. Achievement milestones complete only by manual toggle.

**D13. Editing recurring events.** Edits and deletes offer three scopes:
- **This occurrence:** an edit creates an override record; a delete adds an EXDATE.
- **This and following:** the original series ends with an UNTIL, and a new series starts.
- **All:** the series itself changes.

**D14. Import identity.** Imports are deduplicated on `(externalUid, recurrenceId)`. Re-importing the same file updates matching records rather than duplicating them, and the preview reports the result as new, updated, unchanged, or skipped (with a reason). VEVENTs with `STATUS:CANCELLED` delete the matching record or add an EXDATE. Each import is written in one Dexie transaction, so it either fully succeeds or changes nothing.

**D15. Time zones.** The display zone is the browser's zone unless it's overridden in settings. For TZIDs in .ics files:
- An IANA name is used directly.
- A common Windows zone name (e.g. "Pacific Standard Time") is mapped through a small table.
- Anything else falls back to the file's VTIMEZONE through ical.js, with a warning in the preview.
- Floating times are interpreted in the display zone.

**D16. Ask the browser for durable storage.** Call `navigator.storage.persist()` after the first user-created data is saved, and show the result in Settings next to the backup reminder.

**D17. Testing.** Vitest covers `src/time`, `src/data` (using `fake-indexeddb`), and `src/import` from Stage 1 onward. Playwright smoke tests are added in Stage 8. CI runs typecheck, Vitest, and the build on every push, and Playwright once it exists.

**D18. Week starts on Monday.** Dark theme is the default. A light theme arrives in Stage 8.

## 4. Technology

| Layer | Choice |
|---|---|
| Framework | React + TypeScript (strict) |
| Build | Vite |
| Styling | CSS custom properties + CSS Modules |
| Rendering | SVG, viewport-based |
| Storage | IndexedDB via Dexie |
| Dates | date-fns v4 + `@date-fns/tz` (TZDate). `date-fns-tz` is acceptable if needed |
| ICS + recurrence | ical.js (D3) |
| CSV | papaparse |
| Tests | Vitest, fake-indexeddb, @testing-library/react, Playwright |
| Deploy | GitHub Actions → GitHub Pages |

Pin exact versions with no `^`. Ask before adding anything not listed here.

## 5. Functional requirements

### 5.1 Timeline orientation
- The timeline is strictly horizontal. The past is always on the left, the future always on the right, and time increases monotonically along x.
- Vertical position is reserved for category lanes and stacking overlapping events.
- Width is proportional to elapsed duration. A 90-minute workout is exactly as wide as a 90-minute meeting at the same zoom.
- There are never separate day, week, or month pages. Calendar subdivisions are visual guides, not separate coordinate systems.

### 5.2 Navigation
- Smooth panning, continuous cursor-centered zoom (the timestamp under the cursor stays put), and zoom buttons with accessible labels (D7).
- Optional snapping with a visible toggle (D8).
- Adaptive time labels that switch with the zoom level:
  - close: minutes and hours
  - medium: hours and days
  - wide: weeks and months
  - very wide: years and decades
- Tick levels: minute, 5 min, 15 min, hour, 3 h, 6 h, day, week, month, quarter, year, 5 years, decade. Pick the finest level whose ticks are at least about 80 px apart.
- Ticks fall on true calendar boundaries in the display zone. That covers leap years, month lengths of 28–31 days, and DST days of 23 or 25 hours.
- Subtle gridlines.

### 5.3 Live passage of time
- A prominent vertical Now marker with a live local date and time label.
- In live-follow mode, the marker stays put while the timeline moves left at the true rate for the current scale. Positions come from `Date.now()` every frame, never from accumulated per-frame steps.
- On `visibilitychange`, recompute the position immediately.
- Manual panning turns live-follow off. A LIVE indicator in the toolbar shows the current state. A Return to Now button recenters the timeline and turns live-follow back on.
- At wide zoom the motion may be imperceptible. Never speed it up.

### 5.4 Categories and lanes
Default categories:

| Order | Name | Color (dark theme) |
|---|---|---|
| 1 | Sleep & Rest | `#6F86C9` muted blue |
| 2 | Work & Career | `#E0A040` amber |
| 3 | Education | `#9B7FDB` purple |
| 4 | Health & Exercise | `#3DB5A0` teal |
| 5 | Hobbies & Recreation | `#E07AAE` pink |
| 6 | Social & Relationships | `#E8806A` coral |
| 7 | Life & Logistics | `#8A9AB0` slate |
| 8 | Miscellaneous | `#9A9A9A` gray |

- Each category has a persistent lane, and its label stays visible while panning (a sticky label column).
- Users can create, rename, recolor, reorder, and hide or show categories. A category can't be deleted while events still use it, unless the user chooses where to move those events.
- Overlapping events within a lane stack using greedy row assignment, computed over the visible window plus its buffer. A lane's height changes only when its row count changes, with a minimum of one row.

### 5.5 Multi-category events
- One record carries `categoryIds: string[]` and appears in every selected lane, at the same x and width.
- Every appearance references the same id, so editing or deleting any one of them affects the shared event. Removing one category removes only that lane's appearance.
- Any future duration summaries must keep category-attributed hours separate from elapsed hours. A 2-hour event in 3 categories is still only 2 hours of real time.

### 5.6 Event creation and editing
- A prominent **Add Event** button in the toolbar opens a collapsible side panel editor. Clicking an event opens the same panel showing its details.
- **Required fields:** title, start, end, and at least one category.
- **Optional fields:** description, location, all-day, and recurrence.
- Validation messages appear inline. A timed event's end must come after its start. An all-day event's end date is inclusive in the UI and stored exclusive.
- Recurrence options: daily, weekly (choosing weekdays), monthly (by day of month), or yearly, with an interval. A series can end never, on a date, or after a count.
- Edit scopes for recurring events follow D13.
- Deletes ask for confirmation.

### 5.7 Milestones
- A milestone is a zero-duration gateway: a vertical marker spanning all lanes, with its title in a label at the top.
- **Required fields:** id, title, target date, completed or not.
- **Optional fields:** description, completion date.
- There is an **Add Milestone** action. Milestones can be clicked and edited, moved by dragging (D12) or by editing the date, and deleted.
- Complete milestones are solid, and incomplete ones are dashed.
- A milestone never completes just because its date has passed. The only exception is `completionMode: "date-based"` (birthdays and the like).
- The seed milestone is "65th Birthday / Retirement" on 2065-01-01, date-based, editable, and deletable. Navigation continues past it with no endpoint. Never auto-populate the period after it.

### 5.8 ICS import
- File-based only, with no live sync.
- Supported properties: titles, descriptions, locations, start and end, all-day, multi-day, TZID, RRULE, EXDATE, RECURRENCE-ID overrides, and STATUS:CANCELLED.
- Support RDATE if it's straightforward. Otherwise, list it in the preview as unsupported.
- Recurrences are stored as rules and expanded lazily.
- Identity and updates follow D14, and time zones follow D15.
- **Preview before writing.** The preview shows counts (new, updated, unchanged, skipped), the date range, and a sample of events. It also offers a category picker for the whole batch, with Miscellaneous as the default.
- Errors are reported clearly and never corrupt existing data.

### 5.9 CSV import
Documented format (shown in the README and the import dialog):
```
title,start,end,allDay,description,location,categories,rrule
Morning run,2026-10-20T07:00:00-07:00,2026-10-20T07:45:00-07:00,false,,Green Lake,Health & Exercise,
Dentist,2026-11-03,2026-11-03,true,,,Life & Logistics;Health & Exercise,
Study group,2026-10-21T18:00:00-07:00,2026-10-21T20:00:00-07:00,false,Linear algebra,,Education;Social & Relationships,FREQ=WEEKLY;COUNT=10
```
- Timed rows need ISO 8601 dates with an offset. All-day rows use `YYYY-MM-DD` with an inclusive end, and the end may be empty for a single day.
- Categories are separated by `;` and matched to names case-insensitively. In the preview, unknown names can be created as new categories or mapped to Miscellaneous.
- `rrule` is optional.
- Each row is validated and errors report the row number. Never import an invalid date silently.
- CSV rows have no stable UID, so the preview warns that importing the same file again will duplicate its events.

### 5.10 Persistence and backup
- IndexedDB stores events (including recurrence rules, exceptions, and overrides), categories, milestones, settings, and meta (`schemaVersion`, `seeded`).
- Data survives refreshes and restarts.
- **Full JSON export** produces `continuum-backup-YYYY-MM-DD.json`:
  ```
  { app: "continuum", schemaVersion, exportedAt, events, categories, milestones, settings }
  ```
- **JSON restore** validates the file's shape and schema version, shows the record counts, and asks for explicit confirmation before replacing all data. The replacement happens in one transaction.
- Schema changes go through Dexie versioned migrations.
- Settings explains that browser data can be lost if site storage is cleared, recommends regular backups, and shows the persistent-storage status (D16).

### 5.11 Visual design
- Dark by default, with a clean, restrained, and spacious look. The timeline is the point, so there are no dashboards.
- **Toolbar:** app name, Add Event, Add Milestone, LIVE indicator with Return to Now, zoom − and +, Snap toggle, Import, Export, Settings.
- **Main area:**
  - the adaptive ruler
  - sticky lane labels
  - the timeline, with event rectangles in each category's color
  - full-height milestone gateways
  - the Now marker, drawn strongly in its own color that isn't used by any category
- Narrow events and density strips follow D10, and translucency follows D11.
- Events have hover tooltips (title and time range). Every event is reachable from the keyboard: SVG items are focusable, with `role="button"` and an `aria-label` that includes the title and time.
- Visible focus rings, and `prefers-reduced-motion` is respected for animated snaps and Return to Now.
- Settings has an About item that links to `https://github.com/TrentenMUW/continuum`.

### 5.12 Date and time correctness
This is a critical subsystem:
- Positions come from real timestamps.
- Calendar math is timezone-aware.
- No day is ever assumed to be 24 hours long, and no month or year is ever given a fixed length.
- Handle leap years, month lengths, DST transitions, events that cross midnight, multi-day events, recurrence exceptions, and dates through and beyond 2065.
- All-day events keep their calendar-date meaning: they always span local midnight to local midnight in the display zone.

## 6. Data model

```ts
type Instant = string;  // UTC ISO 8601, e.g. "2026-10-18T16:00:00.000Z"
type CalDate = string;  // "YYYY-MM-DD"
type OccurrenceKey = string; // original start: Instant for timed series, CalDate for all-day series

interface CalendarEvent {
  id: string;                    // uuid
  title: string;
  description?: string;
  location?: string;
  allDay: boolean;
  start?: Instant;               // timed events
  end?: Instant;
  startDate?: CalDate;           // all-day events; endDate is EXCLUSIVE
  endDate?: CalDate;
  timeZone: string;              // IANA; the zone recurrence is expanded in
  categoryIds: string[];         // at least one
  recurrence?: {
    rrule: string;               // RFC 5545 RRULE value, e.g. "FREQ=WEEKLY;BYDAY=MO,WE"
    exdates: OccurrenceKey[];
  };
  recurrenceParentId?: string;   // set on an override of one occurrence
  recurrenceId?: OccurrenceKey;  // the occurrence it replaces
  source: "manual" | "ics" | "csv";
  externalUid?: string;          // ICS UID
  importBatchId?: string;
  createdAt: Instant;
  updatedAt: Instant;
}

interface Milestone {
  id: string;
  title: string;
  description?: string;
  targetDate: CalDate;
  completed: boolean;            // manual milestones only; date-based is derived (D12)
  completedAt?: CalDate;
  completionMode: "manual" | "date-based";
  createdAt: Instant;
  updatedAt: Instant;
}

interface Category {
  id: string;
  name: string;
  color: string;
  order: number;
  visible: boolean;
}

interface AppSettings {
  theme: "dark" | "light";
  snapEnabled: boolean;          // default false
  snapThreshold: number;         // default 0.15
  timeZone: string | "auto";     // default "auto"
  defaultSpanMs: number;         // default 3 days
  pastEventOpacity: number;      // default 0.35
  nowMarkerPosition: number;     // default 0.25
  weekStartsOn: 1;
}

interface Meta { schemaVersion: number; seeded: boolean; }
```
The agent may add indexes or derived fields, provided they preserve this behavior. Any change gets an entry in LOG.md.

## 7. Performance
- Never instantiate or render every event across the lifetime.
- Query only the visible window plus a buffer of one viewport width on each side (D4).
- Expand recurrences only for that buffered window, and cache the expansions per series and window bucket.
- Render only the visible rectangles, ticks, milestones, and density bins.
- Keep the time math in `src/time`, separate from the components.
- Use rAF for motion, and never re-render the whole app every frame (D5).
- No coordinate drift when panning or zooming.
- **Benchmark (Stage 8):** 1,000 one-off events plus 50 recurring series (including daily ones that never end). Panning and zooming must stay smooth at 3-hour, 1-month, and 40-year spans.

## 8. Out of scope for v1
These are reserved for v2: analytics, cumulative hours, goal tracking such as "1,000 hours of mathematics", subcategories, completion logs, and goal projections. Don't build them, but don't design them out either. In particular, keep the event model able to tell planned activity apart from actual activity later. The app should be useful as a calendar before it becomes a life-analysis tool.

## 9. Stages

Each stage ends with tests passing, typecheck clean, and the build succeeding. Then come a LOG.md entry, an update to "Current status" in CLAUDE.md, and a **stop**. Trenten works through "Verify by hand" before the next stage begins.

### Stage 0: Repo, docs, plan
Set up the repo and Pages and write `docs/PLAN.md` (see HANDOFF §1–2).
*Verify by hand:*
- [ ] The repo is public on GitHub and contains CLAUDE.md, LOG.md, and docs/.
- [ ] There are no .pdf, .ics, or .csv files in the repo.
- [ ] PLAN.md makes sense to you, and you agree with every deviation it lists.

### Stage 1: Foundation
Scaffold Vite + React + TS (strict), the theme variables, and the app shell with a toolbar (controls can be disabled until their stage). Add the Dexie schema v1, migrations scaffold, seeding (D2), and settings loading.
*Verify by hand:*
- [ ] `npm run dev` shows a dark shell with the toolbar.
- [ ] DevTools → Application → IndexedDB shows 8 categories and one milestone dated 2065-01-01.
- [ ] Refreshing several times doesn't duplicate the seed.

### Stage 2: Timeline engine + first deploy
Build the viewport math (D6) with tests:
- the x↔t round trip
- the cursor-centered zoom invariant
- width = duration × scale
- precision at 2100

Also build panning, wheel and pinch zoom, the zoom buttons, adaptive ticks and labels (with tests for a 23-hour and a 25-hour day, Feb 29, and the boundaries of 31/30/28-day months), the snap toggle (D8), empty lanes with sticky labels, and static rendering of milestones. Add the Actions workflow and deploy.
*Verify by hand:*
- [ ] Put the cursor on a gridline and zoom in and out. The gridline stays under the cursor.
- [ ] In Pacific time, **Sun Nov 1, 2026** is visibly wider than its neighbors (25 h), and **Sun Mar 14, 2027** is narrower (23 h).
- [ ] **Feb 29, 2028** exists, and February 2027 ends on the 28th.
- [ ] Zoom from about 10 minutes out to decades in one smooth motion. The labels adapt.
- [ ] Pan to **Jan 1, 2065**. The milestone is there, and you can keep going to 2100.
- [ ] With snapping on, the zoom settles at a day, week, month, or year. With it off, it doesn't.
- [ ] The live URL loads with no console errors.

### Stage 3: Live time
Add the Now marker and label, live-follow (D9), disengaging on pan, Return to Now, the visibility recompute, and the translucency clip (D11), testing it on a temporary hard-coded event that is removed before the stage ends.
*Verify by hand:*
- [ ] At about a 10-minute span, the timeline visibly moves left while the marker stays still.
- [ ] Switch tabs for a minute and come back. The view is correct immediately.
- [ ] Panning turns LIVE off, and Return to Now turns it back on.

### Stage 4: Events and categories
Build the editor panel with validation, create/edit/delete, multi-category rendering, stacking, density strips (D10), tooltips, and the category manager (add, rename, recolor, reorder, hide, delete-with-reassign).
*Verify by hand:*
- [ ] Create a 2-hour "Hike" in Health, Hobbies, and Social. It shows up in all three lanes. Edit it from one lane and all three update.
- [ ] Remove Social from the hike. Only that lane's copy disappears.
- [ ] Three overlapping events in one lane stack, and each one can be clicked.
- [ ] An event that spans Now is translucent before the marker and solid after it.
- [ ] Zoom out to years. Events turn into density strips rather than widened blocks.
- [ ] Refresh. Everything is still there.

### Stage 5: Recurrence
Add the recurrence UI, lazy expansion (D3), the edit scopes (D13), and caching. Write tests for DST, a nonexistent time, an ambiguous time, COUNT/UNTIL, EXDATE, overrides, and a yearly Feb 29 series.
*Verify by hand:*
- [ ] A weekly Monday 9:00 class stays at 9:00 on both sides of Nov 1, 2026.
- [ ] Delete one occurrence and only that one disappears. Edit one occurrence's time and only that one moves.
- [ ] "This and following" splits the series correctly.
- [ ] A daily series with no end stays smooth when you pan across 2060.

### Stage 6: Milestones
Add Add Milestone, editing, deleting, the completion toggle, date-based derivation, drag-to-reschedule, and the solid and dashed styles.
*Verify by hand:*
- [ ] Add "Graduation" and drag it. It snaps to days, and the new date persists after a refresh.
- [ ] A past-dated achievement milestone stays incomplete until you mark it complete.
- [ ] A date-based milestone with a past date shows as complete.
- [ ] Deleting the 2065 milestone and refreshing doesn't bring it back.

### Stage 7: Import and export
Build ICS import (D14, D15, with the preview), CSV import (§5.9), JSON export, and restore. Use fixtures for a Google Calendar export, an Outlook export (Windows TZIDs), a recurring series with exceptions, all-day multi-day events, and a malformed file.
*Verify by hand:*
- [ ] Export your real Google Calendar as .ics, **keeping the file outside the repo**. Import it. The preview counts look right, and so do your events.
- [ ] Import the same file again. It reports "unchanged" with no duplicates.
- [ ] A bad CSV row is reported by row number, and nothing is written.
- [ ] Export a backup, add an event, and restore the backup. The added event is gone and everything else is intact.

### Stage 8: Polish and wrap-up
Covers:
- keyboard and screen-reader pass, reduced motion
- light theme, responsiveness at 1280 px and on a tablet
- the storage notice (D16) and the About link
- error states
- the performance benchmark (§7)
- Playwright smoke tests in CI
- a README covering setup, install, build, testing, deployment, the ICS and CSV formats, backup and restore, and storage limits

Then update the portfolio card (HANDOFF §5).
*Verify by hand:*
- [ ] You can do the core flows using only the keyboard.
- [ ] The benchmark stays smooth.
- [ ] You can follow the README from a fresh clone.
- [ ] The portfolio card is live with your own reflection, and the link has been submitted on Canvas.

## 10. Acceptance criteria
1. It runs locally and builds and deploys under `/continuum/` on GitHub Pages.
2. Horizontal panning works without ever switching to a calendar view.
3. Zoom is smooth from minutes to decades, and the timestamp under the cursor stays fixed.
4. Snapping can be turned on and off and never distorts time.
5. The Now marker shows the current time, and the timeline moves left in live mode. Manual panning turns live mode off, and Return to Now turns it back on.
6. The past portions of events are translucent.
7. Events can be created, edited, and deleted.
8. An event can sit in several lanes while remaining one record.
9. Overlapping events remain individually accessible.
10. Recurring events render correctly without generating decades of records.
11. Milestones span every lane and can be moved and completed. The 2065-01-01 milestone is editable and deletable, and the timeline continues past it.
12. ICS files import with a preview and deduplication. CSV files import with validation.
13. Data and settings persist across refreshes. Full JSON backups can be exported and restored.
14. Automated tests cover the timeline math, calendar ticks, recurrence and DST, persistence, imports, and the core interactions.
15. CLAUDE.md is current, LOG.md covers the whole build, and the portfolio card is updated with Trenten's own reflection.
