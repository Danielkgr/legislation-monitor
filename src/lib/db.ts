import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

interface DB {
  exec(sql: string): void;
  pragma(str: string): unknown;
  prepare<T = Record<string, unknown>>(sql: string): Statement;
}

interface Statement {
  get(...args: unknown[]): Record<string, unknown> | undefined;
  all(...args: unknown[]): Record<string, unknown>[];
  run(...args: unknown[]): { lastInsertRowid: number; changes: number };
}

const DB_DIR = path.join(process.cwd(), ".data");
const DB_PATH = path.join(DB_DIR, "legislation.db");

// Ensure data directory exists
fs.mkdirSync(DB_DIR, { recursive: true });

let db: DB | null = null;

function connectDB(): DB {
  if (!db) {
    db = new Database(DB_PATH) as unknown as DB;
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = on");
    initSchema();
    seedIfEmpty();
  }
  return db;
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

  // Add `section_details` column for storing TOC-enriched section changes.
  const changesCols2 = db!.prepare("PRAGMA table_info(changes)").all() as Array<{ name: string }>;
  if (!changesCols2.some((c) => c.name === "section_details")) {
    db!.exec("ALTER TABLE changes ADD COLUMN section_details TEXT");
  }
}

// Seed data — real Acts from both jurisdictions
function seedIfEmpty() {
  const count: { cnt: number } = db!.prepare("SELECT COUNT(*) as cnt FROM acts").get() as unknown as { cnt: number };
  if (count.cnt === 0) {
    const insert = db!.prepare(
      `INSERT INTO acts (title, url, jurisdiction) VALUES (?, ?, ?)`
    );

    const federalActs = [
      {
        title: "Privacy Act 1988",
        url: "https://www.legislation.gov.au/Details/C2024C00026",
        jurisdiction: "federal" as const,
      },
      {
        title: "Corporations Act 2001",
        url: "https://www.legislation.gov.au/Details/C2024C00001",
        jurisdiction: "federal" as const,
      },
      {
        title: "Work Health and Safety Act 2011",
        url: "https://www.legislation.gov.au/Details/C2024C00070",
        jurisdiction: "federal" as const,
      },
    ];

    const vicActs = [
      {
        title: "Crimes Act 1958",
        url: "https://www.legislation.vic.gov.au/in-force/act/crimes-act-1958",
        jurisdiction: "vic" as const,
      },
      {
        title: "Occupiers Liability Act 1983",
        url: "https://www.legislation.vic.gov.au/in-force/act/occupiers-liability-act-1983",
        jurisdiction: "vic" as const,
      },
    ];

    for (const act of [...federalActs, ...vicActs]) {
      insert.run(act.title, act.url, act.jurisdiction);
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
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`
  ).run(key, value);
}

export function getAllSettings(): Record<string, string> {
  const d = connectDB();
  const rows = d.prepare("SELECT key, value FROM settings").all() as Array<
    Record<string, unknown>
  >;
  return Object.fromEntries(rows.map((r) => [r.key as string, r.value as string]));
}

export { connectDB };
