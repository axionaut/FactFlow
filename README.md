# FactFlow

FactFlow is a browser-based GK practice app with two complementary modes:

- **Today** builds recall through an adaptive daily queue of new, weak, and due questions.
- **KBC Challenge** tests that preparation through an escalating 15-question, four-option, lock-answer run.

Incorrect answers enter Review until answered correctly. Every attempt is retained separately from the read-only question corpus, allowing progress, accuracy, streaks, topic mastery, and scheduled revision to survive corpus refreshes.

## Product boundaries

- Historical KBC questions are third-party, incomplete pattern evidence. They influence category balance but never appear in drills.
- Practice answers are supplied by public trivia APIs and are not independently fact-checked by FactFlow.
- A verified current-affairs feed is not connected yet. Recently downloaded general trivia is not labelled as current affairs.
- KBC Challenge simulates the question format and escalating difficulty. It does not attempt to reproduce a particular television season, host flow, or lifeline rules.

## Run locally

Serve the repository over HTTP so the browser can fetch the bundled corpus:

```bash
python -m http.server 8000
```

Then open `http://localhost:8000`.

Opening `index.html` directly uses a small offline demonstration bank because browsers normally block local `fetch()` requests.

## Architecture

- `index.html` — Today, KBC Challenge, Review, Progress, and KBC Insights screens
- `learning.js` — pure question classification, scheduling, mastery, and challenge selection logic
- `app.js` — browser state, persistence, safe DOM rendering, and interactions
- `styles.css` — responsive application styling
- `data/kbc-corpus.json` — read-only, provenance-labelled question corpus
- `tools/build-corpus.mjs` — incremental corpus ingestion and normalization
- `dev/assert-v14.js` — behavioral and corpus regression checks

User learning state is stored under `factflow-learning-v2` in `localStorage`. The corpus itself is not copied into browser storage. Previous one-answer state from `kbc-prep-app-v1` is migrated once into attempt history.

## Corpus refresh

GitHub Actions runs `node tools/build-corpus.mjs` every six hours. The generator:

1. Reuses successfully fetched archive pages.
2. Retries failed or empty archive pages.
3. Fetches answer-keyed questions from Open Trivia DB and The Trivia API.
4. Rejects malformed questions and excluded entertainment/gaming niches.
5. Uses stable question identities and deduplicates by normalized question text.
6. Leaves the corpus file untouched when no unique question or archive-page state changed.

The bundled KBC archive currently covers only portions of Seasons 6–9 from [IQgarage](https://www.iqgarage.com/kbc-questions-and-answers/). It is not official Sony data. Source and licensing notes are retained in the corpus.

## Checks

```bash
node --check learning.js
node --check app.js
node --check tools/build-corpus.mjs
node dev/assert-v14.js
git diff --check
```
