import * as cheerio from "cheerio";
import { createHash } from "crypto";

export interface ScraperResult {
  title: string;
  plainText: string;
  versionLabel: string | null;
  contentHash: string;
  /** Raw HTML for downstream TOC parsing / structural analysis */
  rawHtml?: string;
}

type Cheerio = ReturnType<typeof cheerio.load>;

/**
 * True for lines that carry no legislative substance but change between page
 * renders (timestamps, breadcrumbs, print links). Stripping them keeps content
 * hashes stable across cosmetic site updates so we only flag real amendments.
 *
 * The rules are deliberately conservative (anchored, specific prefixes) to
 * avoid ever dropping genuine legislative text.
 */
function isVolatileLine(line: string): boolean {
  const t = line.trim();
  if (!t) return true;
  return (
    /^last (updated|modified|amended|review)(:?.*)?$/i.test(t) ||
    /^(you are here|print this page|skip to (main )?content)/i.test(t) ||
    /^home\s*\/.*$/i.test(t) ||
    /^copyright \d{4}/i.test(t)
  );
}

/**
 * Deterministically normalize raw page text into a stable, line-oriented form
 * suitable for hashing and line-level diffing.
 *
 *  - Unicode whitespace variants -> single space
 *  - Per-line: collapse whitespace runs, trim
 *  - Drop empty lines and known volatile chrome lines
 *
 * Line/paragraph boundaries are preserved (unlike the old single-line
 * collapse), which is what makes the diff viewer meaningful.
 */
export function normalizeText(raw: string): string {
  return raw
    .replace(/[\u00a0\u2007\u202f\u2009\u200b]/g, " ")
    .replace(/\u00ad/g, "")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => !isVolatileLine(line))
    .join("\n")
    .trim();
}

/**
 * Extract text from a DOM region while preserving block boundaries. We append
 * a newline after each block-level element (and turn <br> into newlines) before
 * flattening, so each heading/paragraph/list item lands on its own line.
 */
function extractStructuredText($: Cheerio, selector: string): string {
  const $root = $(selector).clone();
  $root.find("br").replaceWith("\n");
  $root
    .find(
      "h1,h2,h3,h4,h5,h6,p,li,dt,dd,div,section,article,table,thead,tbody,tr,blockquote,pre,figure",
    )
    .each((_, el) => {
      $(el).append("\n");
    });
  return normalizeText($root.text());
}

/**
 * SHA-256 hex digest. Replaces the previous 32-bit integer hash, which had a
 * collision-prone small space. Hashing the normalized text (not raw HTML)
 * makes detection robust to cosmetic markup changes.
 */
export function hashText(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/** A fetch or extraction failure.  The check reports it and stores nothing. */
export class ScrapeError extends Error {}

/** HTTP statuses worth retrying.  Other 4xx responses fail at once. */
function isRetryable(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

async function fetchWithRetry(url: string, retries = 2): Promise<string> {
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent":
            "LegislationMonitor/1.0 (+https://github.com/Danielkgr/legislation-monitor)",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) {
        const err = new ScrapeError(`HTTP ${res.status} from ${url}`);
        if (!isRetryable(res.status)) throw Object.assign(err, { final: true });
        throw err;
      }
      return await res.text();
    } catch (err) {
      if (i === retries || (err as { final?: boolean }).final) throw err;
      await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
    }
  }
  throw new Error("Unreachable");
}

async function scrapeFederal(url: string): Promise<ScraperResult> {
  const html = await fetchWithRetry(url);
  const $ = cheerio.load(html);

  const title =
    $("h1").first().text().trim() ||
    $("#page-title, .title").first().text().trim() ||
    "Federal Act";

  const content = extractStructuredText($, "#content, #main-content, .legislation-content, main");
  const plainText = content.length >= 50 ? content : extractStructuredText($, "body");

  return {
    title,
    plainText,
    versionLabel: extractVersionLabel(url),
    contentHash: hashText(plainText),
    rawHtml: html,
  };
}

async function scrapeVictorian(url: string): Promise<ScraperResult> {
  // Victorian legislation uses the Tide framework which can be client-rendered.
  // Try progressively more generic resolution patterns until we get a real page.
  const candidates: string[] = [url];
  if (/\/in-force\/act\//.test(url)) {
    candidates.push(url.replace(/\/in-force\/act\//, "/in-force/acts/"));
  }

  let lastError: unknown = null;
  for (const candidate of candidates) {
    let html: string;
    try {
      html = await fetchWithRetry(candidate);
    } catch (err) {
      lastError = err;
      continue;
    }
    const $ = cheerio.load(html);
    const bodyText = $("body").text();
    if (bodyText.length < 500 || /we couldn't find that page/i.test(bodyText)) {
      lastError = new ScrapeError(`${candidate} is not an Act page`);
      continue;
    }
    const title =
      $("h1").first().text().trim() || extractTitleFromTideListings(html) || "Victorian Act";
    const plainText = extractStructuredText($, "#content, #main-content, .legislation, main");
    return {
      title,
      plainText,
      versionLabel: extractVersionLabel(url),
      contentHash: hashText(plainText),
      rawHtml: html,
    };
  }

  // No placeholder and no search-page fallback: storing either as the Act's
  // text would turn an outage into a recorded amendment.
  const reason = lastError instanceof Error ? lastError.message : "no candidate page loaded";
  throw new ScrapeError(
    `Could not read the Victorian register page for ${url} (${reason}).  Nothing was stored.`,
  );
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

export async function scrapeAct(
  url: string,
  jurisdiction: "federal" | "vic",
): Promise<ScraperResult> {
  if (jurisdiction === "federal") {
    return scrapeFederal(url);
  }
  return scrapeVictorian(url);
}
