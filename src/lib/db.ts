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

    CREATE INDEX IF NOT EXISTS idx_versions_act_id ON versions(act_id);
    CREATE INDEX IF NOT EXISTS idx_versions_fetched_at ON versions(fetched_at DESC);
    CREATE INDEX IF NOT EXISTS idx_changes_act_id ON changes(act_id);
  `);
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
        url: "https://www.legislation.vic.gov.au/html/in-force/act/100/1958/amends",
        jurisdiction: "vic" as const,
      },
      {
        title: "Health Practitioner Regulation National Law (Victoria)",
        url: "https://www.legislation.vic.gov.au/html/in-force/act/324/2008/amends",
        jurisdiction: "vic" as const,
      },
      {
        title: "Occupiers Liability Act 1984",
        url: "https://www.legislation.vic.gov.au/html/in-force/act/5763/1984/amends",
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
}

export { connectDB };
