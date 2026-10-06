import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import { KNOWN_ACTS, LEGACY_SEED_URLS } from "./catalogue";
import { normaliseActUrl } from "./registers";

type DB = Database.Database;

/**
 * Where the SQLite file lives.  LEGISLATION_DB_PATH overrides the default
 * `.data/legislation.db`, which lets tests and demos use their own file
 * (or ":memory:").
 */
function resolveDbPath(): string {
  return process.env.LEGISLATION_DB_PATH || path.join(process.cwd(), ".data", "legislation.db");
}

let db: DB | null = null;

function connectDB(): DB {
  if (!db) {
    const dbPath = resolveDbPath();
    if (dbPath !== ":memory:") fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    db = new Database(dbPath);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = on");
    initSchema();
    migrateActUrls();
    // SEED_DEFAULT_ACTS=false starts with an empty watch list (tests, demos).
    if (process.env.SEED_DEFAULT_ACTS !== "false") seedIfEmpty();
  }
  return db;
}

/** Close the connection so the next connectDB() opens the current path again. */
export function closeDB(): void {
  db?.close();
  db = null;
}

function initSchema() {
  db!.exec(`
    CREATE TABLE IF NOT EXISTS acts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      url TEXT NOT NULL UNIQUE,
      jurisdiction TEXT NOT NULL CHECK(jurisdiction IN ('federal', 'vic')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS versions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      act_id INTEGER NOT NULL,
      fetched_at TEXT NOT NULL DEFAULT (datetime('now')),
      version_label TEXT,
      content_hash TEXT NOT NULL,
      plain_text TEXT,
      source_url TEXT,
      FOREIGN KEY (act_id) REFERENCES acts(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS changes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      act_id INTEGER NOT NULL,
      version_from_id INTEGER,
      version_to_id INTEGER NOT NULL,
      detected_at TEXT NOT NULL DEFAULT (datetime('now')),
      summary TEXT,
      sections_changed TEXT,
      affected_groups TEXT,
      change_count INTEGER DEFAULT 0,
      FOREIGN KEY (version_from_id) REFERENCES versions(id),
      FOREIGN KEY (version_to_id) REFERENCES versions(id),
      FOREIGN KEY (act_id) REFERENCES acts(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_versions_act_id ON versions(act_id);
    CREATE INDEX IF NOT EXISTS idx_versions_fetched_at ON versions(fetched_at DESC);
    CREATE INDEX IF NOT EXISTS idx_changes_act_id ON changes(act_id);
  `);

  // Lightweight forward migration: SQLite has no `ADD COLUMN IF NOT EXISTS`,
  // so check the schema first (older DBs predate the `brief` column).
  const changesCols = db!.prepare("PRAGMA table_info(changes)").all() as Array<{ name: string }>;
  if (!changesCols.some((c) => c.name === "brief")) {
    db!.exec("ALTER TABLE changes ADD COLUMN brief TEXT");
  }

  // Add `structure` column for storing parsed TOC JSON on versions.
  const versionsCols = db!.prepare("PRAGMA table_info(versions)").all() as Array<{ name: string }>;
  if (!versionsCols.some((c) => c.name === "structure")) {
    db!.exec("ALTER TABLE versions ADD COLUMN structure TEXT");
  }

  // Add `metadata` column for compilation or version facts read from the page.
  if (!versionsCols.some((c) => c.name === "metadata")) {
    db!.exec("ALTER TABLE versions ADD COLUMN metadata TEXT");
  }

  // content_diffs held a copy of the first 500 lines of each side of a change.
  // Nothing read it, and versions.plain_text already holds the full text.
  db!.exec("DROP TABLE IF EXISTS content_diffs");

  // Add `section_details` column for storing TOC-enriched section changes.
  const changesCols2 = db!.prepare("PRAGMA table_info(changes)").all() as Array<{ name: string }>;
  if (!changesCols2.some((c) => c.name === "section_details")) {
    db!.exec("ALTER TABLE changes ADD COLUMN section_details TEXT");
  }
}

