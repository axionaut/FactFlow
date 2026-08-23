# FactFlow Architecture Notes

## Purpose
The app is a single-page, local-first study tool for quiz preparation. It ingests a question bank, highlights recurring patterns in topic frequency and tier distribution, and surfaces prioritized drill material based on recent and high-frequency signals.

## Local storage model
- Storage is implemented with `localStorage` behind a simple data layer in `app.js`.
- The app persists all user-added and imported questions under the key `kbc-prep-app-v1`.
- The project intentionally avoids a backend so it works offline and can be opened directly in a browser.

## Core workflow
1. Import CSV/JSON or add questions manually.
2. Deduplicate incoming records using fuzzy similarity against the current bank.
3. Derive tier and priority scores from category frequency, season recency, and tag density.
4. Filter and drill through the bank to reinforce repeated patterns.
5. Maintain a current-affairs intake section that feeds directly into the same bank model.

## Key files
- `index.html` — app shell and tabs.
- `styles.css` — mobile-first styling.
- `app.js` — state, import handling, analysis, drill logic, and local persistence.

## Notes
- The app currently uses seeded demo data so the analysis panels are populated on first run.
- User-added import records are accepted in CSV or JSON format and normalized into the built-in question schema.
- The reference panel is intentionally informational and does not include any simulation or EV logic.
