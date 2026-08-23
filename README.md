# FactFlow

A mobile-first single-page study app for quiz and trivia preparation. It helps you ingest questions, detect topic patterns, prioritize high-value study material, and drill through the bank with category and tier filtering.

## Features

- Bulk import of CSV/JSON question banks
- Manual question entry
- Fuzzy deduplication against existing data
- Recency-aware prioritization and study queue
- Pattern analysis for categories, tiers, seasons, and recurring tags
- Drill mode for targeted revision
- Current-affairs intake that feeds into the same bank model
- Informational reference panel for current KBC mechanics

## Run locally

Open the app directly in a browser from the repository folder, or serve it with a static file server:

```bash
python -m http.server 8000
```

Then visit:

```text
http://localhost:8000
```

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
