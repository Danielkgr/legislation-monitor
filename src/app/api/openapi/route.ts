import { NextResponse } from "next/server";
import { readFileSync } from "fs";
import path from "path";

export async function GET() {
  try {
    const specPath = path.join(process.cwd(), "public", "openapi.json");
    const spec = readFileSync(specPath, "utf-8");
    return new NextResponse(spec, {
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Failed to load OpenAPI specification" },
      { status: 500 }
    );
  }
}
