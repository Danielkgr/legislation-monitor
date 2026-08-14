import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { scrapeAct } from "@/lib/scrapers";

export async function GET() {
  const db = connectDB();
  try {
    const acts = db.prepare(
      `SELECT a.*,
        (SELECT COUNT(*) FROM versions WHERE act_id = a.id) as version_count,
        (SELECT fetched_at FROM versions WHERE act_id = a.id ORDER BY fetched_at DESC LIMIT 1) as last_checked,
        (SELECT COUNT(*) FROM changes WHERE act_id = a.id AND detected_at >= datetime('now', '-7 days')) as recent_changes
      FROM acts a
      ORDER BY a.updated_at DESC`
    ).all() as any[];

    return NextResponse.json(acts);
  } catch (err) {
    console.error("Error listing acts:", err);
    return NextResponse.json({ error: "Failed to list acts" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const db = connectDB();
  try {
    const body = await req.json();
    const { title, url, jurisdiction } = body;

    if (!title || !url) {
      return NextResponse.json({ error: "Title and URL are required" }, { status: 400 });
    }

    if (!["federal", "vic"].includes(jurisdiction ?? "")) {
      return NextResponse.json({ error: "Jurisdiction must be 'federal' or 'vic'" }, { status: 400 });
    }

    // Check for duplicate URL
    const existing = db.prepare("SELECT id FROM acts WHERE url = ?").get(url) as { id: number } | undefined;
    if (existing) {
      return NextResponse.json({ error: "This Act is already being watched", id: existing.id }, { status: 409 });
    }

    const result = db.prepare(
      "INSERT INTO acts (title, url, jurisdiction) VALUES (?, ?, ?)"
    ).run(title, url, jurisdiction);

    const act = db.prepare(
      "SELECT * FROM acts WHERE id = ?"
    ).get(result.lastInsertRowid) as any;

    // Immediately fetch the first version
    try {
      const scrapeResult = await scrapeAct(url, jurisdiction as "federal" | "vic");
      db.prepare(
        `INSERT INTO versions (act_id, version_label, content_hash, plain_text, source_url) VALUES (?, ?, ?, ?, ?)`
      ).run(act.id, scrapeResult.versionLabel, scrapeResult.contentHash, scrapeResult.plainText, url);

      db.prepare("UPDATE acts SET updated_at = datetime('now') WHERE id = ?").run(act.id);
    } catch (scrapeErr) {
      console.warn(`Initial scrape failed for ${title}:`, scrapeErr);
    }

    return NextResponse.json(act, { status: 201 });
  } catch (err) {
    console.error("Error creating act:", err);
    return NextResponse.json({ error: "Failed to create act" }, { status: 500 });
  }
}
