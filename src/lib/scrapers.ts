import * as cheerio from "cheerio";
import { createHash } from "crypto";
import { COMPILATION_ID_RE, TITLE_ID_RE } from "./registers";

/**
 * Version facts read from a register page when it shows them.  Every field
 * is optional because the patterns below may find nothing.
 */
export interface VersionMetadata {
  /** Federal title ID, from the URL the register finally served. */
  titleId?: string;
  /** Federal compilation register ID, such as C2024C00225. */
  compilationId?: string;
  /** Federal compilation number, such as "131". */
  compilationNumber?: string;
  /** Federal compilation date as printed on the page, such as "12 June 2024". */
  compilationDate?: string;
  /** Victorian version number, such as "321" or "279B". */
  versionNumber?: string;
  /** The URL the register finally served, after redirects. */
  resolvedUrl?: string;
}

export interface ScraperResult {
  title: string;
  plainText: string;
  versionLabel: string | null;
  contentHash: string;
  /** Raw HTML for downstream TOC parsing / structural analysis */
  rawHtml?: string;
  metadata?: VersionMetadata;
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

/** The page body and the URL the server finally answered from. */
interface FetchedPage {
  html: string;
  finalUrl: string;
}

async function fetchWithRetry(url: string, retries = 2): Promise<FetchedPage> {
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
      return { html: await res.text(), finalUrl: res.url || url };
    } catch (err) {
      if (i === retries || (err as { final?: boolean }).final) throw err;
      await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
    }
  }
  throw new Error("Unreachable");
}

async function scrapeFederal(url: string): Promise<ScraperResult> {
  const { html, finalUrl } = await fetchWithRetry(url);
  const $ = cheerio.load(html);

  const title =
    $("h1").first().text().trim() ||
    $("#page-title, .title").first().text().trim() ||
    "Federal Act";

  const content = extractStructuredText($, "#content, #main-content, .legislation-content, main");
  const plainText = content.length >= 50 ? content : extractStructuredText($, "body");
  // Read metadata from block-structured text so adjacent blocks do not run together.
  const metadata = extractFederalMetadata(extractStructuredText($, "body"), finalUrl);

  return {
    title,
    plainText,
    versionLabel: federalVersionLabel(metadata),
    contentHash: hashText(plainText),
    rawHtml: html,
    metadata,
  };
}

/**
 * Read compilation facts from the page text.  The patterns follow how the
 * register prints them ("C2024C00225 (C131)", "Compilation No. 131",
 * "Compilation date: 12 June 2024"); they are tested on synthetic fixtures
 * and return nothing when the page does not show them.
 */
export function extractFederalMetadata(pageText: string, finalUrl: string): VersionMetadata {
  const metadata: VersionMetadata = { resolvedUrl: finalUrl };
  const firstSegment = safePath(finalUrl).split("/").filter(Boolean)[0];
  if (firstSegment && TITLE_ID_RE.test(firstSegment)) metadata.titleId = firstSegment.toUpperCase();

  const idWithNumber = pageText.match(/\b([CF]\d{4}C\d{5})\s*\(C(\d+)\)/);
  const id = idWithNumber?.[1] ?? pageText.match(/\b([CF]\d{4}C\d{5})\b/)?.[1];
  if (id && COMPILATION_ID_RE.test(id)) metadata.compilationId = id;
  const number = idWithNumber?.[2] ?? pageText.match(/Compilation No\.?\s*(\d+)/i)?.[1];
  if (number) metadata.compilationNumber = number;
  const date = pageText.match(/Compilation date:?\s*(\d{1,2}\s+[A-Z][a-z]+\s+\d{4})/)?.[1];
  if (date) metadata.compilationDate = date;
  return metadata;
}

function federalVersionLabel(m: VersionMetadata): string | null {
  if (m.compilationNumber && m.compilationId) {
    return `Compilation No. ${m.compilationNumber} (${m.compilationId})`;
  }
  if (m.compilationNumber) return `Compilation No. ${m.compilationNumber}`;
  return m.compilationId ?? null;
}

/**
 * The Victorian version number, from the URL the register served (such as
 * /in-force/acts/crimes-act-1958/321) or from "Authorised Version No. 321"
 * in the page text.
 */
export function extractVicMetadata(pageText: string, finalUrl: string): VersionMetadata {
  const metadata: VersionMetadata = { resolvedUrl: finalUrl };
  const fromUrl = safePath(finalUrl).match(/\/in-force\/acts\/[a-z0-9-]+\/(\d{3}[A-Z]?)\/?$/i)?.[1];
  const fromText = pageText.match(/Authorised Version No\.?\s*(\d{3}[A-Z]?)\b/i)?.[1];
  const version = fromUrl ?? fromText;
  if (version) metadata.versionNumber = version.toUpperCase();
  return metadata;
}

function safePath(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return "";
  }
}

async function scrapeVictorian(url: string): Promise<ScraperResult> {
  // The register runs on the Tide framework.  Accept the page only when it
  // is a real Act page.  There is no placeholder and no search-page
  // fallback: storing either as the Act's text would turn an outage into a
  // recorded amendment.
  let page: FetchedPage;
  try {
    page = await fetchWithRetry(url);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new ScrapeError(
      `Could not read the Victorian register page: ${reason}.  Nothing was stored.`,
    );
  }
  const { html, finalUrl } = page;
  const $ = cheerio.load(html);
  const bodyText = $("body").text();
  if (bodyText.length < 500 || /we couldn't find that page/i.test(bodyText)) {
    throw new ScrapeError(
      `The Victorian register page for ${url} is not an Act page.  Nothing was stored.`,
    );
  }

  const title =
    $("h1").first().text().trim() || extractTitleFromTideListings(html) || "Victorian Act";
  const plainText = extractStructuredText($, "#content, #main-content, .legislation, main");
  const metadata = extractVicMetadata(extractStructuredText($, "body"), finalUrl);
  return {
    title,
    plainText,
    versionLabel: metadata.versionNumber ? `Version ${metadata.versionNumber}` : null,
    contentHash: hashText(plainText),
    rawHtml: html,
    metadata,
  };
}

function extractTitleFromTideListings(html: string): string {
  // Tide renders act names in data attributes or link text
  const match = html.match(/<a[^>]*href="[^"]*\/act\/([^"]+)"[^>]*>([^<]+)<\/a>/);
  if (match) return match[2].trim();
  return "Victorian Act";
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