/** Seed the watch list with the catalogue of verified Acts on first run. */
function seedIfEmpty() {
  const count = db!.prepare<[], { cnt: number }>("SELECT COUNT(*) AS cnt FROM acts").get();
  if (count?.cnt === 0) {
    const insert = db!.prepare("INSERT INTO acts (title, url, jurisdiction) VALUES (?, ?, ?)");
    for (const act of KNOWN_ACTS) insert.run(act.title, act.url, act.jurisdiction);
  }
}

/**
 * Move stored URLs to the form that serves the latest version.  Earlier
 * releases seeded fixed compilations, which a check can never see change.
 * A URL that cannot be normalised, or whose normal form another row already
 * uses, is left as it is.
 */
function migrateActUrls() {
  const acts = db!
    .prepare<[], Pick<Act, "id" | "title" | "url" | "jurisdiction">>(
      "SELECT id, title, url, jurisdiction FROM acts",
    )
    .all();
  const taken = new Set(acts.map((a) => a.url));
  const update = db!.prepare("UPDATE acts SET url = ? WHERE id = ?");
  for (const act of acts) {
    const legacy = LEGACY_SEED_URLS[act.url];
    let next: string;
    if (legacy && legacy.title === act.title) {
      next = legacy.url;
    } else {
      try {
        next = normaliseActUrl(act.url, act.jurisdiction);
      } catch {
        continue;
      }
    }
    if (next !== act.url && !taken.has(next)) {
      update.run(next, act.id);
      taken.delete(act.url);
      taken.add(next);
    }
  }
}

// --- Types ---
export interface Act {
  id: number;
  title: string;
  url: string;
  jurisdiction: "federal" | "vic";
  created_at: string;
  updated_at: string;
}

/** An Act with the counts the dashboard and detail page show. */
export interface ActSummary extends Act {
  version_count: number;
  last_checked: string | null;
  recent_changes: number;
}

export interface Version {
  id: number;
  act_id: number;
  fetched_at: string;
  version_label: string | null;
  content_hash: string;
  plain_text: string | null;
  source_url: string | null;
  /** JSON-serialized table-of-contents tree (parsed TOC) */
  structure: string | null;
  /** JSON VersionMetadata: compilation or version facts read from the page */
  metadata: string | null;
}

export interface Change {
  id: number;
  act_id: number;
  version_from_id: number | null;
  version_to_id: number;
  detected_at: string;
  summary: string | null;
  sections_changed: string | null;
  affected_groups: string | null;
  change_count: number;
  brief: string | null;
  /** JSON array of TOC-enriched section change objects */
  section_details: string | null;
}

// --- Settings (key-value store, user-configurable at runtime) ---

export function getSetting(key: string): string | null {
  const d = connectDB();
  const row = d.prepare("SELECT value FROM settings WHERE key = ?").get(key) as
    | Record<string, unknown>
    | undefined;
  return row ? (row.value as string) : null;
}

export function setSetting(key: string, value: string): void {
  const d = connectDB();
  d.prepare(
    `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`,
  ).run(key, value);
}

// --- Pending-changes counter: changes recorded since the user last dismissed them ---

const PENDING_KEY = "pending_changes_count";

export function getPendingChanges(): number {
  const n = Number.parseInt(getSetting(PENDING_KEY) ?? "0", 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function incrementPendingChanges(): void {
  connectDB()
    .prepare(
      `INSERT INTO settings (key, value, updated_at) VALUES (?, '1', datetime('now'))
       ON CONFLICT(key) DO UPDATE
       SET value = CAST(CAST(value AS INTEGER) + 1 AS TEXT), updated_at = datetime('now')`,
    )
    .run(PENDING_KEY);
}

export function resetPendingChanges(): void {
  setSetting(PENDING_KEY, "0");
}

export function getAllSettings(): Record<string, string> {
  const d = connectDB();
  const rows = d.prepare("SELECT key, value FROM settings").all() as Array<Record<string, unknown>>;
  return Object.fromEntries(rows.map((r) => [r.key as string, r.value as string]));
}

export { connectDB };
