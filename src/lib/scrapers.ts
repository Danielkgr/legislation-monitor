import * as cheerio from "cheerio";

interface ScraperResult {
  title: string;
  plainText: string;
  versionLabel: string | null;
  contentHash: string;
}

async function fetchWithRetry(url: string, retries = 2): Promise<string> {
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent":
            "LegislationMonitor/1.0 (+https://github.com/legislation-monitor)",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (err) {
      if (i === retries) throw err;
      await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
    }
  }
  throw new Error("Unreachable");
}

async function scrapeFederal(url: string): Promise<ScraperResult> {
  const html = await fetchWithRetry(url);
  const $ = cheerio.load(html);

  // Extract title from page
  const title =
    $("h1").first().text().trim() ||
    ($("#page-title, .title").first().text().trim()) ||
    "Federal Act";

  // Try to get the main content area
  let plainText =
    $("#content, #main-content, .legislation-content, main")
      .first()
      .text()
      .replace(/\s+/g, " ")
      .trim();

  if (!plainText || plainText.length < 50) {
    // Fallback: get all text from body
    plainText = $("body").text().replace(/\s+/g, " ").trim();
  }

  // Try to extract version label from URL or page metadata
  const urlParts = url.split("/");
  const versionLabel = extractVersionLabel(url, urlParts);

  return {
    title: title || "Federal Act",
    plainText,
    versionLabel,
    contentHash: simpleHash(plainText),
  };
}

async function scrapeVictorian(url: string): Promise<ScraperResult> {
  const html = await fetchWithRetry(url);
  const $ = cheerio.load(html);

  // Extract title
  let title =
    $("h1").first().text().trim() ||
    ($(".page-title, h1.title").first().text().trim()) ||
    "Victorian Act";

  // Get main content
  let plainText =
    $("#content, #main-content, .legislation, main, .article-content")
      .first()
      .text()
      .replace(/\s+/g, " ")
      .trim();

  if (!plainText || plainText.length < 50) {
    plainText = $("body").text().replace(/\s+/g, " ").trim();
  }

  const urlParts = url.split("/");
  const versionLabel = extractVersionLabel(url, urlParts);

  return {
    title: title || "Victorian Act",
    plainText,
    versionLabel,
    contentHash: simpleHash(plainText),
  };
}

function extractVersionLabel(url: string, parts: string[]): string | null {
  // Try to find a version identifier in the URL
  const match = url.match(/(C\d{4}[A-Z]\d+|20\d{2})/);
  return match ? match[1] : null;
}

function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return Math.abs(hash).toString(36);
}

export async function scrapeAct(url: string, jurisdiction: "federal" | "vic"): Promise<ScraperResult> {
  if (jurisdiction === "federal") {
    return scrapeFederal(url);
  }
  return scrapeVictorian(url);
}
