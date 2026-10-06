import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it } from "vitest";
import { seedActWithChange, useTestDatabase } from "@/lib/test-db";
import { GET as exportChanges } from "./[actId]/export/route";
import { GET as listChanges } from "./[actId]/route";

const params = (actId: number | string) => ({ params: Promise.resolve({ actId: String(actId) }) });

beforeEach(() => {
  useTestDatabase();
});

describe("GET /api/changes/:actId", () => {
  it("returns 200 with the recorded change and its parsed JSON fields", async () => {
    const seeded = seedActWithChange();

    const res = await listChanges(new Request("http://localhost"), params(seeded.actId));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0]).toMatchObject({
      id: seeded.changeId,
      act_id: seeded.actId,
      act_title: "Example Act 2026",
      version_from_id: seeded.fromId,
      version_to_id: seeded.toId,
      from_label: "Compilation No. 1",
      to_label: "Compilation No. 2",
      summary: "Section 5 now says new text.",
      sections_changed: ["Section 5", 'Added: "New text."'],
      affected_groups: ["General Public"],
      change_count: 2,
      brief: seeded.brief,
      section_details: [],
    });
  });

  it("returns an empty list for an Act with no changes", async () => {
    const res = await listChanges(new Request("http://localhost"), params(999));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });
});

describe("GET /api/changes/:actId/export", () => {
  it("exports the change as JSON by default", async () => {
    const seeded = seedActWithChange();

    const res = await exportChanges(
      new NextRequest(`http://localhost/api/changes/${seeded.actId}/export`),
      params(seeded.actId),
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/json");
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0]).toMatchObject({
      id: seeded.changeId,
      jurisdiction: "federal",
      sections_changed: ["Section 5", 'Added: "New text."'],
      brief: seeded.brief,
    });
  });

  it("exports a Markdown report with ?format=md", async () => {
    const seeded = seedActWithChange();

    const res = await exportChanges(
      new NextRequest(`http://localhost/api/changes/${seeded.actId}/export?format=md`),
      params(seeded.actId),
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/markdown");
    const text = await res.text();
    expect(text).toContain("# Change Report: Example Act 2026");
    expect(text).toContain("Changes detected: 1");
    expect(text).toContain("- Section 5 text replaced");
  });

  it("returns 404 for an unknown Act", async () => {
    const res = await exportChanges(
      new NextRequest("http://localhost/api/changes/999/export"),
      params(999),
    );
    expect(res.status).toBe(404);
  });
});
