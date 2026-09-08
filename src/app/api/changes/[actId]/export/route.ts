import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ actId: string }> }
) {
  const db = connectDB();
  const { actId } = await params;
  const format = req.nextUrl.searchParams.get("format") ?? "json";

  try {
    const act = db.prepare("SELECT title, jurisdiction FROM acts WHERE id = ?").get(actId) as any;
    if (!act) {
      return NextResponse.json({ error: "Act not found" }, { status: 404 });
    }

    const rows = db.prepare(
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

    const parsed = rows.reduce<any[]>((acc, row) => {
      let existing = acc.find((c: any) => c.id === row.id);
      if (!existing) {
        existing = {
          id: row.id,
          act_id: row.act_id,
          act_title: row.act_title,
          jurisdiction: act.jurisdiction,
          version_from_id: row.version_from_id,
          version_to_id: row.version_to_id,
          from_label: row.from_label ?? null,
          to_label: row.to_label ?? null,
          detected_at: row.detected_at,
          summary: row.summary ?? null,
          sections_changed: [],
          affected_groups: JSON.parse(row.affected_groups || "[]"),
          change_count: row.change_count ?? 0,
          brief: row.brief ? JSON.parse(row.brief) : null,
        };
        acc.push(existing);
      }
      if (row.section !== null && !existing.sections_changed.includes(row.section)) {
        existing.sections_changed.push(row.section);
      }
      return acc;
    }, []);

    if (format === "md") {
      const md = [
        `# Change Report: ${act.title}`,
        `Jurisdiction: ${act.jurisdiction}`,
        `Generated: ${new Date().toISOString()}`,
        `Changes detected: ${parsed.length}`,
        "",
      ].join("\n");

      const body = parsed.map((c: any) => [
        `## Change #${c.id} — ${c.detected_at.slice(0, 10)}`,
        `Versions: ${c.from_label || "—"} → ${c.to_label || "—"}`,
        c.summary ? `**Summary:** ${c.summary}` : "",
        c.brief?.keyChanges?.length
          ? `**Key changes:**\n${c.brief.keyChanges.map((k: string) => `- ${k}`).join("\n")}`
          : "",
        c.sections_changed?.length
          ? `**Changed sections:** ${c.sections_changed.join(", ")}`
          : "",
        c.affected_groups?.length
          ? `**Affects:** ${c.affected_groups.join(", ")}`
          : "",
        c.brief?.whoIsAffected || c.brief?.whyItMatters
          ? `\n${c.brief.whoIsAffected || ""}\n${c.brief.whyItMatters || ""}`
          : "",
        "---",
      ].filter(Boolean).join("\n"));

      const content = md + body.join("\n\n");
      return new NextResponse(content, {
        headers: {
          "Content-Type": "text/markdown",
          "Content-Disposition": `attachment; filename="changes-${actId}.md"`,
        },
      });
    }

    // Default: JSON
    return new NextResponse(JSON.stringify(parsed, null, 2), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="changes-${actId}.json"`,
      },
    });
  } catch (err) {
    console.error("Error exporting changes:", err);
    return NextResponse.json({ error: "Failed to export changes" }, { status: 500 });
  }
}
