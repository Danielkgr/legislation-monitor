import { beforeEach, describe, expect, it } from "vitest";
import { listChanges } from "./changes";
import { connectDB, getPendingChanges } from "./db";
import { seedDemo } from "./demo";
import { useTestDatabase } from "./test-db";

beforeEach(() => {
  for (const key of [
    "LLM_PROVIDER",
    "LLM_ENABLED",
    "LLM_API_BASE",
    "LLM_MODEL",
    "ANTHROPIC_API_KEY",
  ]) {
    delete process.env[key];
  }
  useTestDatabase();
});

describe("seedDemo", () => {
  it("records one change to the fictional Example Act through the real pipeline", async () => {
    const realFetch = globalThis.fetch;
    const { exampleActId, changeId } = await seedDemo();

    expect(globalThis.fetch).toBe(realFetch);
    const titles = connectDB()
      .prepare<[], { title: string }>("SELECT title FROM acts ORDER BY id")
      .all()
      .map((a) => a.title);
    expect(titles.every((t) => t.endsWith("(demo fixture)"))).toBe(true);

    const [change] = listChanges(exampleActId);
    expect(change.id).toBe(changeId);
    expect(change.brief?.source).toBe("heuristic");
    expect(change.from_label).toBe("Compilation No. 1");
    expect(change.to_label).toBe("Compilation No. 2");
    expect(change.section_details).toContainEqual(
      expect.objectContaining({ sectionNumber: "5", changeType: "modified" }),
    );
    expect(change.section_details).toContainEqual(
      expect.objectContaining({ sectionNumber: "7", changeType: "added" }),
    );
    expect(getPendingChanges()).toBe(1);
  });
});
