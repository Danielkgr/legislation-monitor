import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";

export async function GET(
  _req: any,
  { params }: { params: Promise<{ id: string }> }
) {
  const db = connectDB();
  const { id } = await params;

  try {
    const versions = db.prepare(
      `SELECT v.*, a.title as act_title, a.jurisdiction
       FROM versions v
       JOIN acts a ON a.id = v.act_id
       WHERE v.act_id = ?
       ORDER BY v.fetched_at DESC`
    ).all(id) as any[];

    return NextResponse.json(versions);
  } catch (err) {
    console.error("Error getting versions:", err);
    return NextResponse.json({ error: "Failed to get versions" }, { status: 500 });
  }
}
