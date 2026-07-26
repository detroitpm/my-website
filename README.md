# section8pm.com website

Static website for Section 8 PM, hosted on **Netlify** at https://section8pm.com and
version-controlled on **GitHub**.

## What's here
- `index.html` — the main public homepage
- `owner-faq.html` — the **hidden** owner FAQ page (contract fees + sample PM contract link).
  Intentionally kept out of `sitemap.xml` so it isn't indexed. Do not add it to the sitemap.
- `images/` — image assets
- `robots.txt`, `sitemap.xml` — SEO files

## How updates get published
This site uses automatic deployment. There is **no more drag-and-drop**.

1. Claude (or you) edits the files in this folder.
2. Open **GitHub Desktop**, review the changes, click **Commit to main**, then **Push origin**.
3. Netlify detects the push and automatically rebuilds and publishes section8pm.com within ~1 minute.

## Setup notes
- No build step. It's plain HTML — Netlify publishes the folder as-is (publish directory = root).
- Branch that goes live: `main`.
