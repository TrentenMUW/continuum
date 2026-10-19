# Build Log: TCSS 490 Artifact 2 — Continuum

Format: what I asked → what changed / what the AI got wrong.

## Oct 18, 2026: Choosing the project and planning (Claude, web chat)
- Shared the Artifact 2 assignment and my idea: an endlessly scrolling, left-to-right timeline that imports .ics and .csv calendar files → Claude recommended a separate repo instead of adding it to my portfolio repo. The assignment wants a fresh repo with its own CLAUDE.md and log, and the portfolio is meant to stay a no-build-step site where only `artifacts.js` changes.
- Prepared the full Continuum specification and shared it → Claude confirmed the separate repo (the React/Vite build settles it), flagged that the seeded retirement milestone exposed a real birthdate in a public repo, and noted the spec had no CLAUDE.md or log even though the assignment requires them.
- Decided: the seed birthdate is January 1, 2000, so the "65th Birthday / Retirement" milestone is January 1, 2065. Kept the full scope rather than cutting to a minimal version.
- Asked Claude to add the process requirements and make the open architecture decisions → Claude wrote `CLAUDE.md`, `docs/SPEC.md` (the spec in Markdown, with a Decisions section and per-stage verification checklists), `docs/HANDOFF.md`, and this log. The original PDF stays out of the repo because it contains the old date.

## Build (Claude Code)
- <what was asked> → <what changed>
