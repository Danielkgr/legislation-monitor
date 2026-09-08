import { createTwoFilesPatch } from "diff";
import { getSetting } from "./db";
import type { DiffResult } from "./diff";

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

/**
 * A structured, stakeholder-facing explanation of a detected change.
 * `source` records whether the LLM produced it or the built-in heuristic
 * fallback did, so the UI can label provenance.
 */
export interface ChangeBrief {
  summary: string;
  keyChanges: string[];
  whoIsAffected: string;
  whyItMatters: string;
  significance: number; // integer 0-10
  source: "llm" | "heuristic";
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

/** Compact, bounded unified diff for the model — avoids huge prompt payloads. */
function buildDiffPayload(oldText: string, newText: string, maxChars = 12_000): string {
  const patch = createTwoFilesPatch("previous", "current", oldText, newText);
  const body = patch
    .split("\n")
    .filter(
      (l) =>
        !l.startsWith("Index:") &&
        !l.startsWith("====") &&
        !l.startsWith("--- ") &&
        !l.startsWith("+++ ")
    )
    .join("\n");
  return body.length <= maxChars ? body : `${body.slice(0, maxChars)}\n... [diff truncated]`;
}

const SYSTEM_PROMPT = [
  "You are an expert legal-change analyst for a legislation monitoring tool.",
  "You receive a unified diff (previous -> current) between two versions of a piece of legislation.",
  "Explain the change for a non-lawyer stakeholder. Be precise, factual, and concise.",
  "Respond with ONLY a JSON object (no prose, no code fences) with exactly these keys:",
  '  "summary": string,    // 1-3 plain-English sentences on what changed and why',
  '  "keyChanges": string[], // 2-6 short bullets, most important first',
  '  "whoIsAffected": string, // 1-2 sentences on who is impacted',
  '  "whyItMatters": string,  // 1-2 sentences on practical/legal significance',
  '  "significance": number   // integer 0-10; 10 = major legal/operational impact',
].join("\n");

interface ParsedBrief {
  summary: string;
  keyChanges: string[];
  whoIsAffected: string;
  whyItMatters: string;
  significance: number;
}

function clamp0to10(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(10, Math.round(n)));
}

/** Defensively parse a JSON brief out of free model output. */
function parseBrief(raw: string): ParsedBrief | null {
  let text = raw.trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) text = fence[1].trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;

  let obj: unknown;
  try {
    obj = JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
  if (typeof obj !== "object" || obj === null) return null;

  const o = obj as Record<string, unknown>;
  const keyChanges = Array.isArray(o.keyChanges)
    ? o.keyChanges.map((k) => String(k).trim()).filter(Boolean)
    : [];
  return {
    summary: String(o.summary ?? "").trim(),
    keyChanges,
    whoIsAffected: String(o.whoIsAffected ?? "").trim(),
    whyItMatters: String(o.whyItMatters ?? "").trim(),
    significance: clamp0to10(Number(o.significance)),
  };
}

function heuristicToBrief(result: DiffResult, actTitle: string): ChangeBrief {
  const keyChanges =
    result.changedSections.length > 0
      ? result.changedSections.slice(0, 6)
      : ["General amendments across the document"];
  const affected = result.affectedGroups.length > 0 ? result.affectedGroups.join(", ") : "General stakeholders";
  const changeCount = result.addedLines + result.removedLines;
  return {
    summary: result.summary,
    keyChanges,
    whoIsAffected: `Likely affects: ${affected}.`,
    whyItMatters: `${actTitle} was amended: ${result.addedLines} line(s) added, ${result.removedLines} line(s) removed.`,
    significance: clamp0to10(2 + changeCount * 0.5 + result.changedSections.length * 0.5),
    source: "heuristic",
  };
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

  if (!getLLMSettings().enabled) {
    return heuristicToBrief(heuristic, actTitle);
  }

  try {
    const userPrompt = [
      `Act: ${actTitle}`,
      "",
      "Unified diff (previous -> current):",
      buildDiffPayload(oldText, newText),
      "",
      "Return the JSON object now.",
    ].join("\n");

    const raw = await chatCompletion([
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ]);
    const parsed = parseBrief(raw);
    if (!parsed || !parsed.summary) throw new Error("LLM returned no parseable brief");
    return { ...parsed, source: "llm" };
  } catch (err) {
    console.warn(
      "[llm] falling back to heuristic brief:",
      err instanceof Error ? err.message : err
    );
    return heuristicToBrief(heuristic, actTitle);
  }
}
