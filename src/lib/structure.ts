/**
 * Structural analysis for Australian legislation HTML pages.
 *
 * Extracts a table-of-contents–style tree (Parts, Chapters, Divisions,
 * Sections) from heading elements and builds a flat index so that change
 * summaries can be scoped to the specific section that changed.
 *
 * Supports both federal (legislation.gov.au) and Victorian (legislation.vic.gov.au)
 * markup patterns which differ in CSS class names but share similar heading
 * text conventions.
 */

import * as cheerio from "cheerio";
import { diffArrays } from "diff";

/* ── Types ─────────────────────────────────────────────────────────────── */

export interface TocNode {
  type: PartType;
  title: string;
  /** The raw heading text (e.g. "Part 1 – Preliminary") */
  heading: string;
  /** Element id if available, otherwise null */
  elementId: string | null;
  level: number; // numeric depth (2 = h2, etc.)
  key: string; // normalised identifier (e.g. "p1", "s5")
  children: TocNode[];
}

type PartType = "part" | "chapter" | "division" | "section";

/** Parsed table-of-contents tree with convenience accessors */
export interface TableOfContents {
  root: TocNode[];
  /** All nodes flattened in document order */
  all: TocNode[];
  /** Index from section number (e.g. "5") → node, if present */
  sections: Map<string, TocNode>;
}

/* ── Regex helpers ─────────────────────────────────────────────────────── */

const PART_RE = /^part\s+(\d+)/i;
const CHAPTER_RE = /(?:chapter|chap\.?)[\s\u00b7]+(\d+)/i;
const DIVISION_RE = /(?:division|div\.?)[\s\u00b7]+(\d+[A-Z]?)/i;
const SECTION_RE = /section\s+(\d+)/i;

/* ── Public API ────────────────────────────────────────────────────────── */

/**
 * Parse a cheerio root (loaded from raw HTML) and return a TableOfContents.
 * Returns an empty TOC if no recognizable headings are found.
 */
export function parseTOC($: cheerio.CheerioAPI): TableOfContents {
  // Federal site uses classed headings; Victorian Tide uses heading text patterns.
  // Collect all potential section/part headings with their rank and content.
  const candidates: Array<{
    type: PartType;
    title: string;
    level: number;
    elementId: string | null;
    key: string;
  }> = [];

  // Priority order: check for class-based identification first, then fallback to text.
  // Federal (legislation.gov.au): h2.h-part, h3.h-chapter, h4.h-division, h5.h-section
  // Victorian Tide: heading content like "Part 1", "Section 5 - Definitions"

  const selectors = [
    // Federal class-based (most specific)
    "h2.part-heading, .part > h2",
    "h2.chapter-heading, .chapter > h2",
    "h3.division-heading, .division > h3",
    "h4.section-heading, .section > h4",
    // Generic heading elements that might contain structure info
    "h2, h3, h4, h5",
  ].join(",");

  const $heads = $(selectors).toArray();

  for (const el of $heads) {
    const $el = $(el);
    const text = $el.text().trim();
    if (!text || text.length < 3) continue;

    let node: (typeof candidates)[number] | undefined;

    // Try class-based first
    const cls = $el.attr("class") || "";
    if (/part/i.test(cls)) {
      const m = text.match(PART_RE);
      if (m)
        node = {
          type: "part",
          title: text,
          level: parseInt($el.prop("tagName")?.[1] ?? "2", 10),
          elementId: $el.attr("id") ?? null,
          key: `p${m[1]}`,
        };
    } else if (/chapter/i.test(cls)) {
      const m = text.match(CHAPTER_RE);
      if (m)
        node = {
          type: "chapter",
          title: text,
          level: parseInt($el.prop("tagName")?.[1] ?? "3", 10),
          elementId: $el.attr("id") ?? null,
          key: `c${m[1]}`,
        };
    } else if (/division/i.test(cls)) {
      const m = text.match(DIVISION_RE);
      if (m)
        node = {
          type: "division",
          title: text,
          level: parseInt($el.prop("tagName")?.[1] ?? "4", 10),
          elementId: $el.attr("id") ?? null,
          key: `d${m[1]}`,
        };
    } else if (/section/i.test(cls)) {
      const m = text.match(SECTION_RE);
      if (m)
        node = {
          type: "section",
          title: text,
          level: parseInt($el.prop("tagName")?.[1] ?? "5", 10),
          elementId: $el.attr("id") ?? null,
          key: `s${m[1]}`,
        };
    }

    // Fallback to text-based detection
    if (!node) {
      const pm = text.match(PART_RE);
      if (pm)
        node = {
          type: "part",
          title: text,
          level: parseInt($el.prop("tagName")?.[1] ?? "2", 10),
          elementId: $el.attr("id") ?? null,
          key: `p${pm[1]}`,
        };
    }
    if (!node) {
      const cm = text.match(CHAPTER_RE);
      if (cm)
        node = {
          type: "chapter",
          title: text,
          level: parseInt($el.prop("tagName")?.[1] ?? "3", 10),
          elementId: $el.attr("id") ?? null,
          key: `c${cm[1]}`,
        };
    }
    if (!node) {
      const dm = text.match(DIVISION_RE);
      if (dm)
        node = {
          type: "division",
          title: text,
          level: parseInt($el.prop("tagName")?.[1] ?? "4", 10),
          elementId: $el.attr("id") ?? null,
          key: `d${dm[1]}`,
        };
    }
    if (!node) {
      const sm = text.match(SECTION_RE);
      if (sm)
        node = {
          type: "section",
          title: text,
          level: parseInt($el.prop("tagName")?.[1] ?? "5", 10),
          elementId: $el.attr("id") ?? null,
          key: `s${sm[1]}`,
        };
    }

    if (node) candidates.push(node);
  }

  // Build hierarchical tree from flat list
  return indexTOC(buildTree(candidates));
}

