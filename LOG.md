# Build Log: TCSS 490 Artifact 2 — Continuum

Format: what I asked → what changed / what the AI got wrong.

## Oct 18, 2026: Choosing the project and planning (Claude, web chat)
- Shared the Artifact 2 assignment and my idea: an endlessly scrolling, left-to-right timeline that imports .ics and .csv calendar files → Claude recommended a separate repo instead of adding it to my portfolio repo. The assignment wants a fresh repo with its own CLAUDE.md and log, and the portfolio is meant to stay a no-build-step site where only `artifacts.js` changes.
- Prepared the full Continuum specification and shared it → Claude confirmed the separate repo (the React/Vite build settles it), flagged that the seeded retirement milestone exposed a real birthdate in a public repo, and noted the spec had no CLAUDE.md or log even though the assignment requires them.
- Decided: the seed birthdate is January 1, 2000, so the "65th Birthday / Retirement" milestone is January 1, 2065. Kept the full scope rather than cutting to a minimal version.
- Asked Claude to add the process requirements and make the open architecture decisions → Claude wrote `CLAUDE.md`, `docs/SPEC.md` (the spec in Markdown, with a Decisions section and per-stage verification checklists), `docs/HANDOFF.md`, and this log. The original PDF stays out of the repo because it contains the old date.

## Build (Claude Code)

### Oct 18, 2026: Stage 0, repo and plan
- Asked Claude Code to start the project from the prepared docs → it found the docs in `Artifact2/files/` instead of the `continuum/` layout HANDOFF assumes, so it copied them into `continuum/` (`CLAUDE.md`, `LOG.md`, `docs/SPEC.md`, `docs/HANDOFF.md`) and added the `.gitignore` from HANDOFF §1.
- The tool check failed because git, Node, and gh weren't installed → with my OK, installed them with winget: Git 2.55.0, GitHub CLI 2.102.0, and Node **24.20.0**. Asked for Node 22, but winget's LTS package is now 24. HANDOFF allows 20 or newer, so it was kept and listed as a departure in PLAN.md.
- Logged in with `gh auth login` (TrentenMUW). Set the commit identity locally to match the portfolio repo's commits.
- `git init -b main` → commit "Add project docs" → `gh repo create TrentenMUW/continuum --public ... --push` → Pages set to build from GitHub Actions (`build_type=workflow`).
- Wrote `docs/PLAN.md`: structure, pinned versions, the pan-without-React design (layers positioned relative to a reference time and moved by a per-frame SVG transform), data flow, tests per stage, and risks. Listed departures: Node 24, six support dev-dependencies not named in SPEC §4, and no state library. Waiting for my agreement.
- Agreed to all PLAN.md §7 departures.

### Oct 18, 2026: Stage 1, foundation
- Asked for Stage 1 → hand-written Vite 8 + React 19 + TypeScript 7 (strict, `noUncheckedIndexedAccess`) scaffold, without a template. Every package pinned exactly per PLAN.md §2.
- Dexie schema v1 lives in a `MIGRATIONS` list (`src/data/migrations.ts`), so later versions are added as new entries. Settings and meta are single-row tables (`id: "app"` / `id: "meta"`).
- Seeding (D2) runs in one read-write transaction keyed on `meta.seeded`. React StrictMode double-runs effects, and a test with three concurrent calls confirmed this gives exactly one seed. Deleting the milestone doesn't bring it back.
- `loadSettings` merges stored settings over defaults, so settings added later get a value on old databases.
- Dark theme tokens, a full-viewport shell, and the §5.11 toolbar, with every control disabled and its tooltip naming the stage it arrives in. The Now marker color (`#ff3b5c`) isn't used by any category.
- 12 Vitest tests (seed, settings, app shell), typecheck clean, build OK. Checked in the browser: 8 categories and one 2065-01-01 milestone in IndexedDB, still 8 and 1 after repeated reloads, no console errors.
- Note: DevTools lists categories in id (UUID) order, not lane order. Their `order` field is 1–8 as specified.
- Verified Stage 1 by hand and approved Stage 2.

