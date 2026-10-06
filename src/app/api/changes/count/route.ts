import { NextResponse } from "next/server";
import { getPendingChanges } from "@/lib/db";

/** Changes recorded since the user last acknowledged them. */
export async function GET() {
  try {
    return NextResponse.json({ pending: getPendingChanges() });
  } catch (err) {
    console.error("Error reading the pending-changes counter:", err);
    return NextResponse.json(
      { error: "Failed to read the pending-changes counter" },
      { status: 500 },
    );
  }
}
