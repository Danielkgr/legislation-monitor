import { closeDB, connectDB } from "./db";

/**
 * Point the app at a fresh in-memory database with no seeded Acts.  Call it
 * in beforeEach so every test starts from an empty schema.
 */
export function useTestDatabase() {
  process.env.LEGISLATION_DB_PATH = ":memory:";
  process.env.SEED_DEFAULT_ACTS = "false";
  closeDB();
  return connectDB();
}

/** Insert an Act with two versions and one recorded change between them. */
export function seedActWithChange() {
  const db = connectDB();
  const actId = Number(
    db
      .prepare("INSERT INTO acts (title, url, jurisdiction) VALUES (?, ?, ?)")
      .run("Example Act 2026", "https://example.test/example-act-2026", "federal").lastInsertRowid,
  );
  const insertVersion = db.prepare(
    "INSERT INTO versions (act_id, version_label, content_hash, plain_text) VALUES (?, ?, ?, ?)",
  );
  const fromId = Number(
    insertVersion.run(actId, "Compilation No. 1", "hash-1", "Section 5\nOld text.").lastInsertRowid,
  );
  const toId = Number(
    insertVersion.run(actId, "Compilation No. 2", "hash-2", "Section 5\nNew text.").lastInsertRowid,
  );
  const brief = {
    summary: "Section 5 now says new text.",
    keyChanges: ["Section 5 text replaced"],
    whoIsAffected: "Likely affects: General Public.",
    whyItMatters: "Example Act 2026 was amended: 1 line(s) added, 1 line(s) removed.",
    significance: 3,
    source: "heuristic",
  };
  const changeId = Number(
    db
      .prepare(
        `INSERT INTO changes (act_id, version_from_id, version_to_id, summary, sections_changed,
           affected_groups, change_count, brief, section_details)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        actId,
        fromId,
        toId,
        brief.summary,
        JSON.stringify(["Section 5", 'Added: "New text."']),
        JSON.stringify(["General Public"]),
        2,
        JSON.stringify(brief),
        JSON.stringify([]),
      ).lastInsertRowid,
  );
  return { actId, fromId, toId, changeId, brief };
}
