<div align="center">

# Legislation Monitor

Automated legislative change detection for Australian federal and Victorian state acts. Scans, compares, and surfaces what changed — so you don't have to read through every revision yourself.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](https://www.typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-16-black.svg)](https://nextjs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

</div>

---

## Overview

Legislation Monitor watches Australian Acts of Parliament for amendments, repeals, and insertions. It scrapes the official legislation registers for federal and Victorian acts, detects content changes via cryptographic hashing, and presents side-by-side diffs so you can see exactly what the law now says versus how it used to read.

### What it does

| Feature | Description |
|---|---|
| **Act Tracking** | Add any Act of Parliament (federal or Victorian) and get an instant baseline snapshot stored locally in SQLite. |
| **Change Detection** | Periodically re-fetches each Act's HTML, hashes the extracted text, and flags anything that differs from the last known version. |
| **Side-by-Side Diffs** | When changes are detected, a rich diff viewer renders inserted, deleted, and modified sections so you can scan updates in seconds. |
| **Dashboard** | A single-page dashboard shows how many Acts you're watching, jurisdiction breakdown, and the total number of new changes this week. |
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
│   │   ├── globals.css         # Tailwind layer styles
│   │   ├── layout.tsx          # Root layout (fonts, metadata)
│   │   └── page.tsx            # Dashboard
│   ├── components/             # Reusable React components
│   │   ├── ActCard.tsx
│   │   ├── AddActForm.tsx
│   │   ├── CheckButton.tsx
│   │   └── DiffViewer.tsx
│   ├── lib/                    # Business logic
│   │   ├── db.ts               # SQLite schema, seeding, queries
│   │   ├── diff.ts             # Text-diff engine
│   │   └── scrapers.ts         # Federal & Victorian web scrapers
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

On first launch, the application creates a local SQLite database at `.data/legislation.db` with three tables:

| Table | Purpose |
|---|---|
| `acts` | Metadata about watched legislation (title, URL, jurisdiction) |
| `versions` | Snapshots of Act text at each check (with content hashes) |
| `changes` | Records of detected differences between versions |

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

### Acts

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/acts` | List all watched Acts with change summary |
| `POST` | `/api/acts` | Add a new Act to watch |
| `DELETE` | `/api/acts/:id` | Remove an Act from monitoring |

### Per-Act

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/acts/:id` | Get Act details |
| `POST` | `/api/acts/:id/check` | Trigger an immediate scrape & comparison |
| `GET` | `/api/acts/:id/versions` | List all stored versions for an Act |

### Changes

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/changes/:actId` | Get a unified diff between two versions |

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
2. Checking the response for `recent_changes > 0`.
3. Sending emails, Slack messages, or Push notifications when changes are detected.

## License

MIT — see [LICENSE](LICENSE) for details.

## Acknowledgements

- Data sourced from official government registers:
  - [Federal Register of Legislation](https://www.legislation.gov.au)
  - [Victorian Legislation](https://www.legislation.vic.gov.au)
