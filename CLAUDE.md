# FactFlow Notes

## Release rule
- `APP_VERSION` is tracked in `app.js`.
- Every completed iteration must end with: commit, push to GitHub, and a concise update to this file.
- Current live version: `v6`.
- Release format: `v1`, `v2`, `v3`, ...

## Product direction
- FactFlow is built for bulk archival intake and pattern discovery.
- There is no manual question-entry flow; the app infers and analyzes from imported data.
- The app is static and browser-only, with `localStorage` persistence and GitHub Pages hosting.

## Current state
- Bundled corpus: `data/kbc-corpus.json`.
- Coverage is partial and explicit: Seasons 6–9 public archive only.
- The app focuses on question-pattern analysis, not season-by-season episode breakdowns.
- Data is provenance-labelled and derived from public third-party sources; it is not official Sony material.
- The app serves best over HTTP because the corpus is fetched via `fetch()`.

## Key files
- `index.html` — shell, tabs, version badge, and UI structure.
- `styles.css` — responsive styling.
- `app.js` — state, scoring, import logic, analysis, drill mode, and persistence.
- `data/kbc-corpus.json` — bundled archive corpus.
- `tools/build-corpus.mjs` — corpus generator.
- `README.md` — user-facing repo notes.

## Guardrails
- Keep this file short and actionable; do not dump long logs or TODO lists here.
- Preserve the static, no-backend architecture.
- If a change is shipped, it must be complete and pushed before the next iteration begins.
