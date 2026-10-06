import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CheckResult } from "./check";
import { connectDB } from "./db";
import { checkAllActs, formatDigest, postDigest, webhookPayload } from "./digest";
import { useTestDatabase } from "./test-db";

function addAct(title: string, jurisdiction: "federal" | "vic"): number {
  return Number(
    connectDB()
      .prepare("INSERT INTO acts (title, url, jurisdiction) VALUES (?, ?, ?)")
      .run(title, `https://example.test/${title.replace(/\s+/g, "-")}`, jurisdiction)
      .lastInsertRowid,
  );
}

const result = (overrides: Partial<CheckResult>): CheckResult => ({
  success: true,
  hasChange: false,
  baseline: false,
  change: null,
  new_version_count: 1,
  ...overrides,
});

beforeEach(() => {
  useTestDatabase();
});

describe("checkAllActs", () => {
  it("checks every Act in turn and records each outcome, carrying on after a failure", async () => {
    const changed = addAct("Alpha Act 2026", "federal");
    const failed = addAct("Beta Act 2026", "vic");
    const baseline = addAct("Gamma Act 2026", "federal");
    addAct("Delta Act 2026", "vic");

    const check = vi.fn(async (id: number) => {
      if (id === changed) {
        return result({
          hasChange: true,
          change: {
            id: 1,
            summary: "Section 5 was amended.",
            sections_changed: [],
            affected_groups: [],
            change_count: 2,
            brief: {
              summary: "Section 5 was amended.",
              keyChanges: [],
              whoIsAffected: "",
              whyItMatters: "",
              significance: 2,
              source: "heuristic",
            },
            section_details: [],
          },
        });
      }
      if (id === failed) throw new Error("HTTP 503 from the register");
      if (id === baseline) return result({ baseline: true });
      return result({});
    });

    const outcomes = await checkAllActs(check);

    expect(check).toHaveBeenCalledTimes(4);
    expect(outcomes.map((o) => [o.act.title, o.status])).toEqual([
      ["Alpha Act 2026", "changed"],
      ["Beta Act 2026", "failed"],
      ["Delta Act 2026", "unchanged"],
      ["Gamma Act 2026", "baseline"],
    ]);
    expect(outcomes[0].summary).toBe("Section 5 was amended.");
    expect(outcomes[1].error).toBe("HTTP 503 from the register");
  });
});

describe("formatDigest", () => {
  it("leads with the counts, then lists changes and failures", () => {
    const digest = formatDigest(
      [
        {
          act: { id: 1, title: "Alpha Act 2026", jurisdiction: "federal" },
          status: "changed",
          summary: "Section 5 was amended.",
        },
        {
          act: { id: 2, title: "Beta Act 2026", jurisdiction: "vic" },
          status: "failed",
          error: "HTTP 503",
        },
        { act: { id: 3, title: "Delta Act 2026", jurisdiction: "vic" }, status: "unchanged" },
      ],
      new Date("2026-10-06T21:00:00Z"),
    );

    expect(digest).toBe(
      [
        "Legislation Monitor digest, 2026-10-06 21:00 UTC",
        "Checked 3 Acts: 1 changed, 1 unchanged, 0 baseline stored, 1 failed.",
        "",
        "Changed:",
        "- Alpha Act 2026 (Cth): Section 5 was amended.",
        "",
        "Failed:",
        "- Beta Act 2026 (Vic): HTTP 503",
        "",
        "Unchanged: Delta Act 2026 (Vic)",
      ].join("\n"),
    );
  });
});

describe("webhookPayload and postDigest", () => {
  it("sends Slack a text message", () => {
    expect(webhookPayload("Digest", "slack")).toEqual({ text: "Digest" });
  });

  it("sends Teams an Adaptive Card with one text block per paragraph", () => {
    const payload = webhookPayload("Line one\n\nLine two", "teams") as {
      type: string;
      attachments: { contentType: string; content: { type: string; body: unknown[] } }[];
    };
    expect(payload.type).toBe("message");
    expect(payload.attachments[0].contentType).toBe("application/vnd.microsoft.card.adaptive");
    expect(payload.attachments[0].content.type).toBe("AdaptiveCard");
    expect(payload.attachments[0].content.body).toEqual([
      { type: "TextBlock", text: "Line one", wrap: true },
      { type: "TextBlock", text: "Line two", wrap: true },
    ]);
  });

  it("posts JSON to the webhook and throws when it is refused", async () => {
    const ok = vi.fn(async () => new Response("ok", { status: 200 }));
    await postDigest("https://hooks.example/abc", "Digest", "slack", ok as unknown as typeof fetch);
    expect(ok).toHaveBeenCalledWith(
      "https://hooks.example/abc",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ text: "Digest" }) }),
    );

    const refused = vi.fn(async () => new Response("no", { status: 403 }));
    await expect(
      postDigest(
        "https://hooks.example/abc",
        "Digest",
        "slack",
        refused as unknown as typeof fetch,
      ),
    ).rejects.toThrow("HTTP 403");
  });
});
