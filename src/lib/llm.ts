import {
  BRIEF_SYSTEM_PROMPT,
  buildBriefPrompt,
  type ChangeBrief,
  heuristicBrief,
  parseBrief,
} from "./brief";
import { getSetting } from "./db";
import {
  CLAUDE_EFFORTS,
  type ClaudeEffort,
  DEFAULT_CLAUDE_EFFORT,
  DEFAULT_CLAUDE_MODEL,
  requestClaudeBrief,
} from "./llm-anthropic";
import type { DiffResult } from "./diff";

export type { ChangeBrief } from "./brief";

/**
 * Pluggable LLM integration with a provider switch.  "openai-compatible"
 * talks to any OpenAI-compatible `/chat/completions` endpoint, such as a
 * local Ollama, LM Studio or vLLM server.  "anthropic" uses Claude through
 * the official SDK in llm-anthropic.ts.  Configuration comes from runtime
 * settings (DB), falling back to environment variables, so the user can
 * switch without code changes.
 *
 * This module is server-only: it imports the SQLite-backed settings store and
 * must never be imported from a client component.
 */

export const LLM_PROVIDERS = ["openai-compatible", "anthropic"] as const;
export type LLMProvider = (typeof LLM_PROVIDERS)[number];

export interface LLMSettings {
  enabled: boolean;
  provider: LLMProvider;
  // OpenAI-compatible endpoint
  apiBase: string;
  apiKey: string;
  model: string;
  temperature: number;
  maxTokens: number;
  // Claude, kept separate so switching providers never sends one
  // provider's key or model name to the other
  anthropicApiKey: string;
  anthropicModel: string;
  anthropicEffort: ClaudeEffort;
}

interface ChatMessage {
  role: "system" | "user";
  content: string;
}

function firstNonEmpty(...vals: (string | null | undefined)[]): string {
  for (const v of vals) {
    if (v !== null && v !== undefined && String(v).trim() !== "") return String(v);
  }
  return "";
}

function numSetting(key: string, envVar: string | undefined, defaultValue: number): number {
  const raw = firstNonEmpty(getSetting(key), envVar ? process.env[envVar] : undefined);
  const n = Number(raw);
  return raw !== "" && Number.isFinite(n) ? n : defaultValue;
}

/**
 * Effective LLM config: DB settings override env vars, which override
 * defaults.  Unless llm_enabled or LLM_ENABLED says otherwise, briefs are on
 * only when the chosen provider is configured: an endpoint and a model for
 * an OpenAI-compatible server, or an API key for Claude.  So an unconfigured
 * install never makes an outbound model call.
 */
export function getLLMSettings(): LLMSettings {
  const providerRaw = firstNonEmpty(getSetting("llm_provider"), process.env.LLM_PROVIDER);
  const provider: LLMProvider = providerRaw === "anthropic" ? "anthropic" : "openai-compatible";
  const apiBase = firstNonEmpty(getSetting("llm_api_base"), process.env.LLM_API_BASE);
  const apiKey = firstNonEmpty(getSetting("llm_api_key"), process.env.LLM_API_KEY);
  const model = firstNonEmpty(getSetting("llm_model"), process.env.LLM_MODEL);
  const anthropicApiKey = firstNonEmpty(
    getSetting("anthropic_api_key"),
    process.env.ANTHROPIC_API_KEY,
  );
  const anthropicModel =
    firstNonEmpty(getSetting("anthropic_model"), process.env.ANTHROPIC_MODEL) ||
    DEFAULT_CLAUDE_MODEL;
  const effortRaw = firstNonEmpty(getSetting("anthropic_effort"), process.env.ANTHROPIC_EFFORT);
  const anthropicEffort = (CLAUDE_EFFORTS as readonly string[]).includes(effortRaw)
    ? (effortRaw as ClaudeEffort)
    : DEFAULT_CLAUDE_EFFORT;

  const enabledRaw = firstNonEmpty(getSetting("llm_enabled"), process.env.LLM_ENABLED);
  let enabled: boolean;
  if (enabledRaw === "true" || enabledRaw === "1") enabled = true;
  else if (enabledRaw === "false" || enabledRaw === "0") enabled = false;
  else enabled = provider === "anthropic" ? Boolean(anthropicApiKey) : Boolean(apiBase && model);

  return {
    enabled,
    provider,
    apiBase,
    apiKey,
    model,
    temperature: numSetting("llm_temperature", "LLM_TEMPERATURE", 0.2),
    maxTokens: numSetting("llm_max_tokens", "LLM_MAX_TOKENS", 1024),
    anthropicApiKey,
    anthropicModel,
    anthropicEffort,
  };
}

