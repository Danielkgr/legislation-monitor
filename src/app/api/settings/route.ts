import { NextResponse } from "next/server";
import { setSetting } from "@/lib/db";
import { getPublicLLMSettings, LLM_PROVIDERS } from "@/lib/llm";
import { CLAUDE_EFFORTS } from "@/lib/llm-anthropic";

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
 * default) apply.  API keys are different: a blank or missing apiKey or
 * anthropicApiKey keeps the stored key, and clearApiKey or
 * clearAnthropicApiKey removes it.  Responses never include a key, only
 * hasApiKey and hasAnthropicApiKey.
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
        provider?: string;
        anthropicApiKey?: string;
        clearAnthropicApiKey?: boolean;
        anthropicModel?: string;
        anthropicEffort?: string;
      };
    };
    const llm = body.llm ?? {};

    if (
      llm.provider !== undefined &&
      !(LLM_PROVIDERS as readonly string[]).includes(llm.provider)
    ) {
      return NextResponse.json(
        { error: `provider must be one of: ${LLM_PROVIDERS.join(", ")}` },
        { status: 400 },
      );
    }
    if (
      llm.anthropicEffort !== undefined &&
      !(CLAUDE_EFFORTS as readonly string[]).includes(llm.anthropicEffort)
    ) {
      return NextResponse.json(
        { error: `anthropicEffort must be one of: ${CLAUDE_EFFORTS.join(", ")}` },
        { status: 400 },
      );
    }

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
    if (llm.provider !== undefined) setSetting("llm_provider", llm.provider);
    if (llm.clearAnthropicApiKey === true) {
      setSetting("anthropic_api_key", "");
    } else if (typeof llm.anthropicApiKey === "string" && llm.anthropicApiKey.trim() !== "") {
      setSetting("anthropic_api_key", llm.anthropicApiKey.trim());
    }
    if (llm.anthropicModel !== undefined) {
      setSetting("anthropic_model", String(llm.anthropicModel).trim());
    }
    if (llm.anthropicEffort !== undefined) setSetting("anthropic_effort", llm.anthropicEffort);

    return NextResponse.json({ success: true, llm: getPublicLLMSettings() });
  } catch (err) {
    console.error("Error saving settings:", err);
    return NextResponse.json({ error: "Failed to save settings" }, { status: 500 });
  }
}
