import { NextRequest, NextResponse } from "next/server";
import { listChanges } from "@/lib/changes";
import { type Act, connectDB } from "@/lib/db";

export async function GET(req: NextRequest, { params }: { params: Promise<{ actId: string }> }) {
  const { actId } = await params;
  const format = req.nextUrl.searchParams.get("format") ?? "json";

  try {
    const act = connectDB()
      .prepare<[string], Pick<Act, "title" | "jurisdiction">>(
        "SELECT title, jurisdiction FROM acts WHERE id = ?",
      )
      .get(actId);
    if (!act) {
      return NextResponse.json({ error: "Act not found" }, { status: 404 });
    }

    const parsed = listChanges(actId).map((c) => ({ ...c, jurisdiction: act.jurisdiction }));

    if (format === "md") {
      const md = [
        `# Change Report: ${act.title}`,
        `Jurisdiction: ${act.jurisdiction}`,
        `Generated: ${new Date().toISOString()}`,
        `Changes detected: ${parsed.length}`,
        "",
      ].join("\n");

      const body = parsed.map((c) =>
        [
          `## Change #${c.id} — ${c.detected_at.slice(0, 10)}`,
          `Versions: ${c.from_label || "—"} → ${c.to_label || "—"}`,
          c.summary ? `**Summary:** ${c.summary}` : "",
          c.brief?.keyChanges?.length
            ? `**Key changes:**\n${c.brief.keyChanges.map((k) => `- ${k}`).join("\n")}`
            : "",
          c.sections_changed?.length
            ? `**Changed sections:** ${c.sections_changed.join(", ")}`
            : "",
          c.affected_groups?.length ? `**Affects:** ${c.affected_groups.join(", ")}` : "",
          c.brief?.whoIsAffected || c.brief?.whyItMatters
            ? `\n${c.brief.whoIsAffected || ""}\n${c.brief.whyItMatters || ""}`
            : "",
          "---",
        ]
          .filter(Boolean)
          .join("\n"),
      );

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