/** The settings the API may return: everything except the keys themselves. */
export interface PublicLLMSettings {
  enabled: boolean;
  provider: LLMProvider;
  apiBase: string;
  model: string;
  temperature: number;
  maxTokens: number;
  /** True when an OpenAI-compatible key is stored in settings or set in the environment. */
  hasApiKey: boolean;
  anthropicModel: string;
  anthropicEffort: ClaudeEffort;
  /** True when a Claude key is stored in settings or ANTHROPIC_API_KEY is set. */
  hasAnthropicApiKey: boolean;
}

/**
 * Settings for the settings API and page.  Built from an allow-list so a
 * stored key never leaves the server.
 */
export function getPublicLLMSettings(): PublicLLMSettings {
  const s = getLLMSettings();
  return {
    enabled: s.enabled,
    provider: s.provider,
    apiBase: s.apiBase,
    model: s.model,
    temperature: s.temperature,
    maxTokens: s.maxTokens,
    hasApiKey: s.apiKey !== "",
    anthropicModel: s.anthropicModel,
    anthropicEffort: s.anthropicEffort,
    hasAnthropicApiKey: s.anthropicApiKey !== "",
  };
}

async function chatCompletion(messages: ChatMessage[]): Promise<string> {
  const s = getLLMSettings();
  if (!s.apiBase) throw new Error("LLM endpoint is not configured");

  const url = `${s.apiBase.replace(/\/+$/, "")}/chat/completions`;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (s.apiKey) headers.Authorization = `Bearer ${s.apiKey}`;

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: s.model,
      messages,
      temperature: s.temperature,
      max_tokens: s.maxTokens,
    }),
    signal: AbortSignal.timeout(60_000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`LLM request failed (HTTP ${res.status}): ${body.slice(0, 300)}`);
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: unknown } }>;
  };
  const content = data.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new Error("LLM response did not include message content");
  }
  return content;
}

/**
 * Produce a structured change brief. Uses the configured LLM when enabled and
 * reachable; otherwise (or on any failure) falls back to the deterministic
 * heuristic so change detection never breaks because of the LLM.
 */
export async function generateChangeBrief(params: {
  actTitle: string;
  oldText: string;
  newText: string;
  heuristic: DiffResult;
}): Promise<ChangeBrief> {
  const { actTitle, oldText, newText, heuristic } = params;

  const settings = getLLMSettings();
  if (!settings.enabled) {
    return heuristicBrief(heuristic, actTitle);
  }

  if (settings.provider === "anthropic") {
    if (!settings.anthropicApiKey) {
      return heuristicBrief(heuristic, actTitle, "no Claude API key is set");
    }
    const result = await requestClaudeBrief(buildBriefPrompt(actTitle, oldText, newText), {
      apiKey: settings.anthropicApiKey,
      model: settings.anthropicModel,
      effort: settings.anthropicEffort,
    });
    if (result.ok) return { ...result.brief, source: "claude", model: result.model };
    console.warn("[llm] Claude brief failed, using the heuristic:", result.reason);
    return heuristicBrief(heuristic, actTitle, result.reason);
  }

  try {
    const raw = await chatCompletion([
      { role: "system", content: BRIEF_SYSTEM_PROMPT },
      { role: "user", content: buildBriefPrompt(actTitle, oldText, newText) },
    ]);
    const parsed = parseBrief(raw);
    if (!parsed) throw new Error("the model returned no parseable brief");
    return { ...parsed, source: "llm", ...(settings.model ? { model: settings.model } : {}) };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.warn("[llm] falling back to heuristic brief:", reason);
    return heuristicBrief(heuristic, actTitle, `The model call failed: ${reason}`);
  }
}
