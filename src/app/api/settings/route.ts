import { NextResponse } from "next/server";
import { getLLMSettings } from "@/lib/llm";
import { setSetting } from "@/lib/db";

export async function GET() {
  try {
    return NextResponse.json({ llm: getLLMSettings() });
  } catch (err) {
    console.error("Error reading settings:", err);
    return NextResponse.json({ error: "Failed to read settings" }, { status: 500 });
  }
}

/**
 * Persist LLM settings to the SQLite-backed settings store. DB values take
 * precedence over environment variables (see getLLMSettings). Passing an empty
 * string for a field clears it, letting the env fallback (or default) apply.
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      llm?: {
        enabled?: boolean;
        apiBase?: string;
        apiKey?: string;
        model?: string;
        temperature?: number;
        maxTokens?: number;
      };
    };
    const llm = body.llm ?? {};

    if (typeof llm.enabled === "boolean") {
      setSetting("llm_enabled", llm.enabled ? "true" : "false");
    }
    if (llm.apiBase !== undefined) setSetting("llm_api_base", String(llm.apiBase).trim());
    if (llm.apiKey !== undefined) setSetting("llm_api_key", String(llm.apiKey));
    if (llm.model !== undefined) setSetting("llm_model", String(llm.model).trim());
    if (llm.temperature !== undefined) setSetting("llm_temperature", String(llm.temperature));
    if (llm.maxTokens !== undefined) setSetting("llm_max_tokens", String(llm.maxTokens));

    return NextResponse.json({ success: true, llm: getLLMSettings() });
  } catch (err) {
    console.error("Error saving settings:", err);
    return NextResponse.json({ error: "Failed to save settings" }, { status: 500 });
  }
}
