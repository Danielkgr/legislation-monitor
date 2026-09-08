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

/* ── Types ─────────────────────────────────────────────────────────────── */

export interface TocNode {
  type: PartType;
  title: string;
  /** The raw heading text (e.g. "Part 1 – Preliminary") */
  heading: string;
  /** Element id if available, otherwise null */
  elementId: string | null;
  level: number; // numeric depth (2 = h2, etc.)
  key: string;   // normalised identifier (e.g. "p1", "s5")
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
    'h2.part-heading, .part > h2',
    'h2.chapter-heading, .chapter > h2',
    'h3.division-heading, .division > h3',
    'h4.section-heading, .section > h4',
    // Generic heading elements that might contain structure info
    'h2, h3, h4, h5',
  ].join(',');

  const $heads = $(selectors).toArray();

  for (const el of $heads) {
    const $el = $(el);
    const text = $el.text().trim();
    if (!text || text.length < 3) continue;

    let node: typeof candidates[number] | undefined;

    // Try class-based first
    const cls = $el.attr('class') || '';
    if (/part/i.test(cls)) {
      const m = text.match(PART_RE);
      if (m) node = { type: 'part', title: text, level: parseInt($el.prop('tagName')?.[1] ?? '2', 10), elementId: $el.attr('id') ?? null, key: `p${m[1]}` };
    } else if (/chapter/i.test(cls)) {
      const m = text.match(CHAPTER_RE);
      if (m) node = { type: 'chapter', title: text, level: parseInt($el.prop('tagName')?.[1] ?? '3', 10), elementId: $el.attr('id') ?? null, key: `c${m[1]}` };
    } else if (/division/i.test(cls)) {
      const m = text.match(DIVISION_RE);
      if (m) node = { type: 'division', title: text, level: parseInt($el.prop('tagName')?.[1] ?? '4', 10), elementId: $el.attr('id') ?? null, key: `d${m[1]}` };
    } else if (/section/i.test(cls)) {
      const m = text.match(SECTION_RE);
      if (m) node = { type: 'section', title: text, level: parseInt($el.prop('tagName')?.[1] ?? '5', 10), elementId: $el.attr('id') ?? null, key: `s${m[1]}` };
    }

    // Fallback to text-based detection
    if (!node) {
      const pm = text.match(PART_RE);
      if (pm) node = { type: 'part', title: text, level: parseInt($el.prop('tagName')?.[1] ?? '2', 10), elementId: $el.attr('id') ?? null, key: `p${pm[1]}` };
    }
    if (!node) {
      const cm = text.match(CHAPTER_RE);
      if (cm) node = { type: 'chapter', title: text, level: parseInt($el.prop('tagName')?.[1] ?? '3', 10), elementId: $el.attr('id') ?? null, key: `c${cm[1]}` };
    }
    if (!node) {
      const dm = text.match(DIVISION_RE);
      if (dm) node = { type: 'division', title: text, level: parseInt($el.prop('tagName')?.[1] ?? '4', 10), elementId: $el.attr('id') ?? null, key: `d${dm[1]}` };
    }
    if (!node) {
      const sm = text.match(SECTION_RE);
      if (sm) node = { type: 'section', title: text, level: parseInt($el.prop('tagName')?.[1] ?? '5', 10), elementId: $el.attr('id') ?? null, key: `s${sm[1]}` };
    }

    if (node) candidates.push(node);
  }

  // Build hierarchical tree from flat list
  const root = buildTree(candidates);

  // Flatten for easy lookup
  const all: TocNode[] = [];
  flatten(root, all);

  // Index sections by their number
  const sections = new Map<string, TocNode>();
  for (const node of all) {
    if (node.type === 'section') {
      const num = node.key.replace(/^s/, '');
      sections.set(num, node);
    }
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
    const node: TocNode = { type: item.type, title: item.title, heading: item.title, elementId: item.elementId, level: item.level, key: item.key, children: [] };

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

/** Info about a section whose content changed */
export interface SectionChange {
  sectionTitle: string;
  changeType: 'added' | 'removed' | 'modified';
  context: string;
}

/** Enriched section change with TOC metadata for structured storage */
export interface EnrichedSectionChange {
  sectionNumber: string | null;
  sectionTitle: string;
  changeType: 'added' | 'removed' | 'modified';
  /** e.g. "Part 1 > Division 2" */
  parentPath: string;
  /** Raw heading text that was matched */
  context: string;
}

/**
 * Given the TOC and changed line arrays, return enriched section-change records
 * with section numbers and parent breadcrumbs suitable for structured storage.
 */
export function identifyAffectedSectionsEnriched(
  toc: TableOfContents,
  linesBefore: string[],
  linesAfter: string[]
): EnrichedSectionChange[] {
  const affected = new Map<string, EnrichedSectionChange>();

  // Compute which line indices actually changed
  const { added, removed } = computeChanges(linesBefore, linesAfter);
  const allChanged = new Set<number>([...added, ...removed]);

  // Track which TOC nodes are relevant by checking for changed lines in proximity
  for (const tocNode of toc.all) {
    const closestBefore = findLineIndexByHeading(linesBefore, tocNode.title);
    const closestAfter = findLineIndexByHeading(linesAfter, tocNode.title);

    // Determine if the section itself was added/removed by checking presence
    let isAdded = false;
    let isRemoved = false;
    let isModified = false;

    if (closestAfter >= 0 && closestBefore < 0) {
      // Heading exists only in after → new section entirely
      isAdded = true;
    } else if (closestBefore >= 0 && closestAfter < 0) {
      // Heading existed only in before → removed section
      isRemoved = true;
    } else if (closestBefore >= 0 && closestAfter >= 0) {
      // Heading exists in both — flag as modified only if changed lines are nearby
      const proximityWindow = Math.min(50, linesAfter.length);
      const idx = closestAfter;
      for (let j = Math.max(0, idx - 3); j <= Math.min(linesAfter.length - 1, idx + proximityWindow); j++) {
        if (allChanged.has(j)) {
          isModified = true;
          break;
        }
      }
    }

    if (isAdded || isRemoved || isModified) {
      // Get parent path from TOC hierarchy
      const parentPath = getParentPath(toc, tocNode);
      const changeType = isAdded ? 'added' as const : isRemoved ? 'removed' as const : 'modified' as const;

      // Key by section number to avoid duplicates
      const num = tocNode.type === 'section' ? tocNode.key.replace(/^s/, '') : null;
      const key = num || tocNode.key;

      if (!affected.has(key)) {
        affected.set(key, {
          sectionNumber: num,
          sectionTitle: tocNode.title,
          changeType,
          parentPath,
          context: tocNode.title,
        });
      }
    }
  }

  return Array.from(affected.values());
}

function findLineIndexByHeading(lines: string[], heading: string): number {
  const keyWords = heading.split(/\s+/).slice(0, 3); // First 3 words as search key
  for (let i = 0; i < lines.length; i++) {
    const lineNorm = lines[i].replace(/\s+/g, ' ').trim().toLowerCase();
    if (keyWords.some((w) => lineNorm.includes(w.toLowerCase()))) return i;
  }
  return -1;
}

function getParentPath(toc: TableOfContents, node: TocNode): string {
  // Walk up the hierarchy to build parent path using recursive descent
  function findParent(
    path: string[],
    current: TocNode,
    candidate: TocNode
  ): string[] {
    for (let i = 0; i < candidate.children.length; i++) {
      const child = candidate.children[i];
      if (child === current) {
        return [...path, candidate.title];
      }
      const result = findParent([...path, candidate.title], current, child);
      if (result.length > 0) return result;
    }
    return [];
  }

  // Try to find parent from root level
  for (const root of toc.root) {
    if (root === node) return root.title; // Root itself is top-level
    const ancestors = findParent([], root, node);
    if (ancestors.length > 0) return [...ancestors, node.title].join(' > ');
  }

  return node.title;
}

/* ── Section-precise change analysis ─────────────────────────────────── */

/**
 * Given the TOC and a set of changed line ranges (from diff), return which
 * sections/part titles are affected. Returns structured info suitable for
 * embedding in a brief.
 */
export function identifyAffectedSections(
  toc: TableOfContents,
  linesBefore: string[],
  linesAfter: string[]
): SectionChange[] {
  const affected: SectionChange[] = [];
  const { added, removed, modified } = computeChanges(linesBefore, linesAfter);

  for (const line of added) {
    const ctx = getHeadingContext(toc, linesAfter, line);
    if (ctx) affected.push({ sectionTitle: ctx, changeType: 'added', context: ctx });
  }
  for (const line of removed) {
    const ctx = getHeadingContext(toc, linesBefore, line);
    if (ctx) affected.push({ sectionTitle: ctx, changeType: 'removed', context: ctx });
  }

  return affected;
}

function computeChanges(
  before: string[],
  after: string[]
): { added: number[]; removed: number[]; modified: number[] } {
  const added: number[] = [];
  const removed: number[] = [];

  // Simple line-by-line comparison with fuzzy matching
  const used = new Set<number>();
  for (let i = 0; i < after.length; i++) {
    const found = findClosestLine(before, after[i], used);
    if (found >= 0) {
      used.add(found);
    } else {
      added.push(i);
    }
  }
  for (let j = 0; j < before.length; j++) {
    if (!used.has(j)) removed.push(j);
  }

  return { added, removed, modified: [] };
}

function findClosestLine(lines: string[], needle: string, used: Set<number>): number {
  const needleNorm = needle.replace(/\s+/g, ' ').trim().toLowerCase();
  let bestIdx = -1;
  let bestSim = 0;

  for (let i = 0; i < lines.length; i++) {
    if (used.has(i)) continue;
    const lineNorm = lines[i].replace(/\s+/g, ' ').trim().toLowerCase();
    // Simple containment check first
    if (needleNorm.includes(lineNorm) || lineNorm.includes(needleNorm)) {
      return i;
    }
    // Word overlap score
    const a = new Set(needleNorm.split(' '));
    const b = new Set(lineNorm.split(' '));
    let score = 0;
    for (const w of a) if (b.has(w)) score++;
    if (score > bestSim) {
      bestSim = score;
      bestIdx = i;
    }
  }

  return bestIdx;
}

function getHeadingContext(toc: TableOfContents, lines: string[], lineIdx: number): string | null {
  // Look backward from the changed line to find the nearest heading
  for (let i = Math.min(lineIdx, lines.length - 1); i >= Math.max(0, lineIdx - 3); i--) {
    const l = lines[i].trim();
    if (PART_RE.test(l) || CHAPTER_RE.test(l) || DIVISION_RE.test(l) || SECTION_RE.test(l)) return l;
  }
  return null;
}

/* ── Serialize for DB storage ─────────────────────────────────────────── */

/** Convert a TOC to JSON-safe object (strips the Map). */
export function serializeTOC(toc: TableOfContents): string {
  const plain = {
    root: toc.root,
    all: toc.all.map((n) => ({ ...n, children: n.children.length ? n.children : undefined })),
  };
  return JSON.stringify(plain);
}

/** Deserialize a stored TOC JSON back to TableOfContents (rebuilds Map). */
export function deserializeTOC(jsonStr: string): TableOfContents {
  const plain = JSON.parse(jsonStr) as { root: TocNode[]; all: Partial<TocNode>[] };
  // Reconstruct children arrays from the 'root' which should be complete
  return { root: plain.root, all: plain.all as TocNode[], sections: new Map() };
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
