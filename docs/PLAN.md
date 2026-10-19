# Continuum: Implementation Plan

This plan covers how the requirements in `docs/SPEC.md` get built. `SPEC.md` wins wherever the two disagree. Departures from the spec are listed in §7 and need Trenten's agreement.

## 1. Folder and file structure

```
continuum/
  index.html
  vite.config.ts              base "/continuum/" for build, "/" for dev
  tsconfig.json               strict, noUncheckedIndexedAccess
  vitest.config.ts            jsdom env for ui tests, node env for time/data/import
  playwright.config.ts        (Stage 8)
  .github/workflows/deploy.yml  (Stage 2)
  src/
    main.tsx, App.tsx
    theme/        tokens.css (CSS custom properties, dark; light in Stage 8)
    time/         PURE, no React, no Dexie
      viewport.ts       x(t), t(x), zoomAt(), panBy(), span clamping (D6, D7)
      snap.ts           snap target selection (D8)
      ticks.ts          calendar-true tick generation per level (§5.2)
      zones.ts          display-zone resolution, Windows→IANA table (D15)
      localTime.ts      wall-clock → instant with gap/overlap rules (D3)
      recurrence.ts     ical.js RRULE expansion in the event's zone (D3)
      density.ts        per-pixel-column coverage bins (D10)
      lanes.ts          greedy row assignment (§5.4)
    data/
      db.ts             Dexie schema v1 + versioned migrations
      seed.ts           first-run seed (D2)
      repo/*.ts         events, categories, milestones, settings
      index.ts          in-memory interval index (D4)
      backup.ts         JSON export/restore (§5.10)
    import/
      ics.ts, csv.ts    parse → ImportPreview
      preview.ts        diff against existing records (D14), commit in one transaction
    state/
      viewportStore.ts  subscribe/getSnapshot store + rAF loop (D5)
      appStore.ts       loaded data, selection, panel state, settings
    ui/
      Toolbar/, Timeline/ (Ruler, Lanes, EventRect, DensityStrip, Milestone, NowMarker),
      LaneLabels/, EditorPanel/, CategoryManager/, ImportDialog/, Settings/
  tests/
    fixtures/         FAKE .ics / .csv / .json only
    e2e/              Playwright (Stage 8)
```
Unit tests sit next to their source as `*.test.ts`.

## 2. Dependencies (exact pins)

Versions are current npm releases as of 2026-10-18. They'll be pinned without `^` in `package.json`, and `package-lock.json` gets committed.

**Runtime (all listed in SPEC §4)**
| Package | Version | Purpose |
|---|---|---|
| react, react-dom | 19.3.1 | UI |
| dexie | 4.4.6 | IndexedDB persistence |
| date-fns | 4.4.0 | calendar math |
| @date-fns/tz | 1.5.0 | `TZDate`, zone-aware calendar math |
| ical.js | 2.2.1 | .ics parsing and RRULE iteration (D3) |
| papaparse | 5.7.0 | CSV parsing |

**Dev**
| Package | Version | Purpose | In SPEC? |
|---|---|---|---|
| typescript | 7.0.2 | strict typecheck (`tsc --noEmit`) | yes |
| vite | 8.3.4 | dev server and build | yes |
| vitest | 5.0.5 | unit tests | yes |
| fake-indexeddb | 6.2.6 | Dexie in tests | yes |
| @testing-library/react | 16.3.3 | component tests | yes |
| @playwright/test | 1.64.1 | smoke tests (Stage 8) | yes |
| @vitejs/plugin-react | 6.1.2 | JSX and Fast Refresh for Vite | **no, see §7** |
| @types/react, @types/react-dom | 19.3.0 | React types | **no, see §7** |
| @types/papaparse | 5.5.2 | papaparse types | **no, see §7** |
| @testing-library/dom | 10.4.2 | required peer of @testing-library/react | **no, see §7** |
| jsdom | 30.1.3 | DOM environment for Vitest component tests | **no, see §7** |

CSS Modules are built into Vite and need no package.

## 3. Viewport, rendering, and state architecture

