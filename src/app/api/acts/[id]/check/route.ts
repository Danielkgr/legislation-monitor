import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { scrapeAct } from "@/lib/scrapers";
import { analyzeChanges } from "@/lib/diff";

export async function POST(
  _req: any,
  { params }: { params: Promise<{ id: string }> }
) {
  const db = connectDB();
  const { id } = await params;

  try {
    const act = db.prepare("SELECT * FROM acts WHERE id = ?").get(id) as any;
    if (!act) {
      return NextResponse.json({ error: "Act not found" }, { status: 404 });
    }

    // Fetch current version
    const scrapeResult = await scrapeAct(act.url, act.jurisdiction);

    // Check if content has changed since the latest version
    const latestVersion = db.prepare(
      `SELECT * FROM versions WHERE act_id = ? ORDER BY fetched_at DESC LIMIT 1`
    ).get(id) as any;

    let newVersionId: number | null = null;
    let changeRecord: any = null;

    // Store new version
    const existingVersions: any[] = db.prepare(
      "SELECT content_hash FROM versions WHERE act_id = ?"
    ).all(id);
    const existingHashes = new Set(existingVersions.map((v) => v.content_hash));

    if (!existingHashes.has(scrapeResult.contentHash)) {
      // New version detected
      const insertVersion = db.prepare(
        `INSERT INTO versions (act_id, version_label, content_hash, plain_text, source_url) VALUES (?, ?, ?, ?, ?)`
      );
      const result = insertVersion.run(
        id,
        scrapeResult.versionLabel,
        scrapeResult.contentHash,
        scrapeResult.plainText,
        act.url
      );
      newVersionId = result.lastInsertRowid as number;

      // Compare with previous version if one exists
      if (latestVersion) {
        const oldText = latestVersion.plain_text || "";
        const newText = scrapeResult.plainText;

        if (oldText && newText !== oldText) {
          const diffResult = analyzeChanges(oldText, newText, act.title);

          // Store sections and affected groups as JSON
          const sectionsJson = JSON.stringify(diffResult.changedSections.slice(0, 10));
          const affectedJson = JSON.stringify(diffResult.affectedGroups);

          const insertChange = db.prepare(
            `INSERT INTO changes (act_id, version_from_id, version_to_id, summary, sections_changed, affected_groups, change_count)
             VALUES (?, ?, ?, ?, ?, ?, ?)`
          );
          const changeRes = insertChange.run(
            id,
            latestVersion.id,
            newVersionId,
            diffResult.summary,
            sectionsJson,
            affectedJson,
            diffResult.addedLines + diffResult.removedLines
          );
          changeRecord = {
            id: changeRes.lastInsertRowid as number,
            summary: diffResult.summary,
            sections_changed: diffResult.changedSections.slice(0, 10),
            affected_groups: diffResult.affectedGroups,
            change_count: diffResult.addedLines + diffResult.removedLines,
          };

          // Store full diffs in a separate table for viewing
          try {
            const createDiffsTable = `
              CREATE TABLE IF NOT EXISTS content_diffs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                change_id INTEGER NOT NULL,
                side TEXT NOT NULL CHECK(side IN ('old', 'new')),
                line_number INTEGER NOT NULL,
                content TEXT NOT NULL,
                FOREIGN KEY (change_id) REFERENCES changes(id) ON DELETE CASCADE
              )
            `;
            db.exec(createDiffsTable);

            const oldLines = oldText.split("\n");
            const newLines = newText.split("\n");

            // Store context around changes
            const insertDiffLine = db.prepare(
              "INSERT INTO content_diffs (change_id, side, line_number, content) VALUES (?, ?, ?, ?)"
            );
            for (let i = 0; i < Math.min(oldLines.length, 500); i++) {
              if (oldLines[i] && oldLines[i].trim()) {
                insertDiffLine.run(changeRes.lastInsertRowid, "old", i + 1, oldLines[i]);
              }
            }
            for (let i = 0; i < Math.min(newLines.length, 500); i++) {
              if (newLines[i] && newLines[i].trim()) {
                insertDiffLine.run(changeRes.lastInsertRowid, "new", i + 1, newLines[i]);
              }
            }
          } catch (diffErr) {
            console.warn("Failed to store diff lines:", diffErr);
          }
        }
      }

      // Update act's updated_at timestamp
      db.prepare("UPDATE acts SET updated_at = datetime('now') WHERE id = ?").run(id);
    }

    return NextResponse.json({
      success: true,
      hasChange: !!newVersionId,
      change: changeRecord,
      new_version_count: (db.prepare("SELECT COUNT(*) as cnt FROM versions WHERE act_id = ?").get(id) as any).cnt,
    });
  } catch (err) {
    console.error("Error checking act:", err);
    return NextResponse.json(
      { success: false, error: String(err) },
      { status: 500 }
    );
  }
}
