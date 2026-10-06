import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { closeDB, connectDB } from "./db";

let dir: string | null = null;

afterEach(() => {
  closeDB();
  if (dir) fs.rmSync(dir, { recursive: true, force: true });
  dir = null;
});

describe("URL migration", () => {
  it("moves the old pinned seed URLs to each title's latest version", () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "lm-db-"));
    const file = path.join(dir, "legacy.db");
    const legacy = new Database(file);
    legacy.exec(`CREATE TABLE acts (
      id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, url TEXT NOT NULL UNIQUE,
      jurisdiction TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')))`);
    const insert = legacy.prepare("INSERT INTO acts (title, url, jurisdiction) VALUES (?, ?, ?)");
    insert.run("Privacy Act 1988", "https://www.legislation.gov.au/Details/C2024C00026", "federal");
    insert.run(
      "Crimes Act 1958",
      "https://www.legislation.vic.gov.au/in-force/act/crimes-act-1958",
      "vic",
    );
    insert.run("Unrecognised", "https://example.test/somewhere", "federal");
    legacy.close();

    process.env.LEGISLATION_DB_PATH = file;
    closeDB();
    const urls = connectDB()
      .prepare<[], { title: string; url: string }>("SELECT title, url FROM acts ORDER BY id")
      .all();

    expect(urls).toEqual([
      { title: "Privacy Act 1988", url: "https://www.legislation.gov.au/C2004A03712/latest/text" },
      {
        title: "Crimes Act 1958",
        url: "https://www.legislation.vic.gov.au/in-force/acts/crimes-act-1958",
      },
      { title: "Unrecognised", url: "https://example.test/somewhere" },
    ]);
  });
});