### Oct 18, 2026: Stage 2, timeline engine and first deploy
- Asked for Stage 2 → pure time code in `src/time/`:
  - `viewport.ts`: the D6 mapping, cursor-centered zoom, a 10 min–150 yr clamp, and a render window buffered one viewport width on each side.
  - `ticks.ts`: calendar-true ticks at 13 levels.
  - `snap.ts`: D8 snap targets.
  - `calDate.ts`: calendar date → local midnight.
- Ticks never add a fixed day or month length. Day and longer levels step by calendar fields through `TZDate`. Sub-day levels walk real time and keep instants whose local minute-of-day fits the level, so the spring-forward night has no 02:00 tick and the fall-back night has two 01:00 ticks.
- Panning without React (D5): every layer is laid out relative to a reference time, and the store sets the layer's `transform` once per frame. React re-renders only when the scale changes or the view leaves the buffer.
- **AI got wrong:** three tick-level test expectations used bad arithmetic. For example, it expected 3-hour ticks at a 3-day span on 1600 px, but they'd be only 67 px apart. The code was right and the expectations were fixed. Separately, the first browser check showed the 2065 milestone being drawn ~900,000 px off-screen. Milestones are now filtered to the buffered window.
- Dev-server gotcha: after adding a new export, Vite's hot reload kept a stale module, and a full restart fixed it.
- Checked in the browser at 1400 px:
  - zoom keeps the cursor's time fixed (ticks landed within 0.00003 px of the prediction)
  - Sun Nov 1, 2026 measures exactly 25/24 of its neighbors
  - labels progress hours → days → weeks → months → quarters → years → decades
  - the 2065 milestone sits between the 2060 and 2070 ticks, and panning continues past 3000
  - with Snap on, a 6.46-day zoom settles at exactly 7 days, and with it off it stays put
- Added `.github/workflows/deploy.yml`: Node 24, `npm ci` → typecheck → test → build → upload-pages-artifact → deploy-pages, using the latest major action versions (checkout v7, setup-node v7, configure-pages v6, upload-pages-artifact v5, deploy-pages v5).
- 46 tests pass, typecheck clean, build OK.
- First deploy succeeded. https://trentenmuw.github.io/continuum/ returns 200, both assets load from `/continuum/assets/` with 200, and the console is clean. The Actions run noted that `ubuntu-latest` moves to Ubuntu 26 starting Oct 19, 2026. No change is needed, but if CI breaks after that date, check there first.
- Verified Stage 2 by hand and approved Stage 3.

### Oct 18, 2026: Stage 3, live time
- Asked for Stage 3 → the viewport store gained live-follow. Each frame while live sets `anchorTime = clock()` and `anchorX = 25%` of the width, so position always comes from the clock, never from summed steps. A unit test with irregular frame gaps (1 ms to 60 s) shows exact anchoring and no drift.
- Panning by drag, Shift+wheel, horizontal swipe, or arrow keys turns live off. Return to Now (button or N) glides back over 400 ms, or jumps instantly with reduced motion. It keeps the current zoom and resumes live.
- `visibilitychange` recomputes immediately, cancelling any pending frame so two rAF loops can't run at once. **AI got wrong:** the first version called `frame()` directly, which would have started a second loop. It was caught in review before testing, and a unit test now covers it.
- Now marker: a full-height line in a color no category uses (`--now`), with a live "Sun 18 Oct 2026, 22:48:32" label. It's an HTML overlay positioned from the clock every frame, and the label only re-formats when the second changes.
- D11 translucency: events are drawn once inside one SVG alpha mask, split at Now's x and updated every frame. The past side is `pastEventOpacity` (0.35) and the future side is opaque. `splitAtNow` is unit-tested.
- **Interpretation, needs my OK:** the spec doesn't say what zooming does in live mode. Zooming around the cursor would pull Now off its 25% spot. So in live mode, zoom centers on the Now marker and live stays on. When live is off, zoom is cursor-centered as before.
- Return to Now is disabled while already live.
- **AI got wrong:**
  - A PowerShell `Get-Content`/`Set-Content` round-trip in Stage 2 garbled the `←/→ +/−` characters in a comment in `Timeline.tsx`, and the mangled text got committed. Fixed by rewriting the file, and no other files were affected. Edits go through the editor tool now, not PowerShell text replacement.
  - The key handler assumed the event target was an element. Fixed with an `instanceof Element` check.
