# Handoff: Continuum, first Claude Code session

You are starting Continuum for Trenten (GitHub `TrentenMUW`). Before writing any code, read `CLAUDE.md` and then all of `docs/SPEC.md`.

## 0. Starting point
Trenten has created a folder named `continuum` containing `CLAUDE.md`, `LOG.md`, `docs/SPEC.md`, and `docs/HANDOFF.md`. The original PDF spec is deliberately left out because it contains an outdated personal date, and `docs/SPEC.md` replaces it. If a PDF turns up in the folder, don't commit it.

## 1. Tooling and repository
1. Check the tools: `git --version`, `node --version` (Node 20 LTS or newer, 22 preferred), `npm --version`, `gh --version`, `gh auth status`. If `gh` isn't authenticated, have Trenten run `gh auth login` (GitHub.com, HTTPS, browser) and sign in as **TrentenMUW**.
2. Run `git init -b main`. Set the commit identity **locally** to the same name and email Trenten uses in his portfolio repo. Read them with `git -C <path-to-portfolio> config user.name` / `user.email`, or ask him. Don't write the email into any file.
3. Create `.gitignore`:
   ```
   node_modules/
   dist/
   coverage/
   playwright-report/
   test-results/
   .env*
   .DS_Store
   # Personal data never goes in the repo
   *.ics
   *.csv
   *.pdf
   continuum-backup*.json
   !tests/fixtures/**
   ```
4. Make the first commit, "Add project docs", with the four docs and `.gitignore`.
5. Create the public repo from this folder and push it:
   ```
   gh repo create TrentenMUW/continuum --public --description "Continuum: a lifelong, continuous timeline" --source=. --push
   ```
   If the name already exists, **stop and ask Trenten**.
6. Point GitHub Pages at GitHub Actions:
   ```
   gh api -X POST repos/TrentenMUW/continuum/pages -f build_type=workflow
   ```
   If Pages already exists, use `-X PUT` with the same arguments. As a fallback, Trenten can set Settings → Pages → Source: **GitHub Actions**.
7. Add a LOG.md entry for the setup.

## 2. Implementation plan
Before writing application code, create `docs/PLAN.md` covering:
- the folder and file structure
- every dependency with its exact pinned version and what it's for
- the viewport, rendering, and state architecture (how panning avoids re-rendering React every frame)
- the data flow from IndexedDB to the in-memory index, the visible window, the lane layout, and SVG
- the test plan for each stage
- the risks you expect and how you'll handle them

Summarize the plan for Trenten in a few lines, then commit "Add implementation plan" and log it. If the plan departs from `docs/SPEC.md`, list each departure and wait for Trenten to agree.

## 3. Stages 1 and 2, then deploy
Build Stage 1 and then Stage 2 exactly as `docs/SPEC.md` describes, stopping after each one for Trenten's verification. As part of Stage 2, add the GitHub Actions workflow so a live link exists early:
- triggered on push to `main`
- steps: `npm ci` → `npm run typecheck` → `npm run test` → `npm run build` → `actions/upload-pages-artifact` (`dist`) → `actions/deploy-pages`
- Vite `base` is `/continuum/` for the production build

Confirm the deploy with `curl -sI https://trentenmuw.github.io/continuum/ | head -1`, which should return 200. Load the page and check the browser console for 404s on assets.

## 4. Every later session
Read `CLAUDE.md`, the latest `LOG.md` entry, and "Current status". Do the next stage. Stop for verification. Update the log and the status.

## 5. Finishing: the portfolio card
Do this after Stage 8, or sooner if Trenten asks. Work in Trenten's portfolio repo (`TrentenMUW.github.io`, a separate clone) and edit **only** `artifacts.js`, updating the object with `id: 2`:
```js
{
  id: 2,
  title: "Continuum",
  status: "complete",
  link: "https://trentenmuw.github.io/continuum/",
  description: "<one or two factual sentences about what Continuum is and does>",
  reflection: "TODO(Trenten): a few sentences on how it went and what you learned.",
  ideas: []
}
```
- You may draft the description, which is factual. Show it to Trenten before committing.
- The reflection is **his**. Ask for it, tidy the wording if he asks you to, and never invent it.
- Before pushing, `grep -rn "TODO(Trenten)" .` must return nothing.
- Add an entry to the portfolio's own `LOG.md`.
- The Continuum app should link back to its source repo, `https://github.com/TrentenMUW/continuum` (an "About" item in Settings is enough), so the card can point to the live app.
- Remind Trenten to submit his portfolio link on Canvas, the same link as Artifact 1.
