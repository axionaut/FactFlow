# FactFlow Notes

## Release rule
- `APP_VERSION` is tracked in `app.js`.
- Every completed iteration must end with: commit, push to GitHub, and a concise update to this file.
- Current live version: `v38`.
- Release format: `v1`, `v2`, `v3`, ...

## Product direction
- FactFlow is a GK and current-affairs preparation app first, with pattern analysis as a supporting layer.
- It is not a manual upload tool and it does not require the user to know or type questions in advance.
- The system should discover, normalize, and grow a question bank from public archive and future intake sources automatically.
- The app is static and browser-only, with `localStorage` persistence and GitHub Pages hosting; GitHub Actions refreshes the committed corpus on a schedule.

## Current state
- Bundled corpus: `data/kbc-corpus.json`, refreshed by `tools/build-corpus.mjs` and `.github/workflows/refresh-corpus.yml`.
- The app is designed to keep the user prepared and updated on GK/current affairs, with pattern analysis helping to surface weak spots and repeat themes.
- Fresh practice questions currently come from Open Trivia DB and The Trivia API; archive pages are fetched only once and existing questions are retained and deduplicated.
- Fresh practice intake rejects gaming, anime, comics, and similar entertainment trivia while retaining relevant Indian and international GK domains.
- Drill Mode is the landing page; selecting an option evaluates and records the answer automatically.
- Data is provenance-labelled and derived from public third-party sources; it is not official Sony material.
- The app serves best over HTTP because the corpus is fetched via `fetch()`.
- v30 uses a full-width responsive desktop shell with sidebar navigation, rotates fresh questions across Today and Challenge, and prevents mobile horizontal overflow.
- v30 treats GKSection translations as archive-only KBC pattern evidence; Wikidata facts remain learner-facing practice, including in the bundled corpus.
- v30 makes Today continuous with no session controls or finite progress framing, removes currency country-name giveaways, and highlights the correct answer in every feedback path.
- v34 persists the continuous Today question number, saves learning state on visibility/pagehide events for mobile browsers, and shows the loaded version on mobile.
- iOS Private Browsing may intentionally discard browser storage; the app cannot persist data in that browser mode.
- Review sessions start with the selected card and continue through the remaining due questions.
- v38 rebuilt question supply, selection, and the Progress page around what KBC actually asks.
- The archive is a pattern teacher, never a question bank: `tools/pattern-profile.mjs` derives category mix, question shape, and difficulty tier from it, and generation targets that profile. Archive questions are never served as practice.
- KBC's dominant shape is set membership ("Which of these is X?"), not attribute lookup. `tools/wikidata-source.mjs` supports both; membership profiles pair a member query with a foil query of same-type non-members.
- `tools/current-affairs-source.mjs` generates dated questions from date-qualified Wikidata statements. Current-affairs entries expire and are rebuilt by the refresh workflow rather than retained, because a stale "current" answer is a wrong answer.
- Today selects weak-topic-first across the whole pool, not unseen-only. Questions below full accuracy stay eligible; mastered and due ones are excluded (due ones belong to Review).
- One question stem may appear only once per session; membership questions share stems, so uniqueness is enforced on `canonical_key`, not on question text.
- Lookup questions whose stem is ambiguous (two films named Devdas, three Battles of Panipat) are dropped at build time.
- The bank keeps growing; `MAX_PRACTICE_QUESTIONS` prunes round-robin by stem so no template can dominate. `Learning.masteredKeys` identifies per-learner questions safe to retire.
- Progress shows "What to fix next" instead of an activity log, and names categories that have no questions available rather than showing an unactionable 0% bar.

## Key files
- `index.html` — shell, tabs, version badge, and UI structure.
- `styles.css` — responsive styling.
- `app.js` — state, scoring, analysis, drill mode, and persistence.
- `data/kbc-corpus.json` — bundled archive corpus.
- `tools/build-corpus.mjs` — corpus generator.
- `README.md` — user-facing repo notes.

## Guardrails
- Keep this file short and actionable; do not dump long logs or TODO lists here.
- Preserve the static, no-backend architecture.
- Manual upload or manual question entry is not the product model.
- If a change is shipped, it must be complete and pushed before the next iteration begins.
