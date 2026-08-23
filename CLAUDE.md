# FactFlow Architecture Notes

## Project summary
FactFlow is a mobile-first, single-page study app for quiz and trivia preparation. It accepts archived question data, detects topic patterns, prioritizes high-value study material, and helps the user drill into weak or recurring areas.

## Current app versioning rule
- Version is tracked in `app.js` as `APP_VERSION`.
- Every push after this point must increment the version number by 1.
- Current live version: `v3`.
- Release convention: `v1`, `v2`, `v3`, ...

## App input model
- The app is designed to discover and study questions from bulk archival imports and current-affairs feeds.
- Manual question entry is intentionally removed; the user should not need to know the question content up front.
- The product’s job is to ingest large question sets and detect patterns automatically.

## Local storage model
- Storage is implemented with `localStorage` behind a simple data layer in `app.js`.
- The app persists all user-added and imported questions under the key `kbc-prep-app-v1`.
- The project intentionally avoids a backend so it works offline and can be opened directly in a browser.
- GitHub Pages is the deployment target for the production front-end.

## Core workflow
1. Import CSV/JSON archives or current-affairs items.
2. Deduplicate incoming records using fuzzy similarity against the current bank.
3. Derive tier and priority scores from category frequency, season recency, and tag density.
4. Filter and drill through the bank to reinforce repeated patterns.
5. Maintain a current-affairs intake section that feeds directly into the same bank model.
6. Keep the app fully static and browser-based; no server-side logic is required.

## Key files
- `index.html` — app shell, tabs, version badge, and UI structure.
- `styles.css` — mobile-first styling and layout system.
- `app.js` — state, scoring, import handling, analysis, drill logic, and local persistence.
- `README.md` — repo usage, local run, and GitHub Pages deployment notes.
- `.nojekyll` — disables Jekyll processing on GitHub Pages.

## Deployment and GitHub workflow
- Repo name: `FactFlow`
- GitHub Pages URL pattern: `https://axionaut.github.io/FactFlow/`
- Pushes to the repo automatically update the live static site.
- Any release change should be committed with a message that includes its version label, e.g. `v3 release`.

## Notes
- The app currently uses seeded demo data so the analysis panels are populated on first run.
- User-added import records are accepted in CSV or JSON format and normalized into the built-in question schema.
- The reference panel is intentionally informational and does not include any simulation or EV logic.
- The app should remain a clean static front-end, not a backend-heavy product.
- v3 removes manual question entry and keeps the product centered on bulk archival intake and pattern discovery.
