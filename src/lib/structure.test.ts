import { describe, it, expect } from "vitest";
import * as cheerio from "cheerio";
import { parseTOC, serializeTOC, deserializeTOC, identifyAffectedSections, identifyAffectedSectionsEnriched } from "./structure";

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

/* ── identifyAffectedSections ────────────────────────────────────────── */

describe("identifyAffectedSections", () => {
  it("flags sections whose surrounding lines changed", () => {
    const before = [
      "Part 1 - Preliminary",
      "Section 5 - Definitions",
      "The definitions in this section are:",
      '"person" includes a body corporate.',
    ];
    const after = [
      "Part 1 - Preliminary",
      "Section 5 - Definitions",
      "The definitions in this section are:",
      '"person" includes an individual or body corporate.',
      '"corporation" means a registered company.', // new line, won't match anything in before
    ];

    // Build a minimal TOC with Section 5 present
    const tocHtml = `
      <html><body>
        <h2>Part 1 - Preliminary</h2>
        <h4>Section 5 - Definitions</h4>
      </body></html>
    `;
    const toc = parseTOC(cheerio.load(tocHtml));

    const changes = identifyAffectedSections(toc, before, after);
    expect(changes.some((c) => c.sectionTitle.includes("Section 5"))).toBe(true);
  });

  it("returns empty array when no lines changed", () => {
    const same = ["Part 1", "Section 5 - Definitions", "Text here."];
    const tocHtml = "<html><body><h2>Part 1</h2><h4>Section 5</h4></body></html>";
    const changes = identifyAffectedSections(parseTOC(cheerio.load(tocHtml)), same, same);
    expect(changes).toHaveLength(0);
  });
});

/* ── identifyAffectedSectionsEnriched ────────────────────────────────── */

describe("identifyAffectedSectionsEnriched", () => {
  it("returns enriched records with section numbers and parent paths", () => {
    const before = [
      "Part 1 - Preliminary",
      "Section 5 - Definitions",
      'The definitions in this section are:',
      '"person" includes a body corporate.',
    ];
    const after = [
      "Part 1 - Preliminary",
      "Section 5 - Definitions",
      'The definitions in this section are:',
      '"person" includes an individual or body corporate.',
      '"corporation" means a registered company.',
    ];

    const tocHtml = `
      <html><body>
        <h2>Part 1 - Preliminary</h2>
        <h4>Section 5 - Definitions</h4>
      </body></html>
    `;
    const toc = parseTOC(cheerio.load(tocHtml));

    const changes = identifyAffectedSectionsEnriched(toc, before, after);
    
    // Should have detected a change to section 5
    expect(changes.length).toBeGreaterThan(0);
    
    // Verify enriched fields are present
    const sectionChange = changes.find(c => c.sectionNumber === "5");
    if (sectionChange) {
      expect(sectionChange.sectionTitle).toBe("Section 5 - Definitions");
      expect(typeof sectionChange.parentPath).toBe("string");
      expect(["added", "removed", "modified"]).toContain(sectionChange.changeType);
    }
  });

  it("returns empty array when no TOC changes detected", () => {
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

    // Verify sections still accessible after round-trip
    const restored = deserializeTOC(json);
    expect(restored.all).toHaveLength(toc.all.length);
  });
});
