import { describe, it, expect } from "vitest";
import { analyzeChanges } from "./diff";

const OLD = "Section 5\nA person must not do something.\nSection 6\nSomething else.";
const NEW =
  "Section 5\nA person must not do something, or disclose it.\nSection 6\nSomething else.\nSection 7\nBrand new section.";

describe("analyzeChanges", () => {
  it("detects added and removed lines for line-structured text", () => {
    const result = analyzeChanges(OLD, NEW, "Test Act");
    expect(result.addedLines).toBeGreaterThan(0);
    expect(result.removedLines).toBeGreaterThan(0);
  });

  it("reports zero changes when the text is identical", () => {
    const result = analyzeChanges(OLD, OLD, "Test Act");
    expect(result.addedLines).toBe(0);
    expect(result.removedLines).toBe(0);
  });

  it("produces a non-empty summary", () => {
    const result = analyzeChanges(OLD, NEW, "Test Act");
    expect(typeof result.summary).toBe("string");
    expect(result.summary.length).toBeGreaterThan(0);
  });

  it("returns arrays for changed sections and affected groups", () => {
    const result = analyzeChanges(OLD, NEW, "Test Act");
    expect(Array.isArray(result.changedSections)).toBe(true);
    expect(Array.isArray(result.affectedGroups)).toBe(true);
  });
});
