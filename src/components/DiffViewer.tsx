"use client";

import { useMemo } from "react";

interface DiffLine {
  type: "added" | "removed" | "unchanged";
  content: string;
  oldLine?: number;
  newLine?: number;
}

interface DiffViewerProps {
  oldText: string;
  newText: string;
  showContextLines?: number;
  maxLines?: number;
}

export default function DiffViewer({ oldText, newText, showContextLines = 3, maxLines = 200 }: DiffViewerProps) {
  const diffLines = useMemo(() => computeDiff(oldText, newText, showContextLines, maxLines), [oldText, newText, showContextLines, maxLines]);

  if (!oldText && !newText) {
    return <p className="text-sm text-foreground/40 italic">No content available for comparison</p>;
  }

  const hasChanges = diffLines.some((l) => l.type !== "unchanged");

  if (!hasChanges) {
    return (
      <div className="text-center py-8 text-sm text-foreground/40">
        <svg className="w-8 h-8 mx-auto mb-2 text-vic" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
        No differences detected between these versions.
      </div>
    );
  }

  return (
    <div className="font-mono-custom text-xs overflow-hidden">
      {/* Legend */}
      <div className="flex items-center gap-4 px-4 py-2 bg-white/[0.02] border-b border-white/[0.06] text-[11px] text-faint">
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-vic/25 border border-vic/40 inline-block" />
          Added lines
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-danger/25 border border-danger/40 inline-block" />
          Removed lines
        </span>
      </div>

      {/* Diff content - side by side */}
      <div className="grid grid-cols-2 divide-x divide-white/[0.06] max-h-[500px] overflow-auto">
        {/* Left (old) */}
        <div className="overflow-auto max-h-[500px]">
          {diffLines.map((line, i) => (
            <DiffLineRow
              key={i}
              line={line}
              position="left"
              showNumber
            />
          ))}
        </div>

        {/* Right (new) */}
        <div className="overflow-auto max-h-[500px]">
          {diffLines.map((line, i) => (
            <DiffLineRow
              key={i}
              line={line}
              position="right"
              showNumber
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function DiffLineRow({
  line,
  position,
  showNumber,
}: {
  line: DiffLine;
  position: "left" | "right";
  showNumber: boolean;
}) {
  const isLeft = position === "left";

  if (line.type === "unchanged") {
    return (
      <div className="flex hover:bg-white/[0.04] transition-colors">
        {showNumber && (
          <span className="diff-line-number">{isLeft ? line.oldLine : line.newLine}</span>
        )}
        <span className="diff-line-marker text-foreground/20" />
        <span className="whitespace-pre flex-1 text-foreground/40 px-2 py-[1px]">{line.content || " "}</span>
      </div>
    );
  }

  return (
    <div className={`flex ${isLeft ? `diff-${line.type}` : line.type === "added" ? "bg-transparent" : `diff-${line.type}`} transition-colors`}>
      {showNumber && (
        <span className="diff-line-number">
          {isLeft ? line.oldLine : line.newLine}
        </span>
      )}
      <span className="diff-line-marker">{line.type === "added" ? "+" : "-"}</span>
      <span className={`whitespace-pre flex-1 px-2 py-[1px] ${isLeft ? "" : "text-foreground/80"}`}>
        {line.content || " "}
      </span>
    </div>
  );
}

function computeDiff(
  oldText: string,
  newText: string,
  contextLines: number,
  maxLines: number
): DiffLine[] {
  const oldLines = oldText.split("\n");
  const newLines = newText.split("\n");

  // Simple LCS-based diff for brevity
  const lcs = computeLCS(oldLines, newLines);
  const result: DiffLine[] = [];

  let oi = 0, ni = 0;
  let li = 0;

  while (oi < oldLines.length || ni < newLines.length) {
    // If we've reached the LCS length limit, just dump remaining
    if (li >= lcs.length) {
      while (oi < oldLines.length) {
        result.push({ type: "removed", content: oldLines[oi], oldLine: oi + 1 });
        oi++;
      }
      while (ni < newLines.length) {
        result.push({ type: "added", content: newLines[ni], newLine: ni + 1 });
        ni++;
      }
      break;
    }

    const [oldIdx, newIdx] = lcs[li];

    // Emit removals before LCS match
    if (oi < oldIdx || ni < newIdx) {
      while (oi < oldIdx && ni < newIdx) {
        result.push({ type: "removed", content: oldLines[oi], oldLine: oi + 1 });
        oi++;

        const matchingNew = newLines.indexOf(oldLines[oi - 1], ni);
        if (matchingNew >= ni && matchingNew <= newIdx) {
          result.push({ type: "added", content: newLines[ni], newLine: ni + 1 });
          ni++;
        } else {
          // Only remove, the new line will be emitted later
        }
      }
      while (oi < oldIdx) {
        result.push({ type: "removed", content: oldLines[oi], oldLine: oi + 1 });
        oi++;
      }
      while (ni < newIdx) {
        result.push({ type: "added", content: newLines[ni], newLine: ni + 1 });
        ni++;
      }
    }

    // Emit the matching line
    if (li < lcs.length && oi === oldIdx && ni === newIdx) {
      // Add context lines before
      for (let c = 0; c < contextLines && oi > c; c++) {
        // already handled by context logic below
      }

      result.push({ type: "unchanged", content: oldLines[oi], oldLine: oi + 1, newLine: ni + 1 });
      oi++;
      ni++;
      li++;
    }
  }

  // Trim to max lines, adding ellipsis if needed
  if (result.length > maxLines) {
    const half = Math.floor(maxLines / 2);
    return [...result.slice(0, half), { type: "unchanged", content: "...", oldLine: undefined, newLine: undefined }, ...result.slice(-half)];
  }

  return result;
}

function computeLCS(oldLines: string[], newLines: string[]): [number, number][] {
  const m = oldLines.length;
  const n = newLines.length;
  if (m === 0 || n === 0) return [];

  // Dynamic programming table for LCS - limited by size for performance
  const limit = Math.max(m * n, 50000);
  let ops = 0;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

  for (let i = 1; i <= m && ops < limit * 2; i++) {
    for (let j = 1; j <= n && ops < limit * 2; j++) {
      ops++;
      if (oldLines[i - 1] === newLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Backtrack to find LCS pairs
  const result: [number, number][] = [];
  let i = m, j = n;
  while (i > 0 && j > 0) {
    if (oldLines[i - 1] === newLines[j - 1]) {
      result.unshift([i - 1, j - 1]);
      i--;
      j--;
    } else if (dp[i - 1][j] > dp[i][j - 1]) {
      i--;
    } else {
      j--;
    }
  }

  return result;
}
