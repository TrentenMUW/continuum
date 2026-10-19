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
