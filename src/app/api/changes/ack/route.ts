import { NextResponse } from "next/server";
import { resetPendingChanges } from "@/lib/db";

/** Reset the pending-changes counter once the user has seen the changes. */
export async function POST() {
  try {
    resetPendingChanges();
    return NextResponse.json({ pending: 0 });
  } catch (err) {
    console.error("Error resetting the pending-changes counter:", err);
    return NextResponse.json({ error: "Failed to acknowledge." }, { status: 500 });
  }
}
