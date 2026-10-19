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
