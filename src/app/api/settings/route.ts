import { NextResponse } from "next/server";
import { setSetting } from "@/lib/db";
import { getPublicLLMSettings } from "@/lib/llm";

export async function GET() {
  try {
    return NextResponse.json({ llm: getPublicLLMSettings() });
  } catch (err) {
    console.error("Error reading settings:", err);
    return NextResponse.json({ error: "Failed to read settings" }, { status: 500 });
  }
}

/**
 * Persist LLM settings to the SQLite-backed settings store.  DB values take
 * precedence over environment variables (see getLLMSettings).  Passing an
 * empty string for apiBase or model clears it, letting the env fallback (or
 * default) apply.  The API key is different: a blank or missing apiKey keeps
 * the stored key, and clearApiKey: true removes it.  Responses never include
 * the key, only hasApiKey.
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      llm?: {
        enabled?: boolean;
        apiBase?: string;
        apiKey?: string;
        clearApiKey?: boolean;
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
    if (llm.clearApiKey === true) {
      setSetting("llm_api_key", "");
    } else if (typeof llm.apiKey === "string" && llm.apiKey.trim() !== "") {
      setSetting("llm_api_key", llm.apiKey.trim());
    }
    if (llm.model !== undefined) setSetting("llm_model", String(llm.model).trim());
    if (llm.temperature !== undefined) setSetting("llm_temperature", String(llm.temperature));
    if (llm.maxTokens !== undefined) setSetting("llm_max_tokens", String(llm.maxTokens));

    return NextResponse.json({ success: true, llm: getPublicLLMSettings() });
  } catch (err) {
    console.error("Error saving settings:", err);
    return NextResponse.json({ error: "Failed to save settings" }, { status: 500 });
  }
}
