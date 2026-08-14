import { createTwoFilesPatch, parsePatch, Hunk } from "diff";

export interface DiffResult {
  addedLines: number;
  removedLines: number;
  changedSections: string[];
  affectedGroups: string[];
  summary: string;
}

/**
 * Generate a human-readable change summary by analyzing diffs
 * between two versions of legislation.
 */
export function analyzeChanges(
  oldText: string,
  newText: string,
  actTitle: string
): DiffResult {
  const diff = createTwoFilesPatch(
    "old.txt",
    "new.txt",
    oldText,
    newText,
    "Previous version",
    "Current version"
  );

  // Parse the unified diff to get added/removed lines
  const lines = diff.split("\n");
  let addedLines = 0;
  let removedLines = 0;
  const changedSections: string[] = [];
  let inHunk = false;
  let currentSection: string | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Detect hunk headers which often indicate section changes
    if (line.startsWith("@@")) {
      inHunk = true;
      // Try to extract the old range context as a potential section indicator
      const match = line.match(/\-(\d+),?(\d*)/);
      if (match && match[1]) {
        const startLine = parseInt(match[1], 10);
        // Look backwards for section headers near this line
        const prevText = oldText.split("\n").slice(0, Math.min(startLine + 5, oldText.split("\n").length));
        const lastHeader = findLastSectionHeader(prevText);
        if (lastHeader && !changedSections.includes(lastHeader)) {
          changedSections.push(lastHeader);
          currentSection = lastHeader;
        }
      }
      continue;
    }

    if (inHunk) {
      if (line.startsWith("+") && !line.startsWith("+++")) {
        addedLines++;
        // Extract meaningful content from added lines
        const content = line.slice(1).trim();
        if (content.length > 20 && isMeaningfulChange(content)) {
          changedSections.push(`Added: "${truncate(content, 80)}"`);
        }
      } else if (line.startsWith("-") && !line.startsWith("---")) {
        removedLines++;
        const content = line.slice(1).trim();
        if (content.length > 20 && isMeaningfulChange(content)) {
          changedSections.push(`Removed: "${truncate(content, 80)}"`);
        }
      }
    }
  }

  // Deduplicate changed sections (keep first occurrence of each prefix)
  const seenPrefixes = new Set<string>();
  const uniqueSections = changedSections.filter((s) => {
    const prefix = s.split(":").join("").trim().slice(0, 30);
    if (seenPrefixes.has(prefix)) return false;
    seenPrefixes.add(prefix);
    return true;
  });

  // Detect affected groups based on changed content patterns
  const combinedDiff = lines.filter((l) => l.startsWith("+") || l.startsWith("-")).join("\n");
  const affectedGroups = detectAffectedGroups(combinedDiff, actTitle);

  // Generate summary
  const summary = generateSummary(actTitle, addedLines, removedLines, uniqueSections.slice(0, 5), affectedGroups);

  return {
    addedLines,
    removedLines,
    changedSections: uniqueSections.slice(0, 10),
    affectedGroups,
    summary,
  };
}

function findLastSectionHeader(lines: string[]): string | null {
  const sectionPattern = /^(Section\s+\d+|Division\s+\w+|Part\s+(?:\d|[IVX]+)|Clause\s+\d+|Schedule\s+(?:No\.?\s*)?\d*|[A-Z][^.]{5,80}:\s*$)/i;
  for (let i = lines.length - 1; i >= Math.max(0, lines.length - 20); i--) {
    const match = lines[i].trim().match(sectionPattern);
    if (match) return match[0];
  }
  return null;
}

function isMeaningfulChange(line: string): boolean {
  // Filter out trivial changes like single word typos
  const stopWords = new Set(["the", "a", "an", "is", "are", "was", "were", "to", "of", "and", "or"]);
  const words = line.split(/\s+/).filter((w) => w.length > 3);
  if (words.length === 0) return false;
  const stopRatio = words.filter((w) => stopWords.has(w.toLowerCase())).length / words.length;
  return stopRatio < 0.6 && line.length > 15;
}

function detectAffectedGroups(diff: string, actTitle: string): string[] {
  const groups: string[] = [];
  const lower = diff.toLowerCase();
  const titleLower = actTitle.toLowerCase();

  // Check for business/corporate references
  if (/\b(corporat|business|compan|enterpris|trade|commerce|market)\b/.test(lower) || /corporations/i.test(actTitle)) {
    groups.push("Businesses & Corporations");
  }

  // Privacy / data references
  if (/\b(personal data|information collection|privacy|sensitive information|confidential)\b/.test(lower) || /privacy/i.test(actTitle)) {
    groups.push("Individuals & Data Subjects");
  }

  // Workplace references
  if (/\b(employ|worker|workplace|employee|occupational safety)\b/.test(lower) || /work.+health.+safety/i.test(actTitle)) {
    groups.push("Workers & Employers");
  }

  // Health/Medical references
  if (/\b(health care|medical practitioner|health service|clinical|hospital)\b/.test(lower) || /health.*practitioner|health/i.test(actTitle)) {
    groups.push("Health Practitioners & Patients");
  }

  // Consumer references
  if (/\b(consumer|product safety|fair trading|unfair|misleading)\b/.test(lower)) {
    groups.push("Consumers");
  }

  // Government references
  if (/\b(agency|authority|regulator|commission|department|government)\b/.test(lower) && /amend/.test(diff)) {
    groups.push("Government Agencies");
  }

  // Legal professionals
  if (/\b(solicitor|counsel|bar|court|tribunal|proceeding|litigation)\b/.test(lower)) {
    groups.push("Legal Professionals");
  }

  // General public catch-all
  if (groups.length === 0) {
    groups.push("General Public");
  }

  return groups;
}

function generateSummary(
  actTitle: string,
  addedLines: number,
  removedLines: number,
  sections: string[],
  affectedGroups: string[]
): string {
  const parts: string[] = [];

  // Opening statement
  parts.push(`The ${actTitle} has been amended`);

  // Quantify changes
  if (addedLines > 0 || removedLines > 0) {
    const changeParts: string[] = [];
    if (addedLines > 0) changeParts.push(`${addedLines} line${addedLines !== 1 ? "s" : ""} added`);
    if (removedLines > 0) changeParts.push(`${removedLines} line${removedLines !== 1 ? "s" : ""} removed`);
    parts.push(`(${changeParts.join(", ")})`);
  }

  // Key changes
  if (sections.length > 0) {
    const uniqueKeySections = sections.filter((s) => s.startsWith("Added:") || s.startsWith("Removed:"));
    if (uniqueKeySections.length > 0) {
      parts.push(`Key changes include:`);
      uniqueKeySections.slice(0, 3).forEach((section) => {
        const prefix = section.startsWith("Added") ? "Addition" : "Removal";
        parts.push(`• ${prefix.toLowerCase()}: ${section.replace(/^(Added|Removed): /, "")}`);
      });
      if (uniqueKeySections.length > 3) {
        parts.push(`• ...and ${uniqueKeySections.length - 3} additional changes`);
      }
    }
  }

  // Affected parties
  if (affectedGroups.length > 0 && affectedGroups[0] !== "General Public") {
    parts.push(
      `This affects: ${affectedGroups.join(", ")}.`
    );
  } else if (affectedGroups.length > 0) {
    parts.push("This may affect the general public.");
  }

  return parts.join(" ");
}

function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 3) + "...";
}
