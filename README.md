# Continuum

A lifelong, local-first timeline. Instead of a calendar grid, time is one continuous horizontal line: the past on the left, the future on the right, and width equal to duration. You can zoom smoothly from minutes to decades without ever switching views.

**Live app:** https://trentenmuw.github.io/continuum/

Everything stays in your browser. There are no accounts, no servers, and no network requests at runtime.

## Features

- **One continuous timeline.** Pan and zoom from about 10 minutes to 150 years. Day and month boundaries are calendar-true, including 23- and 25-hour DST days and leap years.
- **Live time.** A Now marker stays put while the timeline moves left at the true rate. Panning turns live mode off, and **Return to Now** (or the N key) turns it back on.
- **Category lanes.** One event can sit in several lanes and still be one record. Overlapping events stack, and events too small to draw become density strips.
- **Repeating events.** Daily, weekly, monthly, and yearly. Edit or delete one occurrence, this and following, or all of them.
- **Milestones.** Full-height gateways. Drag them to reschedule; they snap to days.
- **Import** `.ics` (Google, Outlook, Apple) and `.csv`, with a preview before anything is saved. **Export** and **restore** full JSON backups.
- Dark and light themes, and keyboard access throughout.

## Setup

Requires Node 20 or newer (CI uses Node 24).

```
git clone https://github.com/TrentenMUW/continuum.git
cd continuum
npm install
npm run dev          # http://localhost:5173
```

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm run build` | Production build into `dist/`, served under `/continuum/` |
| `npm run preview` | Serve the production build locally (http://localhost:4173/continuum/) |
| `npm run typecheck` | TypeScript, strict |
| `npm run test` | Unit and component tests (Vitest, fake-indexeddb) |
| `npm run test:e2e` | Playwright smoke tests against the production build |

The first time you run the end-to-end tests, install Playwright's browser with `npx playwright install chromium`.

## Testing

- **Unit tests** cover the time math (viewport mapping, calendar ticks, DST, recurrence), storage, import parsing and dedupe, backup and restore, and the main UI flows.
- **The recurrence fast path** is checked against ical.js on thousands of random rules, and the two must match exactly.
- **Playwright smoke tests** run the core flows in Chromium: load, add an event using only the keyboard, pan and zoom, import, export and restore, and settings.
- **Benchmark:** open the app with `?benchmark` (for example http://localhost:4173/continuum/?benchmark) to load 1,000 sample events and 50 repeating series into a *separate* database. Your own data isn't shown or changed.

## Deployment

Every push to `main` runs `.github/workflows/deploy.yml`: `npm ci` → typecheck → unit tests → build → Playwright → deploy to GitHub Pages. A failing step stops the deploy. In the repository settings, Pages must be set to deploy from **GitHub Actions**.

## Importing

Open **Import**, choose a file, review the preview, then confirm. Nothing is written until you confirm, and each import either fully succeeds or changes nothing.

### .ics (calendar files)

Export from Google Calendar (Settings → Import & export → Export), Outlook, or Apple Calendar.

- **Supported:** titles, descriptions, locations, timed and all-day events, multi-day events, time zones (TZID), repeating events (RRULE), skipped occurrences (EXDATE), changed occurrences (RECURRENCE-ID), and cancellations (STATUS:CANCELLED).
- **Time zones:** standard names like `America/Los_Angeles` are used directly, and common Windows names like `Pacific Standard Time` are translated. Anything else uses the zone defined inside the file, with a warning.
- **Re-importing the same file updates events instead of duplicating them.** The preview reports each one as new, updated, unchanged, or skipped (with the reason). Events you've recategorized keep your categories, and occurrences you deleted stay deleted.
- **Not supported:** extra dates (RDATE), and events that repeat more often than daily. These are listed in the preview.
- New events go into the category you pick in the preview (Miscellaneous by default).

### .csv

```
title,start,end,allDay,description,location,categories,rrule
Morning run,2026-10-20T07:00:00-07:00,2026-10-20T07:45:00-07:00,false,,Green Lake,Health & Exercise,
Dentist,2026-11-03,2026-11-03,true,,,Life & Logistics;Health & Exercise,
Study group,2026-10-21T18:00:00-07:00,2026-10-21T20:00:00-07:00,false,Linear algebra,,Education;Social & Relationships,FREQ=WEEKLY;COUNT=10
```

- Timed rows use ISO 8601 **with an offset** (or `Z`).
- All-day rows use `YYYY-MM-DD`. The end date is **inclusive** and may be left empty for a single day.
- Separate categories with `;`. Names match case-insensitively, and unknown names can be created as new categories or put in Miscellaneous.
- `rrule` is optional (for example `FREQ=WEEKLY;BYDAY=MO,WE`).
- Any invalid row blocks the whole import, and the preview lists each problem with its row number (the header is row 1).
- CSV rows have no stable ID, so **importing the same CSV twice duplicates its events**.

## Backup and restore

- **Export** downloads `continuum-backup-YYYY-MM-DD.json`, which holds all events, categories, milestones, and settings.
- To restore, choose that file in **Import**. The preview shows what's in it, and restoring **replaces everything** only after you confirm.

## Storage and its limits

Continuum stores data in your browser's IndexedDB, for this site only and on this device only.

- Clearing site data, using a private window, or some browser clean-up can erase it. **Export a backup regularly.**
- After you first save something, Continuum asks the browser for *persistent storage*. **Settings → Your data** shows whether it was granted, how much space is used, and lets you ask again.
- Data doesn't sync between browsers or devices. Use Export and restore to move it.

## Keyboard

| Key | Action |
|---|---|
| ← / → | Pan |
| + / − | Zoom |
| N | Return to Now |
| Tab | Move between controls, events, and milestones |
| Enter / Space | Open the focused event or milestone |
| Esc | Close the side panel |

## Project documents

- [`docs/SPEC.md`](docs/SPEC.md): the requirements and design decisions
- [`docs/PLAN.md`](docs/PLAN.md): the implementation plan
- [`LOG.md`](LOG.md): the build log, including what the AI got wrong
- [`CLAUDE.md`](CLAUDE.md): context for the coding agent

Built for TCSS 490 (Artifact 2) with Claude Code. Stack: React, TypeScript, Vite, Dexie (IndexedDB), date-fns with @date-fns/tz, ical.js, papaparse, Vitest, and Playwright.
