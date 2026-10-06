import { beforeEach, describe, expect, it } from "vitest";
import { listChanges } from "./changes";
import { ActNotFoundError, checkAct, type Scraper } from "./check";
import { connectDB, getPendingChanges } from "./db";
import { hashText } from "./scrapers";
import { useTestDatabase } from "./test-db";

// Synthetic fixture text, not real legislation.
const V1 = ["Part 1 - Preliminary", "Section 5 - Definitions", "A widget is a small device."].join(
  "\n",
);
const V2 = [
  "Part 1 - Preliminary",
  "Section 5 - Definitions",
  "A widget is a small or medium device sold to consumers.",
].join("\n");

/** A scraper that returns fixed text, as a register page would. */
function serve(text: string, rawHtml?: string): Scraper {
  return async () => ({
    title: "Example Act 2026",
    plainText: text,
    versionLabel: null,
    contentHash: hashText(text),
    rawHtml,
  });
}

function addAct(): number {
  return Number(
    connectDB()
      .prepare("INSERT INTO acts (title, url, jurisdiction) VALUES (?, ?, ?)")
      .run("Example Act 2026", "https://example.test/act", "federal").lastInsertRowid,
  );
}

beforeEach(() => {
  for (const key of ["LLM_ENABLED", "LLM_API_BASE", "LLM_MODEL", "LLM_API_KEY"]) {
    delete process.env[key];
  }
  useTestDatabase();
});

describe("checkAct", () => {
  it("stores a baseline on the first check without reporting a change", async () => {
    const actId = addAct();
    const result = await checkAct(actId, serve(V1));
    expect(result).toMatchObject({ hasChange: false, baseline: true, change: null });
    expect(result.new_version_count).toBe(1);
    expect(listChanges(actId)).toHaveLength(0);
    expect(getPendingChanges()).toBe(0);
  });

  it("stores nothing new when the text is unchanged", async () => {
    const actId = addAct();
    await checkAct(actId, serve(V1));
    const result = await checkAct(actId, serve(V1));
    expect(result).toMatchObject({ hasChange: false, baseline: false, new_version_count: 1 });
  });

  it("records a change with a heuristic brief when the text differs", async () => {
    const actId = addAct();
    await checkAct(actId, serve(V1));
    const result = await checkAct(actId, serve(V2));

    expect(result.hasChange).toBe(true);
    expect(result.new_version_count).toBe(2);
    expect(result.change?.brief.source).toBe("heuristic");
    expect(result.change?.change_count).toBe(2);
    const [stored] = listChanges(actId);
    expect(stored.id).toBe(result.change?.id);
    expect(stored.summary).toBe(result.change?.summary);
    expect(getPendingChanges()).toBe(1);
  });

  it("compares with the latest version, so a reverted text is a change", async () => {
    const actId = addAct();
    await checkAct(actId, serve(V1));
    await checkAct(actId, serve(V2));
    const result = await checkAct(actId, serve(V1));
    expect(result.hasChange).toBe(true);
    expect(listChanges(actId)).toHaveLength(2);
    expect(getPendingChanges()).toBe(2);
  });

  it("throws ActNotFoundError for an unknown Act", async () => {
    await expect(checkAct(999, serve(V1))).rejects.toBeInstanceOf(ActNotFoundError);
  });
});
