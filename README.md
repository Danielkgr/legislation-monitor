<div align="center">

# Legislation Monitor

Automated legislative change detection for Australian federal and Victorian state acts. Scans, compares, and surfaces what changed — so you don't have to read through every revision yourself.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](https://www.typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-16-black.svg)](https://nextjs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

</div>

**What it does not do:** it is a change-detection tool, not a legal research or advice tool — it shows you what text changed, not what the change means. It covers federal and Victorian legislation only, keeps everything in a local SQLite file (no accounts, no sync), and has no built-in push notifications: periodic checking is an external cron job calling the check endpoint (see [Adding Alerts](#adding-alerts)).

**Maturity:** working prototype. It runs locally (`npm run dev`) against the two official registers; the scrapers are tuned to the current markup of each site and will need maintenance if those registers change.

---

## Overview

Legislation Monitor watches Australian Acts of Parliament for amendments, repeals, and insertions. It scrapes the official legislation registers for federal and Victorian acts, detects content changes via cryptographic hashing, and presents side-by-side diffs so you can see exactly what the law now says versus how it used to read.

### What it does

| Feature | Description |
|---|---|
| **Act Tracking** | Add any Act of Parliament (federal or Victorian) and get an instant baseline snapshot stored locally in SQLite. |
| **Change Detection** | Re-fetches an Act's HTML when a check is triggered (the **Check** button, or `POST /api/acts/:id/check`), hashes the extracted text, and flags anything that differs from the last known version. Periodic checking is left to an external cron job (see [Adding Alerts](#adding-alerts)). |
| **Side-by-Side Diffs** | When changes are detected, a rich diff viewer renders inserted, deleted, and modified sections so you can scan updates in seconds. |
| **Change Briefs (optional)** | When an OpenAI-compatible LLM endpoint is configured (Settings page or `POST /api/settings`), each detected change gets a stakeholder-facing brief — summary, key changes, who is affected, why it matters, significance. Without an LLM, a deterministic heuristic produces the brief instead, and every brief records which one produced it. |
| **Dashboard** | A single-page dashboard shows how many Acts you're watching, jurisdiction breakdown, and the total number of new changes in the last 7 days. |
| **API-First** | Every feature is backed by a RESTful API (`/api/acts`, `/api/changes/:actId`, etc.) for easy integration with alerts or third-party tools. |

## Tech Stack

| Layer | Technology |
|---|---|
| **Framework** | [Next.js 16](https://nextjs.org/) (App Router) |
| **Language** | [TypeScript 5](https://www.typescriptlang.org/) |
| **Styling** | [Tailwind CSS 4](https://tailwindcss.com/) |
| **Database** | [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) (local SQLite file with WAL mode) |
| **Scraping** | [Cheerio](https://cheerio.js.org/) — server-side jQuery for HTML parsing |
| **Image Processing** | [Sharp](https://sharp.pixelplumbing.com/) |

## Project Structure

```
legislation-monitor/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── api/                # REST endpoints
│   │   │   ├── acts/           # CRUD for watched Acts
│   │   │   └── changes/        # Diff generation & change history
│   │   ├── acts/[id]/          # Per-Act detail + diff pages
│   │   ├── docs/               # Swagger UI (serves the OpenAPI spec)
│   │   ├── globals.css         # Tailwind layer styles
│   │   ├── layout.tsx          # Root layout (fonts, metadata)
│   │   ├── page.tsx            # Dashboard
│   │   └── settings/           # LLM endpoint settings page
│   ├── components/             # Reusable React components
│   │   ├── ActCard.tsx
│   │   ├── AddActForm.tsx
│   │   ├── CheckButton.tsx
│   │   └── DiffViewer.tsx
│   ├── lib/                    # Business logic
│   │   ├── db.ts               # SQLite schema, seeding, queries
│   │   ├── diff.ts             # Text-diff engine
│   │   ├── llm.ts              # Optional LLM change briefs (heuristic fallback)
│   │   ├── scrapers.ts         # Federal & Victorian web scrapers
│   │   ├── scheduler.ts        # In-process auto-check scheduler (not wired up; use an external cron)
│   │   └── structure.ts        # TOC parsing for section-precise diffs
│   └── types/                  # TypeScript declarations
├── .data/                      # Local SQLite database (gitignored)
├── public/                     # Static assets
└── package.json
```

## Getting Started

### Prerequisites

- **Node.js** 18+ (v20 recommended)
- A modern browser (Chrome, Firefox, Edge, Safari)

### Installation

```bash
# Clone the repository
git clone https://github.com/Danielkgr/legislation-monitor.git
cd legislation-monitor

# Install dependencies
npm install

# Run the development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the dashboard.

### Database

On first launch, the application creates a local SQLite database at `.data/legislation.db` with the following tables:

| Table | Purpose |
|---|---|
| `acts` | Metadata about watched legislation (title, URL, jurisdiction) |
| `versions` | Snapshots of Act text at each check (with content hashes) |
| `changes` | Records of detected differences between versions (including the change brief) |
| `settings` | Key-value store for runtime settings (LLM endpoint config, pending-changes counter) |
| `content_diffs` | Per-line diff data for the viewer (created on the first detected change) |

The database uses WAL mode for safe concurrent reads during scraping.

### Seed Data

Five Acts are seeded automatically on first run:

**Federal**
- Privacy Act 1988
- Corporations Act 2001
- Work Health and Safety Act 2011

**Victorian**
- Crimes Act 1958
- Occupiers Liability Act 1983

## API Reference

### OpenAPI Specification

A complete [OpenAPI 3.0](https://spec.openapis.org/oas/v3.0.3) specification is provided for programmatic consumption:

| Format | URL |
|---|---|
| **Interactive Docs** | [`/docs`](http://localhost:3000/docs) — Swagger UI with try-it-out, code samples, and schema explorer |
| **Raw Spec (JSON)** | [`/openapi.json`](http://localhost:3000/openapi.json) — Download or curl the specification directly |

You can import the spec into [Postman](https://www.postman.com/), [Insomnia](https://insomnia.rest/), [Hoppscotch](https://hoppscotch.io/), or any other API tool for quick exploration.

### Endpoint Summary

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/acts` | List all watched Acts with change summary |
| `POST` | `/api/acts` | Add a new Act to watch (see schema below) |
| `DELETE` | `/api/acts/:id` | Remove an Act from monitoring |
| `GET` | `/api/acts/:id` | Get Act details and metadata |
| `POST` | `/api/acts/:id/check` | Trigger an immediate scrape & comparison |
| `GET` | `/api/acts/:id/versions` | List all stored versions for an Act |
| `GET` | `/api/changes/:actId` | Get detected changes with summaries, affected groups and briefs |
| `GET` | `/api/changes/:actId/export` | Export an Act's changes (`?format=json` default, `?format=md` for a Markdown report) |
| `GET` | `/api/changes/count` | Current pending-changes counter |
| `POST` | `/api/changes/ack` | Reset the pending-changes counter |
| `GET` / `POST` | `/api/settings` | Read / update LLM endpoint settings |
| `GET` | `/api/openapi` | The OpenAPI specification (same document as `/openapi.json`) |

### Request / Response Schemas

<details>
<summary><strong>Add Act</strong></summary>

```jsonc
// POST /api/acts
{
  "title": "My Act 2025",          // required — human-readable title
  "url": "https://.../Details/C2025C00XXX",  // required — legislation URL
  "jurisdiction": "federal"         // optional — "federal" (default) or "vic"
}

// Response 201 — Act created
{
  "id": 6,
  "title": "My Act 2025",
  "url": "...",
  "jurisdiction": "federal",
  "created_at": "2026-08-15T10:00:00Z",
  "updated_at": "2026-08-15T10:00:00Z"
}

// Response 409 — Duplicate URL
{ "error": "This Act is already being watched", "id": 1 }
```
</details>

<details>
<summary><strong>Check for Changes (POST /api/acts/:id/check)</strong></summary>

```jsonc
// Response 200 — Success
{
  "success": true,
  "hasChange": false,    // true if a new version was detected
  "change": null,        // change record when hasChange is true
  "new_version_count": 12
}
```
</details>

<details>
<summary><strong>List Changes (GET /api/changes/:actId)</strong></summary>

```jsonc
// Response 200 — Array of changes
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

### Response Envelope

Every endpoint returns JSON. Error responses use `{ "error": "message" }` with an appropriate HTTP status code (400, 404, 409, 500).

## Scrapers

The application maintains two scrapers tuned to the structure of each jurisdiction's legislation register:

### Federal (legislation.gov.au)

- Parses server-rendered HTML with Cheerio.
- Extracts page title and main content area text.
- Includes a fallback chain that graces-degrades through multiple selectors if primary ones miss.

### Victorian (legislation.vic.gov.au)

- Targets the [Tide](https://github.com/Alfresco/tide) framework used by the Victorian register.
- Tries three resolution patterns (direct fetch → listing page → search) in order of specificity.
- Falls back to URL-basename heuristics when client-rendered content isn't available in the initial HTML.

Both scrapers implement:
- **Exponential-backoff retry** (2 retries, 1s / 2s delays)
- **30-second fetch timeout** per attempt
- **Content hashing** (CRC32-style integer hash for change detection)

## Available Scripts

```bash
npm run dev       # Start development server (localhost:3000)
npm run build     # Production build to .next/
npm run start     # Run production build locally
npm run lint      # ESLint check
```

### Running as an External API Server

The Legislation Monitor doubles as an API backend for external consumption. The OpenAPI specification ships with the repository (`public/openapi.json`) and is served both statically at `/openapi.json` and by the `/api/openapi` endpoint.

**Development (local):**
```bash
npm install
npm run dev
# → Dashboard: http://localhost:3000
# → Swagger UI docs:  http://localhost:3000/docs
# → Raw spec (JSON):  http://localhost:3000/openapi.json
```

**Production (standalone):**
```bash
npm install
npm run build
npm start
# API available at http://localhost:3000/api/*
```

The database (`legislation.db`) lives at `.data/legislation.db` within the working directory. Copy or mount it for persistent state across restarts.

**Using the spec in other tools:**
- **Postman**: `Import → Link` → paste `https://raw.githubusercontent.com/Danielkgr/legislation-monitor/main/public/openapi.json`
- **Insomnia / Hoppscotch**: Import → OpenAPI → paste the same URL or local file path
- **Code generation**: `npx @scarf/scarf --url https://raw.githubusercontent.com/Danielkgr/legislation-monitor/main/public/openapi.json --output ./src/api/generated` (or use [openapi-typescript](https://github.com/colinhacks/openapi-typescript))

## Configuration

Edit `next.config.ts` for framework-level settings (rewrites, redirects, environment variables). The scraper User-Agent is defined inline in `src/lib/scrapers.ts` and can be customized:

```typescript
// src/lib/scrapers.ts — change this to your own URL
"User-Agent": "LegislationMonitor/1.0 (+https://github.com/Danielkgr/legislation-monitor)"
```

## Extending

### Adding a New Jurisdiction

1. Add the new jurisdiction identifier to the `jurisdiction` type in `src/lib/db.ts`.
2. Create a new `scrapeNewJurisdiction()` function in `src/lib/scrapers.ts` following the Federal/Vic patterns.
3. Update the `extractVersionLabel()` helper for any version-number heuristics specific to that jurisdiction's URLs.

### Adding Alerts

The `/api/changes/:actId` endpoint returns change data as JSON. You can build a lightweight notification layer by:

1. Polling or using a cron job (e.g., Vercel Cron) to call `/api/acts/:id/check`.
2. Checking the response for `hasChange: true` (or polling `GET /api/acts` and checking each Act's `recent_changes` count, or `GET /api/changes/count` for the pending total).
3. Sending emails, Slack messages, or Push notifications when changes are detected.

## License

MIT — see [LICENSE](LICENSE) for details.

## Acknowledgements

- Data sourced from official government registers:
  - [Federal Register of Legislation](https://www.legislation.gov.au)
  - [Victorian Legislation](https://www.legislation.vic.gov.au)
