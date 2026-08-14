import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const db = connectDB();
  const { id } = await params;

  try {
    const act = db.prepare(
      `SELECT a.*,
        (SELECT COUNT(*) FROM versions WHERE act_id = a.id) as version_count,
        (SELECT fetched_at FROM versions WHERE act_id = a.id ORDER BY fetched_at DESC LIMIT 1) as last_checked,
        (SELECT COUNT(*) FROM changes WHERE act_id = a.id AND detected_at >= datetime('now', '-7 days')) as recent_changes
       FROM acts a WHERE a.id = ?`
    ).get(id) as any;

    if (!act) {
      return NextResponse.json({ error: "Act not found" }, { status: 404 });
    }

    return NextResponse.json(act);
  } catch (err) {
    console.error("Error getting act:", err);
    return NextResponse.json({ error: "Failed to get act" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const db = connectDB();
  const { id } = await params;

  try {
    db.prepare("DELETE FROM acts WHERE id = ?").run(id);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Error deleting act:", err);
    return NextResponse.json({ error: "Failed to delete act" }, { status: 500 });
  }
}
