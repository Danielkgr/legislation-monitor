import { createTwoFilesPatch } from "diff";
import type { DiffResult } from "./diff";

/**
 * The brief contract every provider shares: the prompt, the bounded diff,
 * the JSON shape, its validation and the heuristic fallback.  Provider code
 * lives in llm.ts (OpenAI-compatible endpoints) and llm-anthropic.ts (Claude).
 */

/** What a brief says, whoever wrote it. */
export interface BriefContent {
  summary: string;
  keyChanges: string[];
  whoIsAffected: string;
  whyItMatters: string;
  significance: number; // integer 0-10
}

/**
 * A structured, stakeholder-facing explanation of a detected change.
 * `source` records who wrote it, so the UI can label provenance: Claude, a
 * model behind an OpenAI-compatible endpoint ("llm"), or the heuristic.
 */
export interface ChangeBrief extends BriefContent {
  source: "claude" | "llm" | "heuristic";
  /** The model that wrote the brief, as its API reported it. */
  model?: string;
  /** Why the heuristic wrote the brief although a model was configured. */
  fallbackReason?: string;
}

export const BRIEF_SYSTEM_PROMPT = [
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

/**
 * JSON schema for structured outputs.  Structured outputs do not support
 * numeric bounds, so the 0-10 range is in the description and enforced by
 * validateBrief.
 */
export const BRIEF_JSON_SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string", description: "1-3 plain-English sentences on what changed" },
    keyChanges: {
      type: "array",
      items: { type: "string" },
      description: "2-6 short bullets, most important first",
    },
    whoIsAffected: { type: "string", description: "1-2 sentences on who is affected" },
    whyItMatters: { type: "string", description: "1-2 sentences on the practical significance" },
    significance: {
      type: "integer",
      description: "0 to 10, where 10 means a major legal or operational impact",
    },
  },
  required: ["summary", "keyChanges", "whoIsAffected", "whyItMatters", "significance"],
  additionalProperties: false,
};

/** Characters of unified diff sent to a model.  Larger diffs are truncated. */
export const MAX_DIFF_CHARS = 12_000;

/** Compact, bounded unified diff for the model, which avoids huge prompts. */
export function buildDiffPayload(
  oldText: string,
  newText: string,
  maxChars = MAX_DIFF_CHARS,
): string {
  const patch = createTwoFilesPatch("previous", "current", oldText, newText);
  const body = patch
    .split("\n")
    .filter(
      (l) =>
        !l.startsWith("Index:") &&
        !l.startsWith("====") &&
        !l.startsWith("--- ") &&
        !l.startsWith("+++ "),
    )
    .join("\n");
  return body.length <= maxChars ? body : `${body.slice(0, maxChars)}\n... [diff truncated]`;
}

export function buildBriefPrompt(actTitle: string, oldText: string, newText: string): string {
  return [
    `Act: ${actTitle}`,
    "",
    "Unified diff (previous -> current):",
    buildDiffPayload(oldText, newText),
    "",
    "Return the JSON object now.",
  ].join("\n");
}

function clamp0to10(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(10, Math.round(n)));
}

/**
 * Strict check of a parsed brief object, for providers that return JSON by
 * schema.  Returns null unless every field has the right type and the
 * summary is not empty.  Significance is clamped to 0-10.
 */
export function validateBrief(value: unknown): BriefContent | null {
  if (typeof value !== "object" || value === null) return null;
  const o = value as Record<string, unknown>;
  if (
    typeof o.summary !== "string" ||
    !o.summary.trim() ||
    !Array.isArray(o.keyChanges) ||
    !o.keyChanges.every((k) => typeof k === "string") ||
    typeof o.whoIsAffected !== "string" ||
    typeof o.whyItMatters !== "string" ||
    typeof o.significance !== "number"
  ) {
    return null;
  }
  return {
    summary: o.summary.trim(),
    keyChanges: (o.keyChanges as string[]).map((k) => k.trim()).filter(Boolean),
    whoIsAffected: o.whoIsAffected.trim(),
    whyItMatters: o.whyItMatters.trim(),
    significance: clamp0to10(o.significance),
  };
}

/**
 * Lenient parse of a JSON brief out of free model output, for endpoints
 * without structured outputs.  Accepts code fences and surrounding prose,
 * and coerces field types.  Returns null when no JSON object with a summary
 * can be found.
 */
export function parseBrief(raw: string): BriefContent | null {
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
  const summary = String(o.summary ?? "").trim();
  if (!summary) return null;
  return {
    summary,
    keyChanges: Array.isArray(o.keyChanges)
      ? o.keyChanges.map((k) => String(k).trim()).filter(Boolean)
      : [],
    whoIsAffected: String(o.whoIsAffected ?? "").trim(),
    whyItMatters: String(o.whyItMatters ?? "").trim(),
    significance: clamp0to10(Number(o.significance)),
  };
}

/** The deterministic brief, used when no model is configured or a model call fails. */
export function heuristicBrief(
  result: DiffResult,
  actTitle: string,
  fallbackReason?: string,
): ChangeBrief {
  const keyChanges =
    result.changedSections.length > 0
      ? result.changedSections.slice(0, 6)
      : ["General amendments across the document"];
  const affected =
    result.affectedGroups.length > 0 ? result.affectedGroups.join(", ") : "General stakeholders";
  const changeCount = result.addedLines + result.removedLines;
  return {
    summary: result.summary,
    keyChanges,
    whoIsAffected: `Likely affects: ${affected}.`,
    whyItMatters: `${actTitle} was amended: ${result.addedLines} line(s) added, ${result.removedLines} line(s) removed.`,
    significance: clamp0to10(2 + changeCount * 0.5 + result.changedSections.length * 0.5),
    source: "heuristic",
    ...(fallbackReason ? { fallbackReason } : {}),
  };
}
