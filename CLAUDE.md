# Continuum

A lifelong, local-first timeline app. Time is one continuous horizontal axis: past on the left, future on the right, and width equals duration. Built with React, TypeScript, and Vite, rendered in SVG, stored in IndexedDB through Dexie, and deployed to GitHub Pages at https://trentenmuw.github.io/continuum/.

Owner: Trenten (GitHub `TrentenMUW`). Course: TCSS 490, Artifact 2.

## Read first, every session
1. `docs/SPEC.md` holds the requirements and is authoritative. Its "Decisions" section overrides anything older, including the original PDF spec, which is deliberately not in this repo.
2. The latest entry in `LOG.md`.
3. "Current status" at the bottom of this file.

`docs/HANDOFF.md` covers the first session and the final portfolio-card step.

## Commands
```
npm install
npm run dev         # local dev server
npm run test        # Vitest
npm run test:watch  # Vitest in watch mode
npm run test:e2e    # Playwright smoke tests (from Stage 8)
npm run typecheck   # tsc --noEmit
npm run build       # production build, base /continuum/
npm run preview     # serve the production build locally
```
Keep this list accurate whenever scripts change.

## Source layout
```
src/time/     pure time math: viewport mapping, calendar ticks, recurrence expansion. No React. Heavily unit-tested.
src/data/     Dexie schema, migrations, seeding, repositories, in-memory interval index, backup/restore.
src/import/   .ics and .csv parsing into an import-preview model.
src/state/    viewport store (lives outside React) and app store.
src/ui/       React components.
tests/fixtures/  FAKE .ics / .csv / .json files only.
```

## Rules
1. **Stage by stage.** Follow the stages in `docs/SPEC.md`. A stage is done when its tests pass, typecheck is clean, and `npm run build` succeeds. Then stop, give Trenten that stage's "Verify by hand" list, and wait for his go-ahead before starting the next stage.
2. **Log as you go.** Append to `LOG.md` after each meaningful step, in the form "what was asked → what changed (→ what went wrong and how it was fixed)". Keep entries short. Record every deviation from the spec and the reason for it.
3. **Commit small.** Make a clear commit after each working step. Never push a broken build to `main`, because it deploys.
4. **Privacy.** Never commit real calendar data. Only fake data goes in `tests/fixtures/`. Add no personal details about Trenten beyond what `docs/SPEC.md` already contains, and no email addresses in the app or the docs.
5. **Never speak for Trenten.** Don't write his reflections, opinions, or ideas. Leave `TODO(Trenten)` and ask him.
6. **Time correctness comes first.** Positions come from real timestamps. Never assume a day is 24 hours or that months and years have a fixed length. When you find a date bug, write a failing test before fixing it.
7. **Local only.** No backend, accounts, analytics, or network requests at runtime.
8. **Dependencies.** Use the libraries listed in `docs/SPEC.md`, pinned to exact versions. Ask before adding anything else.
9. **Be honest about gaps.** If a requirement can't be met or seems wrong, say so and log it. Never silently skip it or fake it with mock data.
10. **End of session.** Update "Current status" below: the current stage, what works, what's next, and any known issues.

## Current status
Stage 8 built and deployed, waiting for Trenten's "Verify by hand". The portfolio card is edited locally is live with a TODO(Trenten) reflection (Trenten chose to push it that way). Next: replace the placeholder with his reflection and push again. Agreed decisions: density 0.25 minimum opacity (D10), live-mode zoom centers on Now, the recurrence fast path for simple rules (D3 refinement, tested against ical.js). Everything in Stages 1–8 works; see LOG.md. The benchmark is `?benchmark` (separate database). Known issues: a very fast zoom sweep from 1 month to 40 years can drop frames while new scales are first expanded, and the main bundle is 509 kB (158 kB gzipped), over Vite's 500 kB warning, because ical.js loads at startup. Testing: the browser pane must be visible, or rAF doesn't run. Restart `vite preview` after each build, because it caches the file list. Known issues: the toolbar overflows below ~1000 px (Stage 8). Zooming out past ~1 day/px with an endless daily series can still drop a few frames (~100 ms), which the Stage 8 benchmark will revisit. The All-day checkbox is locked when editing a repeating event. Testing: the browser pane must be visible, or rAF doesn't run. Known issues: the toolbar overflows below ~1000 px wide (Stage 8). Never use PowerShell Get-Content/Set-Content to edit source, because it corrupts non-ASCII characters.
