import { NextResponse } from "next/server";
import { connectDB, type Version } from "@/lib/db";

interface VersionRow extends Version {
  act_title: string;
  jurisdiction: string;
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const db = connectDB();
  const { id } = await params;

  try {
    const versions = db
      .prepare<[string], VersionRow>(
        `SELECT v.*, a.title as act_title, a.jurisdiction
       FROM versions v
       JOIN acts a ON a.id = v.act_id
       WHERE v.act_id = ?
       ORDER BY v.fetched_at DESC, v.id DESC`,
      )
      .all(id);

    // Return metadata as an object rather than a JSON string.
    return NextResponse.json(
      versions.map((v) => ({ ...v, metadata: v.metadata ? JSON.parse(v.metadata) : null })),
    );
  } catch (err) {
    console.error("Error getting versions:", err);
    return NextResponse.json({ error: "Failed to get versions" }, { status: 500 });
  }
}