**Viewport store (D5, D6).** `src/state/viewportStore.ts` holds `{ anchorTime, anchorX, scale, widthPx, live }` and exposes `getSnapshot`, `subscribe`, and actions (`panBy`, `zoomAt`, `zoomButton`, `returnToNow`). The math lives in `src/time/viewport.ts`, and the store only applies it. Input handlers never call `setState` directly. They write a pending delta that a single rAF loop applies once per frame.

**Live follow (D9, §5.3).** While `live` is true, each frame sets `anchorTime = Date.now()` and `anchorX = nowMarkerPosition × widthPx`. Position always comes from `Date.now()`, never from summed deltas. `visibilitychange` forces an immediate frame. Any manual pan sets `live = false`.

**How panning avoids re-rendering React.** The timeline SVG has one content group per layer. Each React render lays out its items relative to a **reference time** `refTime` captured at that render, with `x = (t − refTime) × scale`, so the numbers stay small and precise in 2100 and beyond (D6). On every frame the rAF loop sets the group's `transform="translate(dx, 0)"` directly through a ref, where `dx = anchorX + (refTime − anchorTime) × scale`. React doesn't run.

React re-renders the timeline only when:
- the visible window leaves the **buffered window** (visible span plus one viewport width on each side, §7), or
- the scale changes.

Components read the store through `useSyncExternalStore` with selectors that return the buffered window key and scale, not the raw anchor, so a pan inside the buffer triggers nothing.

**Zoom.** A zoom changes scale, so it re-renders the layers. That stays cheap because only buffered-window items exist. Lane row assignment depends only on time overlap, not scale, so it's reused across zooms within the same window. Only the rect-vs-density split (D10) and label visibility are recomputed. If profiling at Stage 8 shows zoom frames are too slow, the fallback is to scale the group transform during the gesture and re-render once it ends.

**Ruler and lane labels.** The ruler is a separate SVG layer that follows the same pattern. Lane labels are an HTML column outside the SVG, so they stay sticky without any per-frame work. The lane area scrolls vertically in its own container (D7).

## 4. Data flow

```
Dexie (IndexedDB)
  └─ startup: load all tables ─► appStore
        └─ build in-memory index (src/data/index.ts)
              • one-off events: array sorted by startMs, plus maxDurationMs
                → window query: binary search for startMs ≥ winStart − maxDurationMs, scan until startMs > winEnd
              • recurring series: list with [seriesStartMs, seriesEndMs | ∞]
                → overlap filter, then expand via src/time/recurrence.ts
              • overrides: Map<parentId, Map<recurrenceId, event>>, applied after expansion
  └─ buffered window [winStart, winEnd]
        └─ occurrences (cached per series × window bucket; invalidated on that series' edit)
              └─ per visible category: lane rows (src/time/lanes.ts) or density bins (src/time/density.ts)
                    └─ SVG <rect> / density <rect> per column, + milestones + now marker
```
- Every write goes through a repository, which updates Dexie and then patches the in-memory index incrementally, so there's no full reload.
- `startMs`, `endMs`, and all-day boundaries resolved to instants in the display zone are derived in memory only and never stored.
- All-day events resolve to local midnight → local midnight in the **display** zone (§5.12), so they're re-derived if the display zone changes.
- Multi-category events (§5.5) are one occurrence object placed in each of its lanes, and every placement carries the same event id.

## 5. Test plan by stage

