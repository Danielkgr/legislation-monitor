import { describe, it, expect } from "vitest";
import { normalizeText, hashText } from "./scrapers";

describe("normalizeText", () => {
  it("preserves line/paragraph structure", () => {
    const input = "Section 5\nA person must act.\nSection 6\nAnother line.";
    expect(normalizeText(input)).toBe(
      "Section 5\nA person must act.\nSection 6\nAnother line."
    );
  });

  it("collapses internal whitespace runs to single spaces", () => {
    expect(normalizeText("Section   5 \t\t A person")).toBe("Section 5 A person");
  });

  it("removes volatile chrome lines (timestamps, breadcrumbs, print links)", () => {
    const input = [
      "Last updated: 1 Jan 2026",
      "Section 5",
      "A person must act.",
      "You are here: Home > Privacy Act",
      "Print this page",
    ].join("\n");
    expect(normalizeText(input)).toBe("Section 5\nA person must act.");
  });

  it("removes empty lines and trims the result", () => {
    expect(normalizeText("   \nSection 5\n\nA person\n  ")).toBe(
      "Section 5\nA person"
    );
  });

  it("normalizes unicode whitespace and strips soft hyphens", () => {
    // \u00a0 = no-break space, \u00ad = soft hyphen
    expect(normalizeText("Sec\u00adtion\u00a05")).toBe("Section 5");
  });
});

describe("hashText", () => {
  it("is deterministic", () => {
    expect(hashText("the act text")).toBe(hashText("the act text"));
  });

  it("returns a 64-char lowercase hex SHA-256 digest", () => {
    const h = hashText("hello");
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });

  it("matches the known SHA-256 of the empty string", () => {
    expect(hashText("")).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
    );
  });

  it("differs for different inputs", () => {
    expect(hashText("abc")).not.toBe(hashText("abd"));
  });
});
