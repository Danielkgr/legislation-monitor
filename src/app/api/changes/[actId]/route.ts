import { NextResponse } from "next/server";
import { listChanges } from "@/lib/changes";

export async function GET(_req: Request, { params }: { params: Promise<{ actId: string }> }) {
  const { actId } = await params;

  try {
    return NextResponse.json(listChanges(actId));
  } catch (err) {
    console.error("Error getting changes:", err);
    return NextResponse.json({ error: "Failed to get changes" }, { status: 500 });
  }
}
