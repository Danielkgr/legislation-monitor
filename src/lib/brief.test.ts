import { describe, expect, it } from "vitest";
import { buildDiffPayload, heuristicBrief, parseBrief, validateBrief } from "./brief";
import type { DiffResult } from "./diff";

const GOOD = {
  summary: "Section 5 now covers medium devices.",
  keyChanges: ["Widget definition widened"],
  whoIsAffected: "Sellers of widgets.",
  whyItMatters: "More products fall within the Act.",
  significance: 4,
};

describe("parseBrief", () => {
  it("parses a bare JSON object", () => {
    expect(parseBrief(JSON.stringify(GOOD))).toEqual(GOOD);
  });

  it("parses JSON inside a code fence with surrounding prose", () => {
    const raw = `Here is the brief:\n\`\`\`json\n${JSON.stringify(GOOD, null, 2)}\n\`\`\`\nDone.`;
    expect(parseBrief(raw)).toEqual(GOOD);
  });

  it("coerces loose types and clamps significance to 0-10", () => {
    const raw = JSON.stringify({ ...GOOD, keyChanges: ["a", 7, ""], significance: "12.6" });
    expect(parseBrief(raw)).toMatchObject({ keyChanges: ["a", "7"], significance: 10 });
  });

  it.each(["no json here", "{not json}", JSON.stringify({ ...GOOD, summary: "  " })])(
    "returns null for %s",
    (raw) => {
      expect(parseBrief(raw)).toBeNull();
    },
  );
});

describe("validateBrief", () => {
  it("accepts a well-formed brief", () => {
    expect(validateBrief(GOOD)).toEqual(GOOD);
  });

  it("rejects a brief with a missing or mistyped field instead of coercing it", () => {
    expect(validateBrief({ ...GOOD, whyItMatters: undefined })).toBeNull();
    expect(validateBrief({ ...GOOD, significance: "4" })).toBeNull();
    expect(validateBrief({ ...GOOD, keyChanges: [1] })).toBeNull();
    expect(validateBrief(null)).toBeNull();
  });

  it("clamps significance into 0-10", () => {
    expect(validateBrief({ ...GOOD, significance: -3 })?.significance).toBe(0);
  });
});

describe("heuristicBrief", () => {
  const diff: DiffResult = {
    addedLines: 2,
    removedLines: 1,
    changedSections: ["Section 5", 'Added: "medium devices"'],
    affectedGroups: ["Consumers"],
    summary: "The Example Act 2026 has been amended (2 lines added, 1 line removed)",
  };

  it("is labelled heuristic and carries no reason when no model was configured", () => {
    const brief = heuristicBrief(diff, "Example Act 2026");
    expect(brief).toMatchObject({
      source: "heuristic",
      summary: diff.summary,
      keyChanges: diff.changedSections,
      whoIsAffected: "Likely affects: Consumers.",
    });
    expect(brief).not.toHaveProperty("fallbackReason");
    expect(brief).not.toHaveProperty("model");
  });

  it("records why it stood in for a configured model", () => {
    const brief = heuristicBrief(diff, "Example Act 2026", "Claude declined to write this brief");
    expect(brief.source).toBe("heuristic");
    expect(brief.fallbackReason).toBe("Claude declined to write this brief");
  });
});

describe("buildDiffPayload", () => {
  it("bounds the diff sent to a model", () => {
    const oldText = Array.from({ length: 2000 }, (_, i) => `old line ${i}`).join("\n");
    const newText = Array.from({ length: 2000 }, (_, i) => `new line ${i}`).join("\n");
    const payload = buildDiffPayload(oldText, newText, 1000);
    expect(payload.length).toBeLessThanOrEqual(1000 + "\n... [diff truncated]".length);
    expect(payload.endsWith("[diff truncated]")).toBe(true);
  });
});
