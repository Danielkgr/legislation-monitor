<div align="center">

# Legislation Monitor

### Change detection for Commonwealth and Victorian legislation, with a side-by-side diff of every amendment

![2 jurisdictions](https://img.shields.io/badge/jurisdictions-Cth_and_Vic-0969da?style=for-the-badge) ![22 tests](https://img.shields.io/badge/tests-22-0969da?style=for-the-badge) ![local SQLite storage](https://img.shields.io/badge/storage-local_SQLite-8250df?style=for-the-badge) ![Next.js 16](https://img.shields.io/badge/Next.js-16-57606a?style=for-the-badge&logo=nextdotjs&logoColor=white) ![MIT licence](https://img.shields.io/badge/licence-MIT-57606a?style=for-the-badge)

</div>

<br>

> Amendments reach the official registers as new compilations, and finding what moved means reading the new text against the old.  Legislation Monitor keeps a local snapshot of each Act it watches, fetches the Act again on request, and shows a side-by-side diff when the text changes.

<br>

## What it is

A local web app and REST API that watches Acts of Parliament for amendments, repeals, and insertions.  It scrapes the Federal Register of Legislation and the Victorian legislation site, hashes the text it extracts, and flags any difference from the last stored version.

> [!IMPORTANT]
> It shows what text changed, not what the change means, so it is not a legal research or advice tool.  It covers Commonwealth and Victorian legislation only.  Everything lives in a local SQLite file, with no accounts and no sync.  It sends no notifications of its own, so periodic checking needs an external cron job that calls the check endpoint (see [Adding alerts](#adding-alerts)).

It is a working prototype.  It runs locally against both official registers.  The scrapers follow the current markup of each site and will need maintenance when either register changes.

<br>

## Results

The app runs against both live registers, and 22 Vitest unit tests cover the diff engine, the scrapers, and the table-of-contents parser that makes diffs precise to the section.  The repository publishes no measurement of how reliably it catches real amendments over time.

<br>

## How it works

| Feature | What happens |
|---|---|
| **Act tracking** | Adding an Act of Parliament, Commonwealth or Victorian, stores a baseline snapshot in SQLite straight away. |
| **Change detection** | A check (the **Check** button, or `POST /api/acts/:id/check`) fetches the Act's HTML again, hashes the extracted text, and flags anything that differs from the last stored version.  Periodic checking is left to an external cron job. |
| **Side-by-side diffs** | The diff viewer marks inserted, deleted, and modified sections. |
| **Change briefs** | With an OpenAI-compatible LLM endpoint configured (on the Settings page or through `POST /api/settings`), each detected change gets a brief with a summary, the key changes, who is affected, why it matters, and how significant it is.  Without an LLM, a deterministic heuristic writes the brief instead, and every brief records which of the two produced it. |
| **Dashboard** | One page shows how many Acts are being watched, the split by jurisdiction, and the number of new changes in the last seven days. |
| **REST API** | Every feature has an endpoint, such as `/api/acts` and `/api/changes/:actId`, for alerts or other tools to call. |

### Scrapers

Each jurisdiction has its own scraper, tuned to the structure of its register.

| Register | Approach |
|---|---|
| **Federal** ([legislation.gov.au](https://www.legislation.gov.au)) | Parses the server-rendered HTML with Cheerio and extracts the page title and main content.  If the primary selectors miss, it falls back through several others. |
| **Victorian** ([legislation.vic.gov.au](https://www.legislation.vic.gov.au)) | The register runs on the Tide framework.  The scraper tries a direct fetch, then the listing page, then search.  When content is rendered client-side and missing from the first HTML response, it falls back to heuristics based on the URL. |

Both scrapers retry twice, waiting 1 s and then 2 s, with a 30-second timeout on each attempt.  Both hash the normalised text with SHA-256 to detect change.

### Database

On first launch the app creates a SQLite database at `.data/legislation.db`, in WAL mode so reads stay safe while a scrape is running.

| Table | Purpose |
|---|---|
| `acts` | Metadata for each watched Act, such as title, URL, and jurisdiction |
| `versions` | A snapshot of an Act's text at each check, with its content hash |
| `changes` | Each detected difference between versions, including its change brief |
| `settings` | Key-value store for runtime settings, such as the LLM endpoint and the pending-changes counter |
| `content_diffs` | Line-by-line diff data for the viewer, created on the first detected change |

<br>

## Quick start

You need Node.js 20.9 or later, which Next.js 16 requires, and a current browser.

```bash
git clone https://github.com/Danielkgr/legislation-monitor.git
cd legislation-monitor
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) for the dashboard.  Five Acts are seeded on the first run.

| Jurisdiction | Seeded Acts |
|---|---|
| **Commonwealth** | *Privacy Act 1988*, *Corporations Act 2001*, *Work Health and Safety Act 2011* |
| **Victoria** | *Crimes Act 1958*, *Occupiers Liability Act 1983* |

<br>

## Reference

### Scripts

```bash
npm run dev       # development server on localhost:3000
npm run build     # production build to .next/
npm run start     # run the production build locally
npm run lint      # ESLint
npm test          # Vitest unit tests
```

### API

A full [OpenAPI 3.0](https://spec.openapis.org/oas/v3.0.3) specification ships with the repository at `public/openapi.json`.

| Format | Where |
|---|---|
| **Interactive docs** | [`/docs`](http://localhost:3000/docs), a Swagger UI with try-it-out requests, code samples, and a schema explorer |
| **Raw spec** | [`/openapi.json`](http://localhost:3000/openapi.json), also served by `GET /api/openapi` |

| Method | Endpoint | What it does |
|---|---|---|
| `GET` | `/api/acts` | Lists every watched Act with a change summary |
| `POST` | `/api/acts` | Adds an Act to watch |
| `DELETE` | `/api/acts/:id` | Stops watching an Act |
| `GET` | `/api/acts/:id` | Returns an Act's details and metadata |
| `POST` | `/api/acts/:id/check` | Scrapes and compares the Act immediately |
| `GET` | `/api/acts/:id/versions` | Lists every stored version of an Act |
| `GET` | `/api/changes/:actId` | Returns detected changes with summaries, affected groups, and briefs |
| `GET` | `/api/changes/:actId/export` | Exports an Act's changes as JSON by default, or as a Markdown report with `?format=md` |
| `GET` | `/api/changes/count` | Returns the pending-changes counter |
| `POST` | `/api/changes/ack` | Resets the pending-changes counter |
| `GET`, `POST` | `/api/settings` | Reads or updates the LLM endpoint settings |
| `GET` | `/api/openapi` | Returns the OpenAPI specification |

Every endpoint returns JSON.  Errors come back as `{ "error": "message" }` with a matching HTTP status of 400, 404, 409, or 500.

<details>
<summary><strong>Add an Act</strong> (<code>POST /api/acts</code>)</summary>

```jsonc
// Request
{
  "title": "My Act 2025",                       // required, human-readable title
  "url": "https://.../Details/C2025C00XXX",     // required, legislation URL
  "jurisdiction": "federal"                     // optional, "federal" (default) or "vic"
}

// Response 201, Act created
{
  "id": 6,
  "title": "My Act 2025",
  "url": "...",
  "jurisdiction": "federal",
  "created_at": "2026-08-15T10:00:00Z",
  "updated_at": "2026-08-15T10:00:00Z"
}

// Response 409, duplicate URL
{ "error": "This Act is already being watched", "id": 1 }
```

</details>

<details>
<summary><strong>Check for changes</strong> (<code>POST /api/acts/:id/check</code>)</summary>

```jsonc
// Response 200
{
  "success": true,
  "hasChange": false,    // true if a new version was detected
  "change": null,        // the change record when hasChange is true
  "new_version_count": 12
}
```

</details>

<details>
<summary><strong>List changes</strong> (<code>GET /api/changes/:actId</code>)</summary>

```jsonc
// Response 200, an array of changes
[
  {
    "id": 5,
    "act_id": 1,
    "detected_at": "2026-08-14T09:30:00Z",
    "summary": "The Privacy Act 1988 has been amended (3 lines added, 1 line removed)",
    "sections_changed": ["Added: \"Section 13G\""],
    "affected_groups": ["Individuals & Data Subjects"],
    "change_count": 4,
    "from_label": null,
    "to_label": "2026-08-14"
  }
]
```

</details>

### Running as an API server

```bash
# Development
npm install
npm run dev
# Dashboard      http://localhost:3000
# Swagger UI     http://localhost:3000/docs
# Raw spec       http://localhost:3000/openapi.json

# Production
npm install
npm run build
npm start
# API at http://localhost:3000/api/*
```

The database lives at `.data/legislation.db` inside the working directory.  Copy or mount it to keep state across restarts.

To use the spec in another tool, import `https://raw.githubusercontent.com/Danielkgr/legislation-monitor/main/public/openapi.json` into Postman (Import, then Link), Insomnia, or Hoppscotch.  To generate a typed client, point [openapi-typescript](https://github.com/openapi-ts/openapi-typescript) at the same URL.

### Configuration

Framework settings, such as rewrites, redirects, and environment variables, live in `next.config.ts`.  The scraper's User-Agent is set inline in `src/lib/scrapers.ts`.  Change it to your own URL if you run a copy.

```typescript
// src/lib/scrapers.ts
"User-Agent": "LegislationMonitor/1.0 (+https://github.com/Danielkgr/legislation-monitor)"
```

### Adding a jurisdiction

1. Add the new jurisdiction identifier to the `jurisdiction` type in `src/lib/db.ts`.
2. Write a `scrapeNewJurisdiction()` function in `src/lib/scrapers.ts`, following the federal and Victorian patterns.
3. Update `extractVersionLabel()` for any version-number patterns in that jurisdiction's URLs.

### Adding alerts

Alerts sit outside the app.  A cron job, such as Vercel Cron, calls `POST /api/acts/:id/check` for each Act and looks for `hasChange: true` in the response.  It can instead poll `GET /api/acts` for each Act's `recent_changes` count, or `GET /api/changes/count` for the pending total.  When something has changed, the job sends the email, Slack message, or push notification.

### Stack

| Layer | Technology |
|---|---|
| **Framework** | [Next.js 16](https://nextjs.org/) with the App Router |
| **Language** | [TypeScript 5](https://www.typescriptlang.org/) |
| **Styling** | [Tailwind CSS 4](https://tailwindcss.com/) |
| **Database** | [better-sqlite3](https://github.com/WiseLibs/better-sqlite3), a local SQLite file in WAL mode |
| **Scraping** | [Cheerio](https://cheerio.js.org/) for server-side HTML parsing |
| **Diffing** | [jsdiff](https://github.com/kpdecker/jsdiff) |
| **API docs** | [Swagger UI](https://github.com/swagger-api/swagger-ui) |
| **Tests** | [Vitest](https://vitest.dev/) |

<br>

## Layout

```text
legislation-monitor/
  src/
    app/                    Next.js App Router
      api/
        acts/               Create, read, and delete watched Acts
        changes/            Diff generation and change history
      acts/[id]/            Detail and diff pages for each Act
      docs/                 Swagger UI, serving the OpenAPI spec
      globals.css           Tailwind layer styles
      layout.tsx            Root layout (fonts, metadata)
      page.tsx              Dashboard
      settings/             LLM endpoint settings page
    components/             ActCard, AddActForm, CheckButton, DiffViewer
    lib/
      db.ts                 SQLite schema, seeding, and queries
      diff.ts               Text-diff engine
      llm.ts                Optional LLM change briefs, with the heuristic fallback
      scrapers.ts           Federal and Victorian scrapers
      structure.ts          Table-of-contents parsing for section-precise diffs
    types/                  TypeScript declarations
  .data/                    Local SQLite database (ignored by git)
  public/                   Static assets and openapi.json
  package.json
```

<br>

## Licence

MIT.  See [LICENSE](LICENSE).  Legislation text comes from the official registers, the [Federal Register of Legislation](https://www.legislation.gov.au) and [Victorian Legislation](https://www.legislation.vic.gov.au).
