# FactFlow

A mobile-first single-page study app for quiz and trivia preparation. It helps you ingest questions, detect topic patterns, prioritize high-value study material, and drill through the bank with category and tier filtering.

## Features

- Bulk import of CSV/JSON question banks
- Fuzzy deduplication against existing data
- Recency-aware prioritization and study queue
- Pattern analysis for categories, tiers, seasons, and recurring tags
- Drill mode for targeted revision
- Current-affairs intake that feeds into the same bank model
- Informational reference panel for current KBC mechanics
- Bundled, provenance-labelled archive corpus with visible season coverage

> The product is intentionally built around bulk archival ingestion and pattern discovery. It does not rely on the user manually typing in question sets or guessing the content in advance.

## Run locally

Open the app directly in a browser from the repository folder, or serve it with a static file server:

```bash
python -m http.server 8000
```

Then visit:

```text
http://localhost:8000
```

Serving over HTTP is required for the bundled JSON corpus. Opening `index.html` directly falls back to locally saved or demo data because browsers block local `fetch()` requests.

## Corpus

`data/kbc-corpus.json` contains normalized questions extracted from the public [IQgarage KBC episode archive](https://www.iqgarage.com/kbc-questions-and-answers/). Current coverage is partial (Seasons 6–9), is not official Sony data, and its answers have not been independently verified. Missing seasons must not be inferred from.

Rebuild it with `node tools/build-corpus.mjs`. The generator retains a source URL and provenance status on every record and rejects questions without four options and a resolvable answer.

## Publish to GitHub Pages

1. Create a new public or private GitHub repository.
2. Push this repository to GitHub:

```bash
git remote add origin https://github.com/<your-username>/<your-repo>.git
git branch -M main
git push -u origin main
```

3. In GitHub, open the repository and go to Settings → Pages.
4. Set Source to `Deploy from a branch`.
5. Choose the `main` branch and the root folder `/`.
6. Save. GitHub Pages will provide a URL such as:

```text
https://<your-username>.github.io/<your-repo>/
```

## Notes

- The app stores data in `localStorage`, so it works fully client-side without any backend.
- This is a static app and is suitable for GitHub Pages deployment.
