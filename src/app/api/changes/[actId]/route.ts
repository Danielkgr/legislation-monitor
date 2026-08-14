import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";

export async function GET(
  _req: any,
  { params }: { params: Promise<{ actId: string }> }
) {
  const db = connectDB();
  const { actId } = await params;

  try {
    const changes = db.prepare(
      `SELECT c.*, a.title as act_title, v2.version_label as to_label, v1.version_label as from_label,
        json_each.value as section
       FROM changes c
       JOIN acts a ON a.id = c.act_id
       JOIN versions v2 ON v2.id = c.version_to_id
       LEFT JOIN versions v1 ON v1.id = c.version_from_id
       LEFT JOIN json_each(c.sections_changed) on_true
       WHERE c.act_id = ?
       ORDER BY c.detected_at DESC`
    ).all(actId) as any[];

    // Parse the JSON arrays properly
    const parsedChanges = changes.reduce<any[]>((acc, row) => {
      let existing = acc.find((c: any) => c.id === row.id);
      if (!existing) {
        existing = {
          id: row.id,
          act_id: row.act_id,
          version_from_id: row.version_from_id,
          version_to_id: row.version_to_id,
          detected_at: row.detected_at,
          summary: row.summary,
          sections_changed: [],
          affected_groups: JSON.parse(row.affected_groups || "[]"),
          change_count: row.change_count,
          from_label: row.from_label,
          to_label: row.to_label,
        };
        acc.push(existing);
      }
      if (row.section !== null && !existing.sections_changed.includes(row.section)) {
        existing.sections_changed.push(row.section);
      }
      return acc;
    }, []);

    return NextResponse.json(parsedChanges);
  } catch (err) {
    console.error("Error getting changes:", err);
    return NextResponse.json({ error: "Failed to get changes" }, { status: 500 });
  }
}
