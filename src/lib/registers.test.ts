import { describe, expect, it } from "vitest";
import { KNOWN_ACTS } from "./catalogue";
import { normaliseActUrl, normaliseFederalUrl, normaliseVicUrl, UrlError } from "./registers";

const PRIVACY_LATEST = "https://www.legislation.gov.au/C2004A03712/latest/text";

describe("normaliseFederalUrl", () => {
  it.each([
    ["https://www.legislation.gov.au/C2004A03712/latest/text", PRIVACY_LATEST],
    ["https://www.legislation.gov.au/C2004A03712/2024-01-01/text", PRIVACY_LATEST],
    ["https://legislation.gov.au/C2004A03712/asmade/text", PRIVACY_LATEST],
    ["https://www.legislation.gov.au/c2004a03712/latest/versions", PRIVACY_LATEST],
    ["https://www.legislation.gov.au/C2004A03712", PRIVACY_LATEST],
    ["https://www.legislation.gov.au/Details/C2004A03712", PRIVACY_LATEST],
    ["https://www.legislation.gov.au/Series/C2004A03712", PRIVACY_LATEST],
    ["https://www.legislation.gov.au/Latest/C2004A03712", PRIVACY_LATEST],
  ])("watches the latest compilation for %s", (input, expected) => {
    expect(normaliseFederalUrl(input)).toBe(expected);
  });

  it("turns a legacy link to one fixed compilation into the register's Latest link", () => {
    expect(normaliseFederalUrl("https://www.legislation.gov.au/Details/C2024C00026")).toBe(
      "https://www.legislation.gov.au/Latest/C2024C00026",
    );
  });

  it.each([
    "https://www.legislation.vic.gov.au/in-force/acts/crimes-act-1958",
    "https://www.legislation.gov.au/help-and-resources",
    "not a url",
  ])("rejects %s with a message saying what to use", (input) => {
    expect(() => normaliseFederalUrl(input)).toThrow(UrlError);
    expect(() => normaliseFederalUrl(input)).toThrow(/legislation\.gov\.au/);
  });
});

describe("normaliseVicUrl", () => {
  const CRIMES_LATEST = "https://www.legislation.vic.gov.au/in-force/acts/crimes-act-1958";

  it.each([
    [CRIMES_LATEST, CRIMES_LATEST],
    [`${CRIMES_LATEST}/321`, CRIMES_LATEST],
    [`${CRIMES_LATEST}/279B/`, CRIMES_LATEST],
    ["https://legislation.vic.gov.au/in-force/act/crimes-act-1958", CRIMES_LATEST],
  ])("watches the latest version for %s", (input, expected) => {
    expect(normaliseVicUrl(input)).toBe(expected);
  });

  it.each([
    // The misspelt host and URL shape of the old quick-add presets.
    "https://www.legislation.vic.gov.uk/html/in-force/act/100/1958/amends",
    "https://www.legislation.vic.gov.au/html/in-force/act/324/2008/amends",
    "https://www.legislation.vic.gov.au/as-made/acts/crimes-act-1958",
  ])("rejects %s", (input) => {
    expect(() => normaliseVicUrl(input)).toThrow(UrlError);
  });
});

describe("KNOWN_ACTS", () => {
  it("stores every seeded and preset Act in its normalised latest-version form", () => {
    for (const act of KNOWN_ACTS) {
      expect(normaliseActUrl(act.url, act.jurisdiction)).toBe(act.url);
    }
  });
});
