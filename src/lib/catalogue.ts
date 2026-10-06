import { federalLatestUrl, type Jurisdiction, vicLatestUrl } from "./registers";

export interface KnownAct {
  title: string;
  jurisdiction: Jurisdiction;
  url: string;
}

/**
 * Acts seeded on first run and offered as quick-add presets.  Each title ID
 * and Victorian page name was checked against the register before it was
 * added here.
 */
export const KNOWN_ACTS: readonly KnownAct[] = [
  { title: "Privacy Act 1988", jurisdiction: "federal", url: federalLatestUrl("C2004A03712") },
  { title: "Corporations Act 2001", jurisdiction: "federal", url: federalLatestUrl("C2004A00818") },
  { title: "Fair Work Act 2009", jurisdiction: "federal", url: federalLatestUrl("C2009A00028") },
  {
    title: "Work Health and Safety Act 2011",
    jurisdiction: "federal",
    url: federalLatestUrl("C2011A00137"),
  },
  { title: "Crimes Act 1958", jurisdiction: "vic", url: vicLatestUrl("crimes-act-1958") },
  { title: "Wrongs Act 1958", jurisdiction: "vic", url: vicLatestUrl("wrongs-act-1958") },
  {
    title: "Charter of Human Rights and Responsibilities Act 2006",
    jurisdiction: "vic",
    url: vicLatestUrl("charter-human-rights-and-responsibilities-act-2006"),
  },
];

/**
 * Seed URLs from earlier releases, which pinned fixed compilations.  The
 * migration in db.ts moves rows that still carry them to the title's latest
 * version.  Matched on URL and title together.
 */
export const LEGACY_SEED_URLS: Readonly<Record<string, { title: string; url: string }>> = {
  "https://www.legislation.gov.au/Details/C2024C00026": {
    title: "Privacy Act 1988",
    url: federalLatestUrl("C2004A03712"),
  },
  "https://www.legislation.gov.au/Details/C2024C00001": {
    title: "Corporations Act 2001",
    url: federalLatestUrl("C2004A00818"),
  },
  "https://www.legislation.gov.au/Details/C2024C00070": {
    title: "Work Health and Safety Act 2011",
    url: federalLatestUrl("C2011A00137"),
  },
};
