import { NextResponse } from "next/server";

export async function GET() {
  try {
    const db = await import("@/lib/db").then((m) => m.connectDB());
    const row = db.prepare("SELECT value FROM settings WHERE key = 'pending_changes_count'").get() as
      | { value: string }
      | undefined;

    let count = 0;
    if (row && typeof row.value === "string") {
      const parsed = parseInt(row.value, 10);
      if (!isNaN(parsed) && parsed >= 0) count = parsed;
    }

    return NextResponse.json({ pending: count });
  } catch {
    return NextResponse.json({ pending: 0 });
  }
}