| Stage | Automated tests |
|---|---|
| 1 | Dexie schema opens on fake-indexeddb. The seed writes 8 categories, default settings, the 2065-01-01 milestone, and `meta.seeded`. A second startup doesn't reseed, and neither does deleting the milestone. Settings load with defaults. |
| 2 | Viewport: the x↔t round trip, the cursor-centered zoom invariant, width = duration × scale, precision at 2100 and 2200, and span clamping to 10 min and 150 yr. Ticks: a 23 h and a 25 h day in America/Los_Angeles, Feb 29 2028, Feb 2027 ending on the 28th, 31/30/28-day month boundaries, tick-level choice at ~80 px, and Monday week starts. Snap: within and outside the threshold, and the cursor time held fixed. |
| 3 | Live mode: position derived from an injected clock, with no drift over simulated frames. Pan turns live off, and returnToNow puts Now at 25%. Translucency clip: the split of an event that spans Now. |
| 4 | Event validation (end after start, inclusive↔exclusive all-day dates, ≥1 category). Repository CRUD. Multi-category placement. Greedy lanes. Density bins (coverage fractions, no widening). Category delete-with-reassign. Component tests for the editor panel. |
| 5 | Recurrence: weekly 9:00 across both DST transitions, a nonexistent local time (moved forward by the gap), an ambiguous local time (first occurrence), COUNT, UNTIL, EXDATE, overrides, a yearly Feb 29 series, an endless daily series queried in 2060 (bounded work), and all three edit scopes (D13). |
| 6 | Date-based completion derived from "today". Manual milestones never auto-complete. Drag snaps to local midnight. Milestones persist. |
| 7 | ICS fixtures (Google, Outlook with Windows TZIDs, recurring with exceptions, all-day multi-day, malformed). Dedupe on re-import ("unchanged"). STATUS:CANCELLED. A failed import writes nothing. CSV row validation with row numbers and unknown categories. Backup round trip and restore validation. |
| 8 | Playwright smoke tests: load, add event, zoom, import, export. Keyboard-only flow. A benchmark harness (1,000 events plus 50 series) with frame-time measurement at 3 h, 1 mo, and 40 yr spans. |

Every stage also runs `npm run typecheck` and `npm run build`. CI runs both plus Vitest, and Playwright from Stage 8 (D17).

## 6. Risks and how I'll handle them

1. **TypeScript 7 is the new native compiler.** Some tooling that depends on the old JS compiler API may not work with it. Nothing in this stack needs that API (Vite strips types with its own transformer), but if `tsc` 7 causes trouble, I'll fall back to the latest 6.x and log it.
2. **Nonexistent and ambiguous local times (D3).** `TZDate` and ical.js may not resolve DST gaps the way RFC 5545 specifies. `src/time/localTime.ts` will own this conversion explicitly, computing the zone offset before and after the gap. It gets tested on its own before recurrence uses it.
3. **ical.js time zones.** ical.js only knows the VTIMEZONEs inside a file. IANA zones are handled with `@date-fns/tz` instead, and ical.js is used only to iterate floating wall-clock occurrences (D3). The two-library seam gets dedicated tests.
4. **Endless daily series at wide zoom.** A 40-year window would mean about 15,000 occurrences per daily series. Expansion is bounded to the buffered window and cached per bucket. At wide zoom these occurrences only feed density bins, so they're binned straight away without creating per-occurrence render objects.
5. **Tick generation cost.** Creating `TZDate` objects for every tick could be slow at fine levels across a wide buffer. Ticks are generated only for the buffered window, at a single level (plus one coarser label level), and cached per window key.
6. **Dexie compound index with `recurrenceId` undefined.** Dexie doesn't index records whose compound key part is missing. Dedupe looks up by `externalUid` and then filters on `recurrenceId` in memory.
7. **GitHub Pages base path.** Asset 404s under `/continuum/`. `base` is set only for `build`, and Stage 2 checks the live URL and console as HANDOFF §3 describes.
8. **Fractional pixel drift while panning.** The rAF loop recomputes the transform from absolute anchor values every frame instead of accumulating translations.
9. **Storage eviction.** Covered by D16 and the backup reminder. This is a known limitation that will be documented in the README.

## 7. Departures from the spec (need Trenten's agreement)

1. **Node 24 LTS instead of Node 22.** winget's "LTS" package installed Node 24.20.0, which is the current LTS line. HANDOFF requires Node 20 or newer, so this satisfies it, and CI will use Node 24 to match.
2. **Extra dev dependencies not named in SPEC §4.** These are support packages for the listed tools rather than new capabilities:
   - `@vitejs/plugin-react` (React support for Vite)
   - `@types/react`, `@types/react-dom`, `@types/papaparse` (type definitions; React and papaparse don't ship their own)
   - `@testing-library/dom` (a required peer of @testing-library/react)
   - `jsdom` (the DOM environment Vitest needs for component tests)
3. **No state library.** `appStore` is a hand-written external store, like the viewport store. That's consistent with D5 and adds no dependency.

There are no data-model changes. The only derived fields (`startMs`, `endMs`, resolved all-day instants) exist in memory only (§4).