/** Flatten a tree for lookup and index its sections by number. */
function indexTOC(root: TocNode[]): TableOfContents {
  const all: TocNode[] = [];
  flatten(root, all);
  const sections = new Map<string, TocNode>();
  for (const node of all) {
    if (node.type === "section") sections.set(node.key.replace(/^s/, ""), node);
  }
  return { root, all, sections };
}

interface FlatNode {
  type: PartType;
  title: string;
  level: number;
  elementId: string | null;
  key: string;
}

/**
 * Build a hierarchical tree from a flat list of TOC nodes ordered by
 * document appearance. Children are assigned based on nesting depth —
 * a node with deeper level becomes a child of its closest ancestor with
 * shallower level.
 */
function buildTree(flat: FlatNode[]): TocNode[] {
  const root: TocNode[] = [];
  const stack: Array<{ node: TocNode; level: number }> = [];

  for (const item of flat) {
    const node: TocNode = {
      type: item.type,
      title: item.title,
      heading: item.title,
      elementId: item.elementId,
      level: item.level,
      key: item.key,
      children: [],
    };

    // Pop stack until we find a parent with shallower or equal level
    while (stack.length > 0 && stack[stack.length - 1].level > node.level) {
      stack.pop();
    }

    if (stack.length === 0) {
      root.push(node);
    } else {
      stack[stack.length - 1].node.children.push(node);
    }

    stack.push({ node, level: item.level });
  }

  return root;
}

function flatten(nodes: TocNode[], out: TocNode[]): void {
  for (const n of nodes) {
    out.push(n);
    if (n.children.length > 0) flatten(n.children, out);
  }
}

/** Enriched section change with TOC metadata for structured storage */
export interface EnrichedSectionChange {
  sectionNumber: string | null;
  sectionTitle: string;
  changeType: "added" | "removed" | "modified";
  /** Titles from the top-level ancestor down to the node, e.g. "Part 1 > Section 5" */
  parentPath: string;
  /** Raw heading text that was matched */
  context: string;
}

/**
 * Given the TOC and the line arrays of two versions, return the TOC nodes the
 * change touched.  A heading found only in the new text is "added", only in
 * the old text "removed".  A heading found in both is "modified" when a
 * changed line falls inside its span, which runs to the next heading at the
 * same or a higher level, so a Part's span includes its sections.
 */
export function identifyAffectedSectionsEnriched(
  toc: TableOfContents,
  linesBefore: string[],
  linesAfter: string[],
): EnrichedSectionChange[] {
  const affected = new Map<string, EnrichedSectionChange>();
  const { added, removed } = computeChanges(linesBefore, linesAfter);

  // Where each heading sits in each version (-1 when absent).
  const before = toc.all.map((n) => findLineIndexByHeading(linesBefore, n.title));
  const after = toc.all.map((n) => findLineIndexByHeading(linesAfter, n.title));

  toc.all.forEach((node, i) => {
    let changeType: EnrichedSectionChange["changeType"] | null = null;
    if (after[i] >= 0 && before[i] < 0) {
      changeType = "added";
    } else if (before[i] >= 0 && after[i] < 0) {
      changeType = "removed";
    } else if (before[i] >= 0 && after[i] >= 0) {
      const endAfter = spanEnd(toc.all, after, i, linesAfter.length);
      const endBefore = spanEnd(toc.all, before, i, linesBefore.length);
      const touched =
        added.some((line) => line >= after[i] && line < endAfter) ||
        removed.some((line) => line >= before[i] && line < endBefore);
      if (touched) changeType = "modified";
    }
    if (!changeType) return;

    // Key by section number to avoid duplicates
    const num = node.type === "section" ? node.key.replace(/^s/, "") : null;
    const key = num ?? node.key;
    if (!affected.has(key)) {
      affected.set(key, {
        sectionNumber: num,
        sectionTitle: node.title,
        changeType,
        parentPath: getParentPath(toc, node),
        context: node.title,
      });
    }
  });

  return Array.from(affected.values());
}

