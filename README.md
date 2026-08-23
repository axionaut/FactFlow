# FactFlow

A mobile-first single-page study app for quiz and trivia preparation. It focuses on pattern analysis and recommendation logic rather than manual question entry or season-by-season browsing.

## Features

- Autonomous question-bank discovery and pattern analysis
- Recency-aware prioritization and study queue
- Category, tier, and tag-based drill mode
- Contextual recommendation logic for recurring topic clusters
- Bundled, provenance-labelled archive corpus for research and training data

> The app is not built around manual uploads or manual question entry. The product model is autonomous data discovery, normalization, and pattern-based study guidance.

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
