import { describe, expect, it, vi } from "vitest";
import { BRIEF_JSON_SCHEMA } from "./brief";
import { requestClaudeBrief } from "./llm-anthropic";

const BRIEF = {
  summary: "Section 5 now covers medium devices.",
  keyChanges: ["Widget definition widened"],
  whoIsAffected: "Sellers of widgets.",
  whyItMatters: "More products fall within the Act.",
  significance: 4,
};

/** A Messages API response body, as the API would send it. */
function message(overrides: Record<string, unknown> = {}) {
  return {
    id: "msg_test",
    type: "message",
    role: "assistant",
    model: "claude-opus-5-5",
    content: [{ type: "text", text: JSON.stringify(BRIEF) }],
    stop_reason: "end_turn",
    stop_sequence: null,
    stop_details: null,
    usage: { input_tokens: 812, output_tokens: 164 },
    ...overrides,
  };
}

/** A mock fetch that records each request and answers with the given body and status. */
function mockApi(body: unknown, status = 200) {
  const calls: { url: string; headers: Headers; body: Record<string, unknown> }[] = [];
  const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({
      url: String(url),
      headers: new Headers(init?.headers),
      body: JSON.parse(String(init?.body)),
    });
    return new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json", "request-id": "req_test" },
    });
  });
  return { fetch: fetchMock as unknown as typeof fetch, calls };
}

const run = (api: ReturnType<typeof mockApi>, extra: Record<string, unknown> = {}) =>
  requestClaudeBrief("Act: Example Act 2026\n\nUnified diff: ...", {
    apiKey: "test-key",
    fetch: api.fetch,
    maxRetries: 0,
    ...extra,
  });

describe("requestClaudeBrief", () => {
  it("returns the validated brief and the model that wrote it", async () => {
    const api = mockApi(message());
    expect(await run(api)).toEqual({ ok: true, brief: BRIEF, model: "claude-opus-5-5" });
  });

  it("sends a structured-output request with explicit effort and server-side fallbacks", async () => {
    const api = mockApi(message());
    await run(api, { effort: "medium" });

    expect(api.calls).toHaveLength(1);
    const { url, headers, body } = api.calls[0];
    expect(url).toContain("/v1/messages");
    expect(headers.get("x-api-key")).toBe("test-key");
    expect(headers.get("anthropic-beta")).toContain("server-side-fallback-2026-07-01");
    expect(body).toMatchObject({
      model: "claude-opus-5-5",
      max_tokens: 16000,
      fallbacks: "default",
      output_config: {
        effort: "medium",
        format: { type: "json_schema", schema: BRIEF_JSON_SCHEMA },
      },
    });
    // Opus 5.5 and Sonnet 5.5 reject sampling parameters, and thinking is adaptive.
    for (const key of ["temperature", "top_p", "top_k", "thinking"]) {
      expect(body).not.toHaveProperty(key);
    }
    expect(body.messages).toEqual([
      { role: "user", content: "Act: Example Act 2026\n\nUnified diff: ..." },
    ]);
  });

  it("defaults to claude-opus-5-5 at low effort", async () => {
    const api = mockApi(message());
    await run(api);
    expect(api.calls[0].body).toMatchObject({
      model: "claude-opus-5-5",
      output_config: { effort: "low" },
    });
  });

  it("records a fallback model that served the request", async () => {
    const api = mockApi(message({ model: "claude-opus-5" }));
    expect(await run(api)).toMatchObject({ ok: true, model: "claude-opus-5" });
  });

  it("reports a refusal, with its category, instead of reading the content", async () => {
    const api = mockApi(
      message({
        content: [],
        stop_reason: "refusal",
        stop_details: { type: "refusal", category: "cyber", explanation: null },
      }),
    );
    expect(await run(api)).toEqual({
      ok: false,
      reason: "Claude declined to write this brief (cyber)",
    });
  });

  it("reports a reply cut off at max_tokens", async () => {
    const api = mockApi(
      message({ stop_reason: "max_tokens", content: [{ type: "text", text: '{"summary": "Sec' }] }),
    );
    expect(await run(api)).toMatchObject({
      ok: false,
      reason: expect.stringMatching(/token limit/),
    });
  });

  it("rejects a reply that does not match the brief schema", async () => {
    const api = mockApi(
      message({ content: [{ type: "text", text: JSON.stringify({ summary: "Only a summary" }) }] }),
    );
    expect(await run(api)).toMatchObject({ ok: false, reason: expect.stringMatching(/schema/) });
  });

  it("rejects a reply that is not JSON", async () => {
    const api = mockApi(message({ content: [{ type: "text", text: "Not JSON" }] }));
    expect(await run(api)).toMatchObject({
      ok: false,
      reason: expect.stringMatching(/not valid JSON/),
    });
  });

  it.each([
    [401, "authentication_error", /API key \(HTTP 401\)/],
    [404, "not_found_error", /model \(HTTP 404\)/],
    [429, "rate_limit_error", /rate limit/],
    [529, "overloaded_error", /HTTP 529/],
  ])("turns HTTP %i into a reason", async (status, type, reason) => {
    const api = mockApi({ type: "error", error: { type, message: "test error" } }, status);
    expect(await run(api)).toMatchObject({ ok: false, reason: expect.stringMatching(reason) });
  });
});
