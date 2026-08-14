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
  // Victorian legislation uses the Tide framework which requires JS rendering.
  // Try the given URL, then fall back to common patterns.
  let html: string;

  // Pattern 1: Direct URL (e.g., /in-force/act/crimes-act-1958)
  try {
    html = await fetchWithRetry(url);
    const $ = cheerio.load(html);
    const title = $("h1").first().text().trim() || "Victorian Act";
    if ($("body").text().length > 500 && !$("body").text().includes("We couldn't find that page")) {
      // Successfully fetched a real act page
      let plainText = $("#content, #main-content, .legislation, main")
        .first()
        .text()
        .replace(/\s+/g, " ")
        .trim();
      if (!plainText || plainText.length < 50) {
        plainText = $("body").text().replace(/\s+/g, " ").trim();
      }
      const versionLabel = extractVersionLabel(url);
      return { title, plainText, versionLabel, contentHash: simpleHash(plainText) };
    }
  } catch { /* fall through */ }

  // Pattern 2: /in-force/acts/:slug (listing page fallback)
  const listingUrl = url.replace(/\/in-force\/act\//, "/in-force/acts/");
  try {
    html = await fetchWithRetry(listingUrl);
    const $ = cheerio.load(html);
    let title = $("h1").first().text().trim() || "Victorian Act";
    if (!title) {
      // Try to find act name from search results or listings
      title = extractTitleFromTideListings(html);
    }
    let plainText = $("#content, #main-content, .tide-table, main")
      .first()
      .text()
      .replace(/\s+/g, " ")
      .trim();
    if (!plainText || plainText.length < 50) {
      plainText = $("body").text().replace(/\s+/g, " ").trim();
    }
    const versionLabel = extractVersionLabel(url);
    return { title, plainText, versionLabel, contentHash: simpleHash(plainText) };
  } catch { /* fall through */ }

  // Pattern 3: Use Tide search to find the act
  const actName = url.split("/").pop() || "Victorian Act";
  const searchUrl = `https://www.legislation.vic.gov.au/search?q=${encodeURIComponent(actName)}`;
  try {
    html = await fetchWithRetry(searchUrl);
    const $ = cheerio.load(html);
    let title = $("h1").first().text().trim() || actName;
    // Tide search results are client-rendered, so we get the page template
    let plainText = $("#content, #main-content, .tide-search-listing, main")
      .first()
      .text()
      .replace(/\s+/g, " ")
      .trim();
    if (!plainText || plainText.length < 50) {
      plainText = $("body").text().replace(/\s+/g, " ").trim();
    }
    const versionLabel = extractVersionLabel(url);
    return { title, plainText, versionLabel, contentHash: simpleHash(plainText) };
  } catch {
    // Last resort: use URL basename as the title and return empty content
    const parts = url.split("/");
    const slug = parts[parts.length - 1] || "Victorian Act";
    const title = slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    return { title, plainText: `Victorian legislation page (${title}) — requires JavaScript rendering on www.legislation.vic.gov.au`, versionLabel: null, contentHash: simpleHash(title) };
  }
}

function extractTitleFromTideListings(html: string): string {
  // Tide renders act names in data attributes or link text
  const match = html.match(/<a[^>]*href="[^"]*\/act\/([^"]+)"[^>]*>([^<]+)<\/a>/);
  if (match) return match[2].trim();
  return "Victorian Act";
}

function extractVersionLabel(url: string): string | null {
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
