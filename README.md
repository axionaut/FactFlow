# FactFlow

FactFlow is a browser-based GK practice app with two complementary modes:

- **Today** uses unseen questions only, rotating across the bank before fresh questions recur.
- **KBC Challenge** uses 15 unseen questions in an escalating four-option, lock-answer run.

Incorrect answers enter Review until answered correctly. Every attempt is retained separately from the read-only question corpus, allowing progress, accuracy, streaks, topic mastery, and scheduled revision to survive corpus refreshes.

## Product boundaries

- Validated English translations of Hindi KBC questions retain the original Hindi, answer index, attribution, and source URL as archive evidence only.
- Raw machine translations are never playable. The retired browser translation cache is deleted automatically.
- Wikidata structured facts produce accumulating India and international questions under CC0. Correct answers come from structured relations; distractors come from the same relation type.
- GKSection and IQgarage are non-playable KBC pattern corpora. They train the app's topic, category, difficulty, and KBC-style weighting for Today and Challenge; they never train the learner directly.
- GKSection answers are supplied by that source and are not independently fact-checked by FactFlow; those questions are not learner practice.
- A verified current-affairs feed is not connected yet. Recently downloaded general trivia is not labelled as current affairs.
- KBC Challenge simulates the question format and escalating difficulty. It does not attempt to reproduce a particular television season, host flow, or lifeline rules.
- Ordinary practice and Challenge never repeat practised questions. Repetition is confined to Review.
- Session and Challenge selection cap repeated categories and question families, and prevent adjacent questions from sharing either one when the available difficulty band permits it.
- Active challenges are rebuilt automatically when a corpus migration removes any question on their ladder.
- Review options are reshuffled on every presentation. The answer is tracked independently of its displayed letter.

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
- `tools/wikidata-source.mjs` — structured-fact queries, distractors, and source cursors
- `dev/assert-v18.js` — behavioral and corpus regression checks

User learning state is stored under `factflow-learning-v2` in `localStorage`. The corpus itself is not copied into browser storage. Previous one-answer state from `kbc-prep-app-v1` is migrated once into attempt history.

The browser checks for a newer bundled corpus every ten minutes. When fewer than 120 unseen questions remain, it also requests bounded Wikidata batches in the background and keeps valid additions locally until the scheduled shared corpus catches up. Starting a session below the requested size triggers up to three immediate replenishment batches before selection.

## Corpus refresh

GitHub Actions runs `node tools/build-corpus.mjs` every six hours. The generator:

1. Reuses successfully fetched archive pages.
2. Fetches bounded batches from GKSection so one source cannot monopolize a refresh.
3. Preserves Hindi questions, four options, answer indices, season, episode, and provenance.
4. Rejects malformed records, including ordering questions that do not have four answer choices.
5. Appends bounded batches of notable India and international facts from Wikidata.
6. Generates four unique same-type options while preserving the structured correct answer and entity URL.
7. Rejects broken encoding, duplicate options, retired entities, and unsupported chemical elements.
8. Merges validated English translations and removes Open Trivia DB and The Trivia API records.
9. Retries failed or empty archive pages after a seven-day cooldown.
10. Leaves the corpus file untouched when no question or source state changed.

The learner-facing bank combines validated English translations from the [GKSection Hindi KBC archive](https://www.gksection.com/hindi/hindi-kbc-season-9-quiz/) with accumulating [Wikidata structured facts](https://www.wikidata.org/wiki/Wikidata:Data_access). The separate IQgarage archive influences selection weights but never enters Today, Challenge, or Review. Raw Hindi records never enter practice automatically. None of the third-party KBC archives is official Sony data, and permission is required before public redistribution where a source does not provide a reuse licence.

## Checks

```bash
node --check learning.js
node --check app.js
node --check tools/build-corpus.mjs
node --check tools/wikidata-source.mjs
node dev/assert-v18.js
git diff --check
```
