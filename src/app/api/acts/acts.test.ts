import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useTestDatabase } from "@/lib/test-db";
import { POST } from "./route";

const add = (body: Record<string, unknown>) =>
  POST(
    new Request("http://localhost/api/acts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }) as never,
  );

beforeEach(() => {
  useTestDatabase();
  // The registers are not reachable in tests, so the baseline scrape fails
  // and the Act is still added, as it would be during an outage.
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("Not found", { status: 404 })),
  );
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("POST /api/acts", () => {
  it("stores the latest-version URL for a pinned federal compilation link", async () => {
    const res = await add({
      title: "Privacy Act 1988",
      url: "https://www.legislation.gov.au/C2004A03712/2024-01-01/text",
    });
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({
      jurisdiction: "federal",
      url: "https://www.legislation.gov.au/C2004A03712/latest/text",
    });
  });

  it("treats two links to the same Act as a duplicate", async () => {
    await add({
      title: "Crimes Act 1958",
      url: "https://www.legislation.vic.gov.au/in-force/acts/crimes-act-1958",
      jurisdiction: "vic",
    });
    const res = await add({
      title: "Crimes Act 1958",
      url: "https://www.legislation.vic.gov.au/in-force/acts/crimes-act-1958/321",
      jurisdiction: "vic",
    });
    expect(res.status).toBe(409);
  });

  it("rejects a URL the scrapers cannot watch with a 400 that says what to use", async () => {
    const res = await add({
      title: "Crimes Act 1958",
      url: "https://www.legislation.vic.gov.uk/html/in-force/act/100/1958/amends",
      jurisdiction: "vic",
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/legislation\.vic\.gov\.au/);
  });
});
