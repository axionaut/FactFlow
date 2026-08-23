# FactFlow

FactFlow is a browser-based GK practice app with two complementary modes:

- **Today** builds recall through an adaptive daily queue of new, weak, and due questions.
- **KBC Challenge** tests that preparation through an escalating 15-question, four-option, lock-answer run.

Incorrect answers enter Review until answered correctly. Every attempt is retained separately from the read-only question corpus, allowing progress, accuracy, streaks, topic mastery, and scheduled revision to survive corpus refreshes.

## Product boundaries

- Reviewed English translations of Hindi KBC questions are playable and retain the original Hindi, answer index, attribution, and source URL.
- Machine-translated questions are created privately on the user's device and remain labelled as unreviewed translations.
- IQgarage records remain third-party, incomplete pattern evidence and never appear in drills.
- GKSection and IQgarage answers are supplied by those sources and are not independently fact-checked by FactFlow.
- A verified current-affairs feed is not connected yet. Recently downloaded general trivia is not labelled as current affairs.
- KBC Challenge simulates the question format and escalating difficulty. It does not attempt to reproduce a particular television season, host flow, or lifeline rules.
- Options are reshuffled for every new presentation in Today, Review, and KBC Challenge. The answer is tracked independently of its displayed letter.

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
- `data/gksection-reviewed-en.json` — reviewed Hindi/English question pairs
- `tools/build-corpus.mjs` — incremental corpus ingestion and normalization
- `dev/assert-v15.js` — behavioral and corpus regression checks

User learning state is stored under `factflow-learning-v2` in `localStorage`. The corpus itself is not copied into browser storage. Previous one-answer state from `kbc-prep-app-v1` is migrated once into attempt history.

## Corpus refresh

GitHub Actions runs `node tools/build-corpus.mjs` every six hours. The generator:

1. Reuses successfully fetched archive pages.
2. Fetches bounded batches from GKSection so one source cannot monopolize a refresh.
3. Preserves Hindi questions, four options, answer indices, season, episode, and provenance.
4. Rejects malformed records, including ordering questions that do not have four answer choices.
5. Merges reviewed English translations and removes Open Trivia DB and The Trivia API records.
6. Retries failed or empty pages after a seven-day cooldown.
7. Leaves the corpus file untouched when no question or page state changed.

The playable bank now comes from reviewed English translations of the [GKSection Hindi KBC archive](https://www.gksection.com/hindi/hindi-kbc-season-9-quiz/). Newly discovered Hindi records enter a translation queue. Desktop Chrome 138 or newer can translate batches locally using its built-in Translator API; other browsers retain the reviewed bank. IQgarage is retained only for historical topic patterns. None of these third-party sources is official Sony data, and permission is required before public redistribution where the source does not provide a reuse licence.

## Checks

```bash
node --check learning.js
node --check app.js
node --check tools/build-corpus.mjs
node dev/assert-v15.js
git diff --check
```
