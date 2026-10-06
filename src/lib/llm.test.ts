import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DiffResult } from "./diff";
import { generateChangeBrief } from "./llm";
import { useTestDatabase } from "./test-db";

const HEURISTIC: DiffResult = {
  addedLines: 1,
  removedLines: 1,
  changedSections: ["Section 5"],
  affectedGroups: ["Consumers"],
  summary: "The Example Act 2026 has been amended (1 line added, 1 line removed)",
};
const PARAMS = {
  actTitle: "Example Act 2026",
  oldText: "Section 5\nOld text.",
  newText: "Section 5\nNew text.",
  heuristic: HEURISTIC,
};
const MODEL_BRIEF = {
  summary: "Section 5 was reworded.",
  keyChanges: ["Section 5 text replaced"],
  whoIsAffected: "Consumers.",
  whyItMatters: "Minor drafting change.",
  significance: 2,
};

function chatResponse(content: string, status = 200) {
  return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status });
}

beforeEach(() => {
  for (const key of [
    "LLM_PROVIDER",
    "LLM_ENABLED",
    "LLM_API_BASE",
    "LLM_API_KEY",
    "LLM_MODEL",
    "ANTHROPIC_API_KEY",
    "ANTHROPIC_MODEL",
    "ANTHROPIC_EFFORT",
  ]) {
    delete process.env[key];
  }
  useTestDatabase();
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("generateChangeBrief", () => {
  it("uses the heuristic, with no fallback reason, when no model is configured", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const brief = await generateChangeBrief(PARAMS);

    expect(brief.source).toBe("heuristic");
    expect(brief.fallbackReason).toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  describe("with an OpenAI-compatible endpoint", () => {
    beforeEach(() => {
      process.env.LLM_API_BASE = "http://localhost:11434/v1";
      process.env.LLM_MODEL = "llama3.1";
    });

    it("labels a model-written brief as llm and records the model", async () => {
      const fetchMock = vi.fn(async () => chatResponse(JSON.stringify(MODEL_BRIEF)));
      vi.stubGlobal("fetch", fetchMock);

      const brief = await generateChangeBrief(PARAMS);

      expect(brief).toEqual({ ...MODEL_BRIEF, source: "llm", model: "llama3.1" });
      expect(fetchMock).toHaveBeenCalledWith(
        "http://localhost:11434/v1/chat/completions",
        expect.objectContaining({ method: "POST" }),
      );
    });

    it("falls back to the heuristic and says why when the endpoint fails", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => chatResponse("overloaded", 503)),
      );

      const brief = await generateChangeBrief(PARAMS);

      expect(brief.source).toBe("heuristic");
      expect(brief.fallbackReason).toMatch(/HTTP 503/);
    });

    it("falls back to the heuristic when the reply holds no brief", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => chatResponse("I cannot help with that.")),
      );

      const brief = await generateChangeBrief(PARAMS);

      expect(brief.source).toBe("heuristic");
      expect(brief.fallbackReason).toMatch(/no parseable brief/);
    });
  });
});
