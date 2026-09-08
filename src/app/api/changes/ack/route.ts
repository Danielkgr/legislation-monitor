import { NextResponse } from "next/server";

export async function POST() {
  try {
    const db = await import("@/lib/db").then((m) => m.connectDB());
    db.prepare("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('pending_changes_count', '0', datetime('now'))").run();

    return NextResponse.json({ pending: 0 });
  } catch {
    return NextResponse.json({ error: "Failed to acknowledge." }, { status: 500 });
  }
}
