import {
  BRIEF_SYSTEM_PROMPT,
  buildBriefPrompt,
  type ChangeBrief,
  heuristicBrief,
  parseBrief,
} from "./brief";
import { getSetting } from "./db";
import type { DiffResult } from "./diff";

export type { ChangeBrief } from "./brief";

/**
 * Pluggable LLM integration. Talks to any OpenAI-compatible
 * `/chat/completions` endpoint — a cloud provider or a local server (Ollama,
 * LM Studio, vLLM, etc.). Configuration comes from runtime settings (DB),
 * falling back to environment variables, so the user can point it at whatever
 * they prefer without code changes.
 *
 * This module is server-only: it imports the SQLite-backed settings store and
 * must never be imported from a client component.
 */

export interface LLMSettings {
  enabled: boolean;
  apiBase: string;
  apiKey: string;
  model: string;
  temperature: number;
  maxTokens: number;
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
 * Effective LLM config: DB settings override env vars, which override defaults.
 * Defaults to disabled unless both an endpoint and a model are configured, so
 * an unconfigured install never attempts an outbound LLM call.
 */
export function getLLMSettings(): LLMSettings {
  const apiBase = firstNonEmpty(getSetting("llm_api_base"), process.env.LLM_API_BASE);
  const apiKey = firstNonEmpty(getSetting("llm_api_key"), process.env.LLM_API_KEY);
  const model = firstNonEmpty(getSetting("llm_model"), process.env.LLM_MODEL);

  const enabledRaw = firstNonEmpty(getSetting("llm_enabled"), process.env.LLM_ENABLED);
  let enabled: boolean;
  if (enabledRaw === "true" || enabledRaw === "1") enabled = true;
  else if (enabledRaw === "false" || enabledRaw === "0") enabled = false;
  else enabled = Boolean(apiBase && model);

  return {
    enabled,
    apiBase,
    apiKey,
    model,
    temperature: numSetting("llm_temperature", "LLM_TEMPERATURE", 0.2),
    maxTokens: numSetting("llm_max_tokens", "LLM_MAX_TOKENS", 1024),
  };
}

/** The settings the API may return: everything except the key itself. */
export interface PublicLLMSettings {
  enabled: boolean;
  apiBase: string;
  model: string;
  temperature: number;
  maxTokens: number;
  /** True when a key is stored in settings or set in the environment. */
  hasApiKey: boolean;
}

/**
 * Settings for the settings API and page.  Built from an allow-list so a
 * stored key never leaves the server.
 */
export function getPublicLLMSettings(): PublicLLMSettings {
  const s = getLLMSettings();
  return {
    enabled: s.enabled,
    apiBase: s.apiBase,
    model: s.model,
    temperature: s.temperature,
    maxTokens: s.maxTokens,
    hasApiKey: s.apiKey !== "",
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
