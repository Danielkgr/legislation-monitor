"use client";

import { useMemo } from "react";
import { diffLines } from "diff";

interface DiffViewerProps {
  oldText: string;
  newText: string;
  showContextLines?: number;
  maxLines?: number;
}

type CellKind = "add" | "del" | "same" | "empty";

interface Cell {
  kind: CellKind;
  text: string;
  num: number | null;
}

interface SideRow {
  left: Cell;
  right: Cell;
  elided?: boolean;
}

export default function DiffViewer({
  oldText,
  newText,
  showContextLines = 3,
  maxLines = 200,
}: DiffViewerProps) {
  const rows = useMemo(
    () => buildSideBySide(oldText, newText, showContextLines, maxLines),
    [oldText, newText, showContextLines, maxLines]
  );

  if (!oldText && !newText) {
    return (
      <p className="text-sm text-foreground/40 italic">
        No content available for comparison
      </p>
    );
  }

  const hasChanges = rows.some(
    (r) => r.left.kind === "del" || r.right.kind === "add"
  );

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
          Added
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-danger/25 border border-danger/40 inline-block" />
          Removed
        </span>
      </div>

      {/* Side-by-side panes */}
      <div className="grid grid-cols-2 divide-x divide-white/[0.06]">
        <DiffPane rows={rows} position="left" />
        <DiffPane rows={rows} position="right" />
      </div>
    </div>
  );
}

function DiffPane({ rows, position }: { rows: SideRow[]; position: "left" | "right" }) {
  return (
    <div className="overflow-auto max-h-[500px]">
      {rows.map((row, i) => {
        if (row.elided) {
          return (
            <div
              key={i}
              className="px-2 py-0.5 text-foreground/30 text-center bg-white/[0.02] select-none"
            >
              …
            </div>
          );
        }
        const cell = position === "left" ? row.left : row.right;
        const lineClass =
          cell.kind === "add"
            ? "diff-added"
            : cell.kind === "del"
              ? "diff-removed"
              : "";
        return (
          <div key={i} className={`flex ${lineClass} transition-colors`}>
            <span className="diff-line-number">{cell.num ?? ""}</span>
            <span className="diff-line-marker">
              {cell.kind === "add" ? "+" : cell.kind === "del" ? "-" : ""}
            </span>
            <span className="whitespace-pre flex-1 px-2 py-[1px] text-foreground/70">
              {cell.text || " "}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Compute aligned side-by-side rows from two normalized texts using the `diff`
 * package (real line diff). Unchanged lines are collapsed to a context window
 * around each change so large documents stay readable.
 */
function buildSideBySide(
  oldText: string,
  newText: string,
  context: number,
  maxLines: number
): SideRow[] {
  const parts = diffLines(oldText, newText);

  // Expand diff parts into flat tokens with running old/new line numbers.
  type Tok = { kind: "same" | "add" | "del"; text: string; num: number };
  const toks: Tok[] = [];
  let o = 0;
  let n = 0;
  for (const part of parts) {
    const lines = part.value.replace(/\n$/, "").split("\n");
    for (const text of lines) {
      if (part.added) {
        toks.push({ kind: "add", text, num: ++n });
      } else if (part.removed) {
        toks.push({ kind: "del", text, num: ++o });
      } else {
        toks.push({ kind: "same", text, num: ++o });
        n++;
      }
    }
  }

  // Mark the context window around each change as worth keeping.
  const keep: boolean[] = new Array(toks.length).fill(false);
  for (let i = 0; i < toks.length; i++) {
    if (toks[i].kind !== "same") {
      for (
        let j = Math.max(0, i - context);
        j <= Math.min(toks.length - 1, i + context);
        j++
      ) {
        keep[j] = true;
      }
    }
  }

  const rows: SideRow[] = [];
  let started = false;
  let i = 0;
  while (i < toks.length) {
    if (!keep[i]) {
      if (started) {
        rows.push({
          left: { kind: "empty", text: "", num: null },
          right: { kind: "empty", text: "", num: null },
          elided: true,
        });
      }
      i++;
      while (i < toks.length && !keep[i]) i++;
      continue;
    }

    if (toks[i].kind === "same") {
      const t = toks[i];
      rows.push({
        left: { kind: "same", text: t.text, num: t.num },
        right: { kind: "same", text: t.text, num: t.num },
      });
      started = true;
      i++;
    } else {
      // Gather a consecutive run of changes, then pair deletions with additions.
      const run: Tok[] = [];
      while (i < toks.length && toks[i].kind !== "same") {
        run.push(toks[i]);
        i++;
      }
      const dels = run.filter((t) => t.kind === "del");
      const adds = run.filter((t) => t.kind === "add");
      const maxLen = Math.max(dels.length, adds.length);
      for (let k = 0; k < maxLen; k++) {
        rows.push({
          left: dels[k]
            ? { kind: "del", text: dels[k].text, num: dels[k].num }
            : { kind: "empty", text: "", num: null },
          right: adds[k]
            ? { kind: "add", text: adds[k].text, num: adds[k].num }
            : { kind: "empty", text: "", num: null },
        });
        started = true;
      }
    }
  }

  // Cap the total number of rendered rows.
  if (rows.length > maxLines) {
    const half = Math.floor(maxLines / 2);
    return [
      ...rows.slice(0, half),
      {
        left: { kind: "empty", text: "", num: null },
        right: { kind: "empty", text: "", num: null },
        elided: true,
      },
      ...rows.slice(rows.length - half),
    ];
  }

  return rows;
}
