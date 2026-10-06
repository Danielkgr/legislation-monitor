import Anthropic from "@anthropic-ai/sdk";
import { BRIEF_JSON_SCHEMA, BRIEF_SYSTEM_PROMPT, type BriefContent, validateBrief } from "./brief";

/**
 * Claude provider for change briefs, through the official Anthropic SDK.
 * Selected by the provider switch in llm.ts.  It asks for the brief through
 * structured outputs, so the reply is JSON that matches BRIEF_JSON_SCHEMA,
 * and it validates the result before use.  Any failure comes back as a
 * reason, which the caller records on the heuristic brief it writes instead.
 */

export const CLAUDE_MODELS = ["claude-opus-5-5", "claude-sonnet-5-5"] as const;
export const DEFAULT_CLAUDE_MODEL = "claude-opus-5-5";

export const CLAUDE_EFFORTS = ["low", "medium", "high"] as const;
export type ClaudeEffort = (typeof CLAUDE_EFFORTS)[number];
/** A brief is short and structured, so low effort keeps cost and latency down. */
export const DEFAULT_CLAUDE_EFFORT: ClaudeEffort = "low";

/**
 * Thinking counts toward max_tokens on these models, so leave room for it as
 * well as the short JSON reply.  16,000 stays within a non-streaming call.
 */
const MAX_TOKENS = 16_000;
const TIMEOUT_MS = 120_000;

export interface ClaudeBriefOptions {
  apiKey: string;
  model?: string;
  effort?: ClaudeEffort;
  /** Tests pass a mock; production uses the global fetch. */
  fetch?: typeof fetch;
  /** The SDK retries 408, 409, 429 and 5xx twice by default. */
  maxRetries?: number;
}

export type ClaudeBriefResult =
  | { ok: true; brief: BriefContent; model: string }
  | { ok: false; reason: string };

export async function requestClaudeBrief(
  userPrompt: string,
  options: ClaudeBriefOptions,
): Promise<ClaudeBriefResult> {
  const client = new Anthropic({
    apiKey: options.apiKey,
    timeout: TIMEOUT_MS,
    ...(options.fetch ? { fetch: options.fetch } : {}),
    ...(options.maxRetries !== undefined ? { maxRetries: options.maxRetries } : {}),
  });

  let response: Anthropic.Beta.BetaMessage;
  try {
    response = await client.beta.messages.create({
      model: options.model || DEFAULT_CLAUDE_MODEL,
      max_tokens: MAX_TOKENS,
      // No temperature, top_p, top_k or thinking: these models reject sampling
      // parameters and always think adaptively.  Effort sets the depth.
      output_config: {
        effort: options.effort ?? DEFAULT_CLAUDE_EFFORT,
        format: { type: "json_schema", schema: BRIEF_JSON_SCHEMA },
      },
      // Server-side fallback: if Claude's safeguards decline the request, the
      // API re-runs it on the model Anthropic recommends for that refusal
      // category, inside this call.  A brief is a product path, so a brief
      // from the fallback model is better than none, and response.model
      // records which model wrote it.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      // The system prompt is too short to reach the minimum cacheable prefix,
      // so it carries no cache_control.
      system: BRIEF_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
    });
  } catch (err) {
    return { ok: false, reason: describeError(err) };
  }

  // Check why the model stopped before reading any content.
  if (response.stop_reason === "refusal") {
    const category =
      response.stop_details?.type === "refusal" ? response.stop_details.category : null;
    return {
      ok: false,
      reason: `Claude declined to write this brief${category ? ` (${category})` : ""}`,
    };
  }
  if (response.stop_reason === "max_tokens") {
    return {
      ok: false,
      reason: "Claude's reply reached the token limit before the brief was complete",
    };
  }
  if (response.stop_reason !== "end_turn") {
    return {
      ok: false,
      reason: `Claude stopped early (${response.stop_reason ?? "no stop reason"})`,
    };
  }

  const text = response.content
    .filter((block): block is Anthropic.Beta.BetaTextBlock => block.type === "text")
    .map((block) => block.text)
    .join("");
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, reason: "Claude's reply was not valid JSON" };
  }
  const brief = validateBrief(parsed);
  if (!brief) return { ok: false, reason: "Claude's reply did not match the brief schema" };
  return { ok: true, brief, model: response.model };
}

/** Most specific first: the status classes, then timeouts, then other connection errors. */
function describeError(err: unknown): string {
  if (err instanceof Anthropic.AuthenticationError) {
    return "the Claude API rejected the API key (HTTP 401)";
  }
  if (err instanceof Anthropic.PermissionDeniedError) {
    return "the API key may not use this model (HTTP 403)";
  }
  if (err instanceof Anthropic.NotFoundError) {
    return "the Claude API did not find the model (HTTP 404); check the model name";
  }
  if (err instanceof Anthropic.RateLimitError) {
    return "the Claude API rate limit was still hit after retries (HTTP 429)";
  }
  if (err instanceof Anthropic.BadRequestError) {
    return `the Claude API rejected the request (HTTP 400): ${err.message}`;
  }
  if (err instanceof Anthropic.InternalServerError) {
    return `the Claude API failed after retries (HTTP ${err.status})`;
  }
  if (err instanceof Anthropic.APIConnectionTimeoutError) {
    return "the Claude API request timed out";
  }
  if (err instanceof Anthropic.APIConnectionError) {
    return "could not connect to the Claude API";
  }
  if (err instanceof Anthropic.APIError) {
    return `the Claude API returned an error (HTTP ${err.status})`;
  }
  return `the Claude request failed: ${err instanceof Error ? err.message : String(err)}`;
}