/**
 * The line where a node's span ends: the next heading at the same or a
 * higher level, or the end of the text.
 */
function spanEnd(nodes: TocNode[], positions: number[], index: number, length: number): number {
  const start = positions[index];
  let end = length;
  nodes.forEach((other, k) => {
    const p = positions[k];
    if (p > start && p < end && other.level <= nodes[index].level) end = p;
  });
  return end;
}

/** Lower-case, collapse whitespace, drop soft hyphens and treat every dash as a hyphen. */
function normaliseHeading(text: string): string {
  return text
    .replace(/\u00ad/g, "")
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

const DESIGNATION_RE = /^(part|chapter|division|subdivision|section|schedule)\s+[0-9]+[a-z]*/;

/**
 * Index of the line that holds a heading, or -1.  A line matches when it is
 * the same heading after normalisation, or when it starts with the heading's
 * designation (such as "Part 1" or "Section 5A") followed by a word
 * boundary.  So "Part 1" never matches "Part 10", or a line that merely
 * contains the digit 1.
 */
export function findLineIndexByHeading(lines: string[], heading: string): number {
  const target = normaliseHeading(heading);
  if (!target) return -1;
  const normalised = lines.map(normaliseHeading);

  const exact = normalised.indexOf(target);
  if (exact >= 0) return exact;

  const designation = target.match(DESIGNATION_RE)?.[0];
  if (!designation) return -1;
  return normalised.findIndex(
    (line) => line.startsWith(designation) && !/[0-9a-z]/.test(line.charAt(designation.length)),
  );
}

/** Titles from the top-level ancestor down to the node, joined with " > ". */
function getParentPath(toc: TableOfContents, node: TocNode): string {
  const trail = findTrail(toc.root, node) ?? [node];
  return trail.map((n) => n.title).join(" > ");
}

function findTrail(nodes: TocNode[], target: TocNode): TocNode[] | null {
  for (const n of nodes) {
    if (n === target) return [n];
    const below = findTrail(n.children, target);
    if (below) return [n, ...below];
  }
  return null;
}

/**
 * Indices of added lines (in the new text) and removed lines (in the old
 * text), from a line diff.  A line that was edited counts as removed in the
 * old text and added in the new one.
 */
function computeChanges(before: string[], after: string[]): { added: number[]; removed: number[] } {
  const added: number[] = [];
  const removed: number[] = [];
  let b = 0;
  let a = 0;
  for (const part of diffArrays(before, after)) {
    const n = part.value.length;
    if (part.added) {
      for (let k = 0; k < n; k++) added.push(a++);
    } else if (part.removed) {
      for (let k = 0; k < n; k++) removed.push(b++);
    } else {
      a += n;
      b += n;
    }
  }
  return { added, removed };
}

/* ── Serialize for DB storage ─────────────────────────────────────────── */

/** Convert a TOC to JSON.  The tree holds every node, so only the root is stored. */
export function serializeTOC(toc: TableOfContents): string {
  return JSON.stringify({ root: toc.root });
}

/**
 * Rebuild a TableOfContents from stored JSON.  `all` and `sections` are
 * derived from the tree again, so their nodes are the tree's own nodes with
 * their children.  Older rows that also stored `all` load the same way.
 */
export function deserializeTOC(jsonStr: string): TableOfContents {
  const { root } = JSON.parse(jsonStr) as { root: TocNode[] };
  return indexTOC(root);
}

/* ── Raw HTML → serialized TOC ─────────────────────────────────────── */

/**
 * Load raw HTML, parse it with cheerio, and return a JSON-serialized TOC.
 * Returns null if no recognizable structure headings are found.
 */
export function serializeTOCFromHTML(html: string): string | null {
  const $ = cheerio.load(html);
  const toc = parseTOC($);
  if (toc.all.length === 0) return null;
  return serializeTOC(toc);
}
