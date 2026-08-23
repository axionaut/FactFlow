# FactFlow

A mobile-first GK and current-affairs preparation app. It keeps the user ready through targeted revision, patterned topic analysis, and recency-aware study guidance instead of requiring manual question entry or archive browsing.

## Features

- GK and current-affairs preparation workflow
- Pattern analysis as a supporting layer for weak spots and repeated themes
- Recency-aware prioritization and study queue
- Category, tier, and tag-based drill mode
- Answer selection with automatic evaluation and revision tracking
- Contextual recommendation logic for recurring topic clusters
- Bundled, provenance-labelled archive corpus plus fresh public trivia questions from multiple sources

> The main objective is to keep the user prepared on GK and current affairs. Pattern analysis helps surface weak spots and high-yield topics; it is not the product center.

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

The repository refreshes its corpus automatically through GitHub Actions every six hours. The scheduled job gathers unseen pages from the public KBC archive and fresh answer-keyed questions from Open Trivia DB and The Trivia API, normalizes them, deduplicates them against the stored bank, and commits the updated JSON for the browser app to consume. Previously gathered archive pages are not fetched again.

## Corpus

`data/kbc-corpus.json` contains normalized questions extracted from the public [IQgarage KBC episode archive](https://www.iqgarage.com/kbc-questions-and-answers/) and fresh questions from [Open Trivia DB](https://opentdb.com/) and [The Trivia API](https://the-trivia-api.com/). KBC coverage is partial (Seasons 6–9), is not official Sony data, and its archive answers have not been independently verified. Missing seasons must not be inferred from.

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