- Checked in the browser:
  - At a 10-minute span the ticks moved left 1.01 px in 3 s (expected 1.01) while the Now marker moved 0 px.
  - Pan → LIVE off, Return to Now → LIVE on with Now at exactly 25.00%, arrow key → off, N → on.
  - The temporary 4-hour event spanning Now was translucent before the marker and solid after. It was removed before the stage ended, as the spec requires.
- 60 tests pass, typecheck clean, build OK.
- Approved the live-mode zoom interpretation: zoom centers on the Now marker while live, and on the cursor otherwise.
- Verified Stage 3 by hand ("looks very good").

### Oct 18, 2026: Stage 4, events and categories
- Asked for Stage 4 → data layer:
  - `src/data/index.ts`: the D4 in-memory index. One-off events are sorted by start and queried with a binary search that looks back by the longest duration, and it's patched in place on edits. Recurring series are skipped until Stage 5.
  - `src/data/validate.ts`: form ↔ record conversion. Timed values become UTC instants read in the display zone. All-day ends are inclusive in the form and exclusive in storage.
  - Event and category repositories, including delete-with-reassign in one transaction.
- Layout (`src/time/lanes.ts`, `density.ts`): greedy row stacking per lane over the buffered window, and lane height = rows (minimum 1). Events under 1 px go into per-pixel density bins whose opacity is the covered fraction, and overlapping time is merged so it's never double-counted. Titles show only above 40 px. Very long events are clamped to the window so coordinates stay small.
- UI:
  - Add Event opens a side panel editor with inline validation and a two-step delete confirm. Clicking, or pressing Enter/Space on, any appearance of an event opens the same record.
  - A Categories button (top-left corner) opens the manager: add, rename, recolor, move up/down, hide/show, and delete, which asks where to move events if any use the category.
  - Events are focusable SVG buttons with an accessible name and a native tooltip ("Hike, Sat 24 Oct 2026, 09:00 – 11:00").
  - Escape closes the panel.
- Dragging now captures the pointer only after 3 px of movement, so clicking an event opens it instead of starting a pan or turning off live mode.
- Added early: `navigator.storage.persist()` is requested once after the first user-created save (D16 says "after the first user-created data is saved"). Its status display is still Stage 8.
- **AI got wrong:**
  - Changing `settings.timeZone` didn't update the store's zone or rebuild the index. A test only passed because this machine is on Pacific time. Fixed: a zone change re-derives both. Added a Tokyo test and ran the suite with `TZ=Asia/Tokyo`.
  - One greedy-stacking test expectation was wrong (the code was right).
  - A density assertion was vacuous (`>= 0`) and was replaced with a real check: daily 8-hour sleep at a 40-year zoom gives ≈⅓ opacity.
  - Side-by-side datetime inputs cut off AM/PM, so start and end now stack.
- Checked in the browser at 1400 px:
  - a 2-hour Hike in Health/Hobbies/Social appeared in all three lanes at identical x and width
  - editing it from the Hobbies lane renamed every copy, and unchecking Social removed only that lane
  - three overlapping Work events stacked into three rows (lane 36 → 96 px), and each opened on click
  - an event spanning Now was dim before the marker and solid after
  - zooming out shrank events (14 px → 4 px → 1 px) and then turned them into density strips, never widened blocks
  - everything survived a refresh
  - Tab reached the events with a visible focus ring, and Enter opened them
  - hide and show of Education worked
- My browser test events were cleared from the local dev database afterward.
- **Open question for me (D10):** density opacity is the true covered fraction, as specified. With sparse data (a handful of events), the strips fade to invisible at decade zoom. A minimum visible opacity would show that something exists there, but it would no longer be a true fraction.
- 107 tests pass, typecheck clean, build OK.
- Answered the D10 question: add a minimum darkness of about 1/4 → any column with activity now draws at an opacity of at least 0.25, and busier columns keep their true fraction. Updated D10 in SPEC.md.
  - **AI got wrong:** the floor exposed a hidden floating-point bug. An interval ending exactly on a column boundary computed as 3.9999999 px, leaving a ~1e-7 sliver in the previous column. Rounding used to hide it, but the floor turned it into a visible extra column. Fixed by snapping edges within 1e-6 px to the boundary. Three existing tests caught it.
  - 108 tests pass.

