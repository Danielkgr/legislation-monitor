import { NextResponse } from "next/server";
import { ActNotFoundError, checkAct } from "@/lib/check";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    return NextResponse.json(await checkAct(id));
  } catch (err) {
    if (err instanceof ActNotFoundError) {
      return NextResponse.json({ error: "Act not found" }, { status: 404 });
    }
    console.error("Error checking act:", err);
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
