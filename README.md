# section8pm.com

The Section 8 PM website **and** the internal tools that run on it. Hosted on
**Netlify** at https://section8pm.com, version-controlled on **GitHub**.

## The public website
- `index.html` — the homepage.
- `owner-faq.html` — the **hidden** owner FAQ (contract fees + sample PM contract).
  Deliberately kept out of `sitemap.xml` so Google doesn't index it. Do not add it.
- `images/` — pictures used by the site.
- `robots.txt`, `sitemap.xml` — search-engine files.

## The internal tools
These are real pages on the site, just not linked from anywhere public.

**Scope of Work builder** — `/sow.html`
Build a SOW for a property, price each line, assign contractors, download the
Contractor Copy or Owner Copy as a PDF, or send it to CompanyCam Files.
"Upload SOW file" loads the JSON that Claude's `/build-sow` skill produces.
- `sow.js` — the builder screen.
- `sow-view.html` + `sow-view.js` — the **read-only page an owner sees**. This is
  what "Copy owner link" hands out: no prices to edit, no buttons, just the scope.
- `sow-shared.js` — the code that draws the printed document. Shared on purpose, so
  the PDF, the CompanyCam upload and the owner's page are always the same document.
- `sow-lightbox.js` — shows a line item's photo in place instead of bouncing the
  reader over to CompanyCam.

**Pre-Purchase Report builder** — `/pre-purchase-report.html`
Turns a walkthrough into a printable buyer report. Separate tool from the SOW
builder — same idea, different product.
- `ppr.js`, `ppr-shared.js`.

## The parts you can't see
- `netlify/functions/` — small bits of server code. They're what let the tools save
  a SOW, look up saved prices, search CompanyCam, and upload a finished PDF. The
  CompanyCam key lives here on the server, never in the browser.
- `supabase/migrations/` — the structure of the database that holds saved SOWs,
  saved prices, the contractor list and saved reports. Each file is one change to
  that structure, in order. Don't edit an old one; add a new one.
- `db.js` — how the server code connects to that database.
- `.claude/skills/` — instructions Claude follows for `/build-sow` and
  `/build-underwriting-report`. These live in the repo so anyone with access gets
  them automatically.

## How a change gets published
Every change goes through a **pull request** — a proposal you approve before it
reaches the live site. Nothing is live until it's merged into `main`.

1. Claude makes the change on a **branch** (a side copy), then opens a **pull
   request** on GitHub describing what changed and why.
2. You open the PR, read it, and click **Merge pull request** if you want it.
3. Netlify sees the merge and republishes section8pm.com within ~1 minute.

If a change turns out to be wrong, it's one PR to undo — the live site is never
the place where mistakes get discovered.

## Setup notes
- No build step for the website itself; Netlify publishes this folder as-is
  (publish directory = root, per `netlify.toml`).
- Branch that goes live: `main`.
- Server code needs `COMPANYCAM_API_KEY` and the database connection string set in
  Netlify's environment variables. They are not in this repo, and shouldn't be.
- `node_modules/` is ignored — it's downloaded automatically, never committed.