### Oct 18, 2026: Stage 5, recurrence
- Asked to begin Stage 5 (I didn't separately report the Stage 4 hand check).
- **Probing ical.js first paid off:**
  - Its iterator rolls invalid dates over: a yearly Feb 29 series gave 2029-03-01, 2030-03-01, …, but RFC 5545 says to skip them.
  - Explicit `BYMONTH`/`BYMONTHDAY` fixes that, but only when iteration starts on a valid date.
  - So expansion makes yearly and monthly rules explicit and also filters anything that breaks them.
  - It costs ~12 µs per occurrence, so daily/weekly rules without COUNT jump ahead (keeping the interval's phase) instead of iterating from 2026 every time.
- `src/time/localTime.ts` handles wall-clock → instant per D3:
  - nonexistent spring-forward times move forward by the gap
  - ambiguous fall-back times take the first occurrence
  - tested in Pacific, Kolkata (+5:30), and Sydney (southern hemisphere)
- `src/time/recurrence.ts`:
  - ical.js iterates floating wall times, and each one converts in the event's own zone. Timed occurrences keep their wall-clock length, so "Sleep 23:00–07:00" stays 23:00–07:00 even on the 25-hour night.
  - UNTIL is enforced in the right zone.
  - EXDATEs are honored, and COUNT counts EXDATE'd occurrences (RFC).
  - A per-series LRU cache keyed by power-of-two window buckets (§7).
- Overrides are stored as normal records with `recurrenceParentId`/`recurrenceId`. The index draws them as one-offs and hides the occurrence they replace.
- D13 scopes (`src/data/repo/recurrence.ts`), each in one transaction:
  - **This occurrence:** an edit creates or updates an override, and a delete adds an EXDATE (dropping any override).
  - **This and following:** sets UNTIL just before the occurrence and starts a new series there. A COUNT carries over as what's left, and later EXDATEs and overrides move to the new series.
  - **All:** applies the clicked occurrence's change in wall-clock time to the series start, and shifts EXDATEs and override keys by the same amount.
  - "Following" from the first occurrence behaves as "All".
- UI:
  - Repeat controls (daily / weekly with weekday checkboxes / monthly by day / yearly, an interval, and ends never / on date / after N).
  - Clicking an occurrence opens that occurrence's own times. Save and Delete then ask for a scope. "This occurrence" is hidden once the rule is changed, since an override can't have its own rule.
  - Stored rules the controls can't express (e.g. from imports) are shown as "Custom rule" and kept verbatim unless replaced.
  - **Deviation:** the All-day checkbox is locked while editing a repeating event, because converting a whole series between timed and all-day has no clean meaning for its exceptions.
- **AI got wrong:**
  - Two recurrence-repo test expectations passed the series start instead of the occurrence's own time, so the tests asked for something no user would do. The code was right.
  - A day-window off-by-one in COUNT-before-split for all-day series was caught by reading the code before it shipped.
  - The new delete flow briefly showed the scope list for one-off events too; fixed before testing.
- **Performance problem found and fixed:** in the browser, zooming out to 150 years with one endless daily series froze the page for up to **4.2 s** (≈160,000 occurrences through ical.js). Now, once a pixel column spans at least one full gap of a simple DAILY/WEEKLY rule without COUNT, the index returns a single coverage band at the series' average share of time instead of every occurrence. A test checks that this matches full expansion within one opacity step per column, and EXDATEs are ignored at that scale. After the fix: zooming out to the maximum had a 118 ms worst frame (9 frames over 50 ms in the in-between range just before the band takes over), and panning at maximum zoom-out peaked at 14 ms. The remaining hitch is for the Stage 8 benchmark.
- Checked in the browser:
  - A weekly Monday 9:00 class showed 09:00 on every Monday from Oct 19 to Dec 14, on both sides of Nov 1.
  - Deleting Nov 9 removed only that occurrence. Moving Nov 16 to 11:00 moved only that one, and its form opened at 09:00, the occurrence's own time.
  - "This and following" from Nov 30 renamed and moved Nov 30, Dec 7, and Dec 14 to 10:00 and left the earlier ones alone.
  - With an endless daily run, panning across Nov 2060 → May 2062 ran at a 6.9 ms median frame and a 34.7 ms worst, with none over 50 ms.
  - Test data cleared afterward.
- Testing note: a hidden browser pane pauses `requestAnimationFrame`, so the app can't be checked there.
- 160 tests pass, typecheck clean, build OK.
- Verified Stage 5 by hand: everything works, but the "Never ends / Ends on / Ends after" radios sat in the middle of the panel instead of against the left edge (screenshot).
  - **AI got wrong:** the panel's text-field rule (`.form input:not([type=checkbox]):not([type=color])`) also caught radio buttons, giving them `width: 100%`. Its high specificity also beat the `.short` width, so the "Every ___" box stretched too. Fixed by excluding radios and wrapping the selector in `:where()` so smaller rules can override it. Checked in the browser: all three radios sit 13 px from the fieldset edge, and the Every box is 63 px wide.

### Oct 18, 2026: Stage 6, milestones
- Asked for Stage 6 → `src/time/milestones.ts`:
  - `isMilestoneComplete`: the D12 rule. Achievements complete only when marked, and date-based milestones derive completion from today, ignoring any stored flag.
  - `nearestMidnight`: compares against the real midnights on either side, so drag snapping is right on 23- and 25-hour days (tested on Nov 1, 2026 and Mar 14, 2027).
- Milestone repository: create, update, delete. Date-based milestones never store `completed` or `completedAt`. A manual milestone records `completedAt` (today) when marked complete and drops it when unmarked.
- UI:
  - Add Milestone opens an editor with title, date, "Completes: when I mark it complete / when its date arrives", a Completed checkbox (achievements only; date-based shows its derived state), description, and a two-step delete.
  - Milestones in the ruler are focusable buttons with names like "Milestone: Graduation, Tue 20 Oct 2026, not complete". Enter opens one.
  - Drag a milestone by its ruler label, or anywhere on its full-height line (12 px grab area). It previews at the snapped day while moving and saves on release, and a press without movement opens it instead. Milestone drags don't pan or turn off LIVE.
- The ruler SVG changed from `role="img"` to `role="group"`, because `img` hides its children from screen readers and the milestone buttons inside it need to be reachable.
- Checked in the browser (pane visible, real mouse):
  - Added "Graduation" on Oct 20, which showed dashed (not complete).
  - Dragging it ~1.3 days left snapped it to Mon 19 Oct 00:00, and LIVE stayed on.
  - After a reload it was still stored as 2026-10-19.
  - Clicking its line opened the editor, and Delete → "Delete milestone" removed it, leaving only the seeded 2065 milestone.
- Tests cover a past-dated achievement staying incomplete until marked, date-based derivation, and deleting the 2065 milestone surviving a restart (repository level and UI).
- 173 tests pass, typecheck clean, build OK.
- Verified Stage 6 by hand ("all tests passed").

### Oct 18–19, 2026: Stage 7, import and export
- Asked for Stage 7 → probed ical.js first. It gives wall-clock fields plus the TZID parameter, marks UTC as `zone: 'UTC'`, exposes DURATION, returns EXDATE values per line, and throws on malformed files.
- Fake fixtures in `tests/fixtures/`, all invented, no real data:
  - a Google export (TZID, UTC, all-day, a weekly series with an EXDATE, a moved occurrence, and a cancelled occurrence)
  - an Outlook export (a quoted and an unquoted Windows TZID, plus an unknown zone defined only by VTIMEZONE)
  - a recurring series with exceptions (several EXDATE lines, two overrides, RDATE)
  - all-day and multi-day events (including no DTEND and a yearly Feb 29 series)
  - rows that should be skipped
  - a malformed .ics
  - CSVs, good and bad
  Checked that `.gitignore` lets fixtures through but still ignores a stray `.ics` elsewhere.
- `src/import/ics.ts`:
  - D15 zones: an IANA name is used directly, a table of 41 common Windows names (CLDR) is mapped, anything else falls back to the file's VTIMEZONE with a warning, and floating times use the display zone.
  - EXDATE and RECURRENCE-ID become occurrence keys in the series' own terms.
  - RDATE is listed as unsupported. HOURLY and finer rules, missing starts, and ends before starts are skipped with reasons, and a missing UID gets a stable synthetic one.
- `src/import/csv.ts` implements the §5.9 format (papaparse):
  - spreadsheet-style row numbers
  - timed rows must carry an offset, and impossible dates like Feb 30 are rejected
  - all-day ends are inclusive and may be empty
  - categories are matched case-insensitively, and unknown ones are collected
  - rrules are checked with ical.js
  - any bad row blocks the whole import
- `src/import/preview.ts`, D14:
  - Each candidate is classified new / updated / unchanged / skipped (with a reason) on `(externalUid, recurrenceId)`.
  - Commits run in one Dexie transaction: series first, then overrides and cancellations.
  - Updated events keep their categories, and occurrences deleted locally stay deleted after a re-import (EXDATEs are merged).
  - Cancelled occurrences add an EXDATE, and a cancelled whole event deletes the stored copy.
  - A simulated failure part-way leaves 0 events.
  - **Small interpretation:** a cancellation of something that exists counts as "updated" (with the reason "cancelled"), to stay within the spec's four categories.
- `src/data/backup.ts`: export in the documented shape and file name. Restore validates shape, schema version, category references, and event times, shows counts, needs an explicit checkbox, replaces everything in one transaction, and marks the database seeded so deleted seed data can't return.
- UI: Import opens a side panel (.ics / .csv / .json) with counts, a date range, a sample, skip reasons, warnings, and a category picker (ICS) or an unknown-category choice (CSV). Export downloads `continuum-backup-YYYY-MM-DD.json`.
- **AI got wrong:**
  - Two import-test expectations: my edited file moved a start past its end, and I used the wrong UTC date for an 18:00 PDT occurrence.
  - Fixture paths broke under jsdom's `import.meta.url`.
  - In the browser, the preview's date range ended at a series' *first* occurrence ("to 25 Nov") instead of its last ("to 23 Dec"). Fixed: finite series expand to find their last end, and endless ones are flagged.
  - "1 milestones" in the restore summary.
- Checked in the browser, using your real dev data:
  - Export captured exactly 2 events / 8 categories / 1 milestone.
  - Importing the fake Google file previewed 5 new + 1 updated and committed. Re-importing showed 6 unchanged and 0 new.
  - A bad CSV listed rows 3–7 with reasons, had no Import button, and wrote nothing.
  - Restore stayed disabled until confirmed, then brought back exactly "graduation" and "test2".
  - A dev hot reload wiped my in-page copy of the backup partway, so I first removed the imported records by `source: "ics"` (your two events were never touched), then reran the full export → import → restore flow in one pass.
- Build note: the bundle is now over 500 kB (ical.js and papaparse). That's a warning, not an error, and is for Stage 8 (code-split the import code).
- 218 tests pass, typecheck clean, build OK.
- Verified Stage 7 by hand ("These things are functional!").

### Oct 19, 2026: Stage 8, polish and wrap-up
- Asked for Stage 8 → I started with the §7 benchmark, since it was the biggest risk.
  - `?benchmark` opens a **separate** IndexedDB (`continuum-benchmark`) seeded with 1,000 one-off events and 50 series (10 endless daily, 20 weekly, 8 monthly, 7 yearly, and 5 daily with COUNT=500), with a banner. Real data is never touched.
  - Measured on the production build at 1280 px.
- **AI got wrong:** `vite preview` served HTML for every asset, because `vite.config.ts` set `base: "/continuum/"` only for `command === "build"`, while preview runs as "serve". I first blamed the preview server starting before the build had finished, which was wrong. Fixed with Vite's `isPreview` flag. Playwright would have hit the same bug.
- **First measurement (bad):** zooming out to 40 years froze up to **2.9 s**, and panning at 40 years up to 1.1 s. Profiling showed ical.js iteration at ~12 µs per occurrence plus my DST conversion at ~6 µs. Fixes, each measured:
  1. Cached zone offsets (`offsetAt`): per-zone, per-year transition tables from `tzScan`, checked against `tzOffset` on 7 zones × 1,500 random instants from 1975–2100 plus every 2026 transition ±1 ms.
  2. **Recurrence fast path.** I asked, and **chose "fast path, tested"**. Simple rules are expanded with calendar arithmetic, and ical.js still parses everything and expands the rest. A property test compares both engines on 2,000+ random rules (DST zones, month ends, Feb 29, intervals, weekdays, WKST, COUNT, UNTIL, all-day; >20,000 occurrences), and they must match exactly. It's 5× faster or more. D3 in SPEC.md is annotated.
  3. Fixed one-year cache buckets, so zooming reuses expansions instead of redoing them at every power of two.
  4. A fast label formatter: date-fns + TZDate took ~45 µs per event (57 ms for 1,268 events). The new one is checked against date-fns on 500 random events. **This also fixed a latent bug:** all-day *repeating* events labeled every occurrence with the series' first date.
  5. `seriesEnd`: windows after a COUNT series ends are skipped. Before, every empty year re-walked all 500 occurrences, which `?benchmark` timing marks traced as **165 ms per query**.
- **Final benchmark (production build, 1280 px):**
  - pan at 3 h: worst frame 7 ms
  - pan at 1 month: worst 42 ms
  - pan at 40 years: worst 49 ms
  - zoom wiggles at each span: worst 7 / 35 / 83 ms, with 1 of 119 frames over 50 ms at 40 years
  - **Still hitchy:** a fast sweep from 1 month all the way to 40 years (≈35 ms median, frames up to ~110–200 ms) while never-seen scales are first expanded. Once seen, they're cached.
- **Settings:** theme (dark/light), display time zone (device or a validated IANA name), snap threshold, and "Your data" (local-storage explanation, persistent-storage status from `navigator.storage.persisted()`, usage/quota, Export a backup, and an "Ask to keep my data" button per D16). About links to the GitHub repo.
- **Light theme:** all colors are now tokens (the error, warning, danger, and lane colors were hard-coded), with `[data-theme="light"]` overrides.
- **Responsive:** the toolbar wraps instead of overflowing, the side panel floats over the timeline at ≤900 px, lane labels narrow to 132 px, and long lane names end in an ellipsis with a tooltip. Checked at 674 px wide.
- **Accessibility:**
  - Focus returns to whatever opened the panel when it closes.
  - The form's submit button was renamed from "Add event" to **"Create event"**, because it was indistinguishable from the toolbar's "Add Event" to screen readers (Playwright caught this).
  - Reduced motion was already respected for snapping and Return to Now.
- **Error states:** a clear storage-blocked screen with Reload, error boundaries around the timeline and the side panel, and a dismissible notice if Export fails.
- **Import:** files that lost their extension are recognized by content (Playwright downloads have no extension), and the import code (papaparse) now loads only when Import is opened (33 kB). The main bundle is still 509 kB (158 kB gzipped) because recurrence needs ical.js at startup. Vite warns over 500 kB, and I left the warning rather than hide it.
- **Playwright** (`npm run test:e2e`, 7 smoke tests on the production build at `/continuum/`): clean load with no console errors, adding an event with only the keyboard (and surviving a reload), keyboard pan/zoom/N, .ics import and unchanged re-import, bad CSV rows, export → add → restore, and light theme + About link. Added to CI before deploy.
- README: setup, scripts, testing, benchmark mode, deployment, the ICS/CSV formats, backup and restore, storage limits, and keyboard shortcuts.
- 229 unit/component tests and 7 Playwright tests pass, typecheck clean, build OK.

### Oct 19, 2026: Portfolio card (HANDOFF §5)
- Asked Claude Code to make the portfolio edits with placeholder text for now → it cloned `TrentenMUW.github.io` into `C:\ClaudeCode\TCSS490\TrentenMUW.github.io` and edited only `artifacts.js` (card `id: 2`): title "Continuum", status "complete", a link to the live app, a drafted factual description, `ideas: []`, and `reflection: "TODO(Trenten): …"`. It also added an entry to the portfolio's own LOG.md.
- Checked locally: the card renders as complete, with a working "View artifact" link. The About link back to this repo was already in Settings (Stage 8).
- **Not committed or pushed** in the portfolio repo. My reflection is still a placeholder, I still need to approve the description, and HANDOFF requires `grep -rn "TODO(Trenten)"` to come back empty before pushing.
- Trenten gave permission to push the portfolio with the placeholder → committed and pushed `TrentenMUW.github.io` (2b01236). The live card shows Continuum as complete, links to the app, and has a `TODO(Trenten)` reflection to be replaced later.
