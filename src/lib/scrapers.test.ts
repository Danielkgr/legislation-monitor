import { afterEach, describe, expect, it, vi } from "vitest";
import { hashText, normalizeText, ScrapeError, scrapeAct } from "./scrapers";

describe("normalizeText", () => {
  it("preserves line/paragraph structure", () => {
    const input = "Section 5\nA person must act.\nSection 6\nAnother line.";
    expect(normalizeText(input)).toBe("Section 5\nA person must act.\nSection 6\nAnother line.");
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
    expect(normalizeText("   \nSection 5\n\nA person\n  ")).toBe("Section 5\nA person");
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
    expect(hashText("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  });

  it("differs for different inputs", () => {
    expect(hashText("abc")).not.toBe(hashText("abd"));
  });
});

/*
 * Synthetic fixtures written for these tests.  They imitate the shape of a
 * register page (a heading, page chrome, a content region) and are not
 * copies of real register pages or real legislation.
 */
const FEDERAL_FIXTURE = `
<html><body>
  <nav>Home / Browse</nav>
  <h1>Example Act 2026</h1>
  <div id="content">
    <h2>Part 1 - Preliminary</h2>
    <p>Last updated: 1 January 2026</p>
    <h4>Section 1 - Short title</h4>
    <p>This Act is the Example Act 2026.</p>
    <p>A widget<br>is a small device.</p>
  </div>
  <footer>Copyright 2026</footer>
</body></html>`;

const VIC_CHROME = "<nav>Victorian legislation navigation and site links</nav>".repeat(12);
const VIC_FIXTURE = `
<html><body>${VIC_CHROME}
  <h1>Example Services Act 2025</h1>
  <main>
    <h2>Part 1 - Preliminary</h2>
    <p>This is a synthetic test page.</p>
  </main>
</body></html>`;
const VIC_NOT_FOUND = `<html><body>${VIC_CHROME}<h1>We couldn't find that page</h1></body></html>`;

function mockFetch(pages: Record<string, { status?: number; body: string }>) {
  const fn = vi.fn(async (url: string | URL | Request) => {
    const page = pages[String(url)];
    if (!page) return new Response("Not found", { status: 404 });
    return new Response(page.body, { status: page.status ?? 200 });
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("scrapeAct (federal)", () => {
  it("extracts the title and line-structured text of the content region", async () => {
    mockFetch({ "https://legislation.example/act": { body: FEDERAL_FIXTURE } });

    const result = await scrapeAct("https://legislation.example/act", "federal");

    expect(result.title).toBe("Example Act 2026");
    expect(result.plainText).toBe(
      [
        "Part 1 - Preliminary",
        "Section 1 - Short title",
        "This Act is the Example Act 2026.",
        "A widget",
        "is a small device.",
      ].join("\n"),
    );
    expect(result.contentHash).toBe(hashText(result.plainText));
    expect(result.rawHtml).toContain("<h1>Example Act 2026</h1>");
  });

  it("fails without retrying when the register returns 404", async () => {
    const fetchMock = mockFetch({});
    await expect(scrapeAct("https://legislation.example/missing", "federal")).rejects.toThrow(
      "HTTP 404",
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("scrapeAct (Victoria)", () => {
  const url = "https://www.legislation.vic.gov.au/in-force/acts/example-services-act-2025";

  it("extracts the text of a real Act page", async () => {
    mockFetch({ [url]: { body: VIC_FIXTURE } });
    const result = await scrapeAct(url, "vic");
    expect(result.title).toBe("Example Services Act 2025");
    expect(result.plainText).toBe("Part 1 - Preliminary\nThis is a synthetic test page.");
  });

  it("fails the check instead of storing a placeholder when the page is missing", async () => {
    const fetchMock = mockFetch({ [url]: { body: VIC_NOT_FOUND } });

    const attempt = scrapeAct(url, "vic");
    await expect(attempt).rejects.toBeInstanceOf(ScrapeError);
    await expect(attempt).rejects.toThrow("Nothing was stored");
    // No fallback to the register's search page.
    expect(fetchMock.mock.calls.map(([u]) => String(u))).toEqual([url]);
  });
});
