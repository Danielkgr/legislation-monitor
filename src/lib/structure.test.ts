import { describe, it, expect } from "vitest";
import * as cheerio from "cheerio";
import {
  deserializeTOC,
  findLineIndexByHeading,
  identifyAffectedSectionsEnriched,
  parseTOC,
  serializeTOC,
} from "./structure";

/* ── parseTOC: federal-style markup ──────────────────────────────────── */

describe("parseTOC", () => {
  it("extracts parts and sections from federal-style headings", () => {
    const html = `
      <html><body>
        <h2 class="part-heading">Part 1 - Preliminary</h2>
        <h4 class="section-heading">Section 3 - Definitions</h4>
        <h4 class="section-heading">Section 5 - Scope</h4>
        <h2 class="part-heading">Part 2 - Administration</h2>
      </body></html>
    `;
    const $ = cheerio.load(html);
    const toc = parseTOC($);

    expect(toc.all).toHaveLength(4);
    expect(toc.root[0].type).toBe("part");
    expect(toc.root[0].title).toBe("Part 1 - Preliminary");
    expect(toc.sections.get("3")?.title).toBe("Section 3 - Definitions");
    expect(toc.sections.get("5")?.title).toBe("Section 5 - Scope");
  });

  it("extracts chapter hierarchy from Victorian Tide headings", () => {
    const html = `
      <html><body>
        <h2>Chapter 1 - General provisions</h2>
        <h3>Division 1 - Interpretation</h3>
        <h4>Section 5 - Definitions</h4>
        <h3>Division 2 - Offences</h3>
        <h4>Section 10 - Summary offence</h4>
      </body></html>
    `;
    const $ = cheerio.load(html);
    const toc = parseTOC($);

    expect(toc.all).toHaveLength(5);
    expect(toc.root[0].type).toBe("chapter");
    expect(toc.all.find((n) => n.type === "section")?.title).toBe("Section 5 - Definitions");
  });

  it("returns empty TOC for pages with no structure headings", () => {
    const $ = cheerio.load("<html><body><h1>Title</h1><p>Some text</p></body></html>");
    const toc = parseTOC($);
    expect(toc.root).toHaveLength(0);
    expect(toc.all).toHaveLength(0);
  });
});

/* ── buildTree / hierarchy ─────────────────────────────────────────── */

describe("heading hierarchy", () => {
  it("nests divisions under parts and sections under divisions by level depth", () => {
    const html = `
      <html><body>
        <h2>Part 1</h2>
        <h3>Division 1 - Preliminary</h3>
        <h4>Section 1 - Scope</h4>
        <h4>Section 2 - Application</h4>
        <h3>Division 2 - Offences</h3>
        <h4>Section 5 - Summary offence</h4>
      </body></html>
    `;
    const $ = cheerio.load(html);
    const toc = parseTOC($);

    expect(toc.root[0].children.length).toBeGreaterThan(0); // part has children (divisions)
    const divB = toc.all.find((n) => n.title === "Division 2 - Offences")!;
    expect(divB.children.some((c) => c.title === "Section 5 - Summary offence")).toBe(true);
  });
});

/* ── findLineIndexByHeading ─────────────────────────────────────────── */

describe("findLineIndexByHeading", () => {
  it("does not match a line just because it shares a word or digit with the heading", () => {
    const lines = ["Schedule 1 amendments", "Item 1 repeals section 3", "Part 1 - Preliminary"];
    expect(findLineIndexByHeading(lines, "Part 1 - Preliminary")).toBe(2);
  });

  it("does not match Part 10 when looking for Part 1", () => {
    const lines = ["Part 10 - Miscellaneous", "Part 1 Preliminary matters"];
    expect(findLineIndexByHeading(lines, "Part 1 - Preliminary")).toBe(1);
  });

  it("treats en and em dashes as hyphens and ignores case and spacing", () => {
    const lines = ["Contents", "PART 1 -  PRELIMINARY"];
    expect(findLineIndexByHeading(lines, "Part 1 \u2013 Preliminary")).toBe(1);
  });

  it("returns -1 when the heading is absent", () => {
    expect(
      findLineIndexByHeading(["Part 2 - Offences", "Section 10"], "Part 1 - Preliminary"),
    ).toBe(-1);
  });
});

/* ── identifyAffectedSectionsEnriched ────────────────────────────────── */

describe("identifyAffectedSectionsEnriched", () => {
  const tocHtml = `
    <html><body>
      <h2>Part 1 - Preliminary</h2>
      <h4>Section 5 - Definitions</h4>
      <h4>Section 6 - Application</h4>
    </body></html>
  `;
  const before = [
    "Part 1 - Preliminary",
    "Section 5 - Definitions",
    '"person" includes a body corporate.',
    "Section 6 - Application",
    "This Act applies in every State.",
  ];
  const after = [
    "Part 1 - Preliminary",
    "Section 5 - Definitions",
    '"person" includes an individual or body corporate.',
    "Section 6 - Application",
    "This Act applies in every State.",
  ];

  it("flags an edited section as modified, with its parent path, and leaves others alone", () => {
    const changes = identifyAffectedSectionsEnriched(
      parseTOC(cheerio.load(tocHtml)),
      before,
      after,
    );

    expect(changes).toContainEqual({
      sectionNumber: "5",
      sectionTitle: "Section 5 - Definitions",
      changeType: "modified",
      parentPath: "Part 1 - Preliminary > Section 5 - Definitions",
      context: "Section 5 - Definitions",
    });
    expect(changes.some((c) => c.sectionNumber === "6")).toBe(false);
  });

  it("works on a table of contents loaded back from storage", () => {
    const stored = serializeTOC(parseTOC(cheerio.load(tocHtml)));
    const changes = identifyAffectedSectionsEnriched(deserializeTOC(stored), before, after);
    expect(changes.find((c) => c.sectionNumber === "5")?.changeType).toBe("modified");
  });

  it("flags a heading found only in the new text as added", () => {
    const html =
      "<html><body><h2>Part 1 - Preliminary</h2><h4>Section 7 - Review</h4></body></html>";
    const changes = identifyAffectedSectionsEnriched(
      parseTOC(cheerio.load(html)),
      ["Part 1 - Preliminary", "Text."],
      ["Part 1 - Preliminary", "Text.", "Section 7 - Review", "The Minister must review this Act."],
    );
    expect(changes.find((c) => c.sectionNumber === "7")?.changeType).toBe("added");
  });

  it("returns an empty array when no lines changed", () => {
    const same = ["Part 1 - Preliminary", "Section 5 - Definitions"];
    const tocHtml = "<html><body><h2>Part 1</h2><h4>Section 5</h4></body></html>";
    const changes = identifyAffectedSectionsEnriched(parseTOC(cheerio.load(tocHtml)), same, same);
    expect(changes).toHaveLength(0);
  });
});

/* ── serialize / deserialize round-trip ─────────────────────────────── */

describe("TOC serialization", () => {
  it("round-trips a TOC through JSON and back", () => {
    const html = `
      <html><body>
        <h2>Part 1 - Preliminary</h2>
        <h4>Section 1 - Title</h4>
      </body></html>
    `;
    const toc = parseTOC(cheerio.load(html));
    const json = serializeTOC(toc);

    expect(() => JSON.parse(json)).not.toThrow(); // valid JSON at least

    // The flat list, the children and the section index survive the round trip.
    const restored = deserializeTOC(json);
    expect(restored.all).toHaveLength(toc.all.length);
    expect(restored.root[0].children[0]).toBe(restored.all[1]);
    expect(restored.sections.get("1")?.title).toBe("Section 1 - Title");
  });
});
