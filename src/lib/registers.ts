/**
 * URL handling for the two registers.  Every watched URL is stored in the
 * form that always serves the latest version of the law, because a check
 * against one fixed compilation or version can never see a new one.
 *
 * Federal Register of Legislation: https://www.legislation.gov.au/<title ID>/latest/text
 * Victorian legislation:           https://www.legislation.vic.gov.au/in-force/acts/<act-slug>
 */

export type Jurisdiction = "federal" | "vic";

const FEDERAL_ORIGIN = "https://www.legislation.gov.au";
const VIC_ORIGIN = "https://www.legislation.vic.gov.au";

/** A title ID names a law, such as C2004A03712 for the Privacy Act 1988. */
export const TITLE_ID_RE = /^[CF]\d{4}[A-BD-Z]\d{5}$/i;
/** A compilation ID (C as the sixth character) names one fixed compilation, such as C2024C00026. */
export const COMPILATION_ID_RE = /^[CF]\d{4}C\d{5}$/i;

/** A URL the app cannot watch.  The message says what to use instead. */
export class UrlError extends Error {}

export function federalLatestUrl(titleId: string): string {
  return `${FEDERAL_ORIGIN}/${titleId.toUpperCase()}/latest/text`;
}

export function vicLatestUrl(slug: string): string {
  return `${VIC_ORIGIN}/in-force/acts/${slug.toLowerCase()}`;
}

const FEDERAL_HINT =
  "Use the Act's page on the Federal Register of Legislation, such as " +
  "https://www.legislation.gov.au/C2004A03712/latest/text";
const VIC_HINT =
  "Use the Act's in-force page on the Victorian register, such as " +
  "https://www.legislation.vic.gov.au/in-force/acts/crimes-act-1958";

function parse(raw: string, hint: string): URL {
  try {
    return new URL(raw.trim());
  } catch {
    throw new UrlError(`Not a valid URL.  ${hint}`);
  }
}

/**
 * Accepts any page of a title (latest, a point-in-time version, as made,
 * details or versions) and the register's legacy Details, Latest and Series
 * links.  A legacy link that names a compilation ID becomes /Latest/<ID>,
 * which the register redirects to the latest version of that title.
 */
export function normaliseFederalUrl(raw: string): string {
  const url = parse(raw, FEDERAL_HINT);
  if (!/^(www\.)?legislation\.gov\.au$/i.test(url.hostname)) {
    throw new UrlError("Federal Acts must be watched on www.legislation.gov.au.");
  }
  const [first, second] = url.pathname.split("/").filter(Boolean);
  if (first && TITLE_ID_RE.test(first)) return federalLatestUrl(first);
  if (first && second && /^(details|latest|series)$/i.test(first)) {
    if (TITLE_ID_RE.test(second)) return federalLatestUrl(second);
    if (COMPILATION_ID_RE.test(second)) return `${FEDERAL_ORIGIN}/Latest/${second.toUpperCase()}`;
  }
  throw new UrlError(FEDERAL_HINT);
}

/**
 * Accepts an in-force Act page with or without a version number, such as
 * /in-force/acts/crimes-act-1958/321, and the singular /in-force/act/ form.
 * Dropping the version number gives the latest version.
 */
export function normaliseVicUrl(raw: string): string {
  const url = parse(raw, VIC_HINT);
  if (!/^(www\.)?legislation\.vic\.gov\.au$/i.test(url.hostname)) {
    throw new UrlError("Victorian Acts must be watched on www.legislation.vic.gov.au.");
  }
  const match = url.pathname.match(/^\/in-force\/acts?\/([a-z0-9-]+)(?:\/\d{3}[a-z]?)?\/?$/i);
  if (!match) {
    throw new UrlError(VIC_HINT);
  }
  return vicLatestUrl(match[1]);
}

export function normaliseActUrl(raw: string, jurisdiction: Jurisdiction): string {
  return jurisdiction === "federal" ? normaliseFederalUrl(raw) : normaliseVicUrl(raw);
}
