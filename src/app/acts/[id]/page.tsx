"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import CheckButton from "@/components/CheckButton";
import DiffViewer from "@/components/DiffViewer";

interface ActData {
  id: number;
  title: string;
  url: string;
  jurisdiction: "federal" | "vic";
  version_count: number;
  last_checked: string | null;
  recent_changes: number;
}

interface Version {
  id: number;
  act_id: number;
  fetched_at: string;
  version_label: string | null;
  content_hash: string;
  plain_text: string | null;
  source_url: string | null;
}

interface ChangeRecord {
  id: number;
  act_id: number;
  version_from_id: number | null;
  version_to_id: number;
  detected_at: string;
  summary: string | null;
  sections_changed: string[];
  affected_groups: string[];
  change_count: number;
}

export default function ActDetail() {
  const params = useParams();
  const router = useRouter();
  const actId = parseInt(params.id as string, 10);

  const [act, setAct] = useState<ActData | null>(null);
  const [versions, setVersions] = useState<Version[]>([]);
  const [changes, setChanges] = useState<ChangeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [selectedVersionA, setSelectedVersionA] = useState<number | null>(null);
  const [selectedVersionB, setSelectedVersionB] = useState<number | null>(null);
  const [showDiff, setShowDiff] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [actRes, versionsRes, changesRes] = await Promise.all([
        fetch(`/api/acts/${actId}`),
        fetch(`/api/acts/${actId}/versions`),
        fetch(`/api/changes/${actId}`),
      ]);

      if (actRes.ok) setAct((await actRes.json()) as ActData);
      if (versionsRes.ok) setVersions((await versionsRes.json()) as Version[]);
      if (changesRes.ok) setChanges((await changesRes.json()) as ChangeRecord[]);
    } catch (err) {
      console.error("Failed to fetch act data:", err);
    } finally {
      setLoading(false);
    }
  }, [actId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleCheck = async () => {
    setChecking(true);
    try {
      const res = await fetch(`/api/acts/${actId}/check`, { method: "POST" });
      if (res.ok) {
        const result = await res.json();
        if (result.hasChange) {
          // Brief flash notification could go here
        }
      }
    } catch (err) {
      console.error("Check failed:", err);
    } finally {
      setChecking(false);
      fetchData();
    }
  };

  const handleDelete = async () => {
    if (!confirm(`Remove "${act?.title}" from watch list?`)) return;
    setDeleting(true);
    try {
      await fetch(`/api/acts/${actId}`, { method: "DELETE" });
      router.push("/");
    } catch (err) {
      console.error("Delete failed:", err);
      setDeleting(false);
    }
  };

  const handleCompare = () => {
    if (selectedVersionA && selectedVersionB) {
      setShowDiff(true);
    }
  };

  const jurisdictionBadge =
    act?.jurisdiction === "federal"
      ? "badge-federal"
      : "badge-vic";
  const jurisdictionLabel =
    act?.jurisdiction === "federal" ? "Federal" : "Victoria";

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-pulse">
        <div className="h-8 skeleton w-2/3 mb-4 rounded" />
        <div className="h-4 skeleton w-1/2 mb-8 rounded" />
        <div className="space-y-4">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-32 bg-surface/60 rounded-xl border border-white/[0.06] p-5">
              <div className="h-5 skeleton w-1/3 mb-3 rounded" />
              <div className="h-3.5 skeleton w-full mb-2 rounded" />
              <div className="h-3.5 skeleton w-2/3 rounded" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!act) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-24 text-center">
        <h2 className="text-xl font-semibold mb-2">Act not found</h2>
        <Link href="/" className="text-accent hover:underline">← Back to dashboard</Link>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Breadcrumb + Title */}
      <div className="mb-8">
        <Link href="/" className="text-sm text-foreground/40 hover:text-foreground/70 transition-colors inline-flex items-center gap-1 mb-4">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          All watched Acts
        </Link>

        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-2 flex-wrap">
              <h1 className="text-2xl font-bold tracking-tight truncate">{act.title}</h1>
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-medium whitespace-nowrap ${jurisdictionBadge}`}>
                {jurisdictionLabel}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm text-foreground/40">
              <span className="inline-flex items-center gap-1.5">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 7v10c0 .6.4 1 1 1h14c.6 0 1-.4 1-1V7c0-.6-.4-1-1-1H5a1 1 0 00-1 1z" />
                </svg>
                {act.version_count} version{act.version_count !== 1 ? "s" : ""} tracked
              </span>
              <span className="inline-flex items-center gap-1.5">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Last checked: {act.last_checked ? new Date(act.last_checked).toLocaleString("en-AU", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "Never"}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <CheckButton onClick={handleCheck} checking={checking} />
            <a
              href={act.url}
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 text-faint hover:text-foreground transition-colors rounded-lg hover:bg-white/[0.06]"
              title="View on legislation site"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="p-2 text-red-400/70 hover:text-red-400 hover:bg-red-500/10 transition-colors rounded-lg"
              title="Remove from watch list"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Changes Section */}
      {changes.length > 0 && (
        <section className="mb-10 animate-fade-in">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <svg className="w-5 h-5 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
            Recent Changes ({changes.length})
          </h2>

          <div className="space-y-4">
            {changes.map((change, index) => (
              <ChangeCard key={change.id} change={change} versionMap={versions} actTitle={act.title} />
            ))}
          </div>
        </section>
      )}

      {/* Version Timeline */}
      <section className="animate-fade-in animate-delay-200">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <svg className="w-5 h-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Version History ({versions.length})
        </h2>

        {versions.length === 0 ? (
          <p className="text-sm text-foreground/40">No versions captured yet.</p>
        ) : (
          <>
            {/* Comparison controls */}
            <div className="flex flex-wrap items-center gap-3 mb-4 p-4 bg-surface/70 rounded-xl border border-white/[0.06]">
              <span className="text-sm font-medium text-foreground/60">Compare versions:</span>
              <select
                value={selectedVersionA || ""}
                onChange={(e) => setSelectedVersionA(e.target.value ? parseInt(e.target.value, 10) : null)}
                className="px-3 py-1.5 border border-white/10 bg-background/50 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent/60"
              >
                <option value="">Select version...</option>
                {versions.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.version_label || v.fetched_at.slice(0, 10)}
                  </option>
                ))}
              </select>
              <span className="text-foreground/30">→</span>
              <select
                value={selectedVersionB || ""}
                onChange={(e) => setSelectedVersionB(e.target.value ? parseInt(e.target.value, 10) : null)}
                className="px-3 py-1.5 border border-white/10 bg-background/50 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent/60"
              >
                <option value="">Select version...</option>
                {versions.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.version_label || v.fetched_at.slice(0, 10)}
                  </option>
                ))}
              </select>
              <button
                onClick={handleCompare}
                disabled={!selectedVersionA || !selectedVersionB}
                className="ml-auto px-4 py-1.5 bg-accent hover:bg-accent-light disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium rounded-lg text-sm transition-all hover:shadow-[0_0_22px_-4px_rgba(124,92,252,0.8)]"
              >
                Show Diff
              </button>
            </div>

            {/* Version list */}
            <div className="space-y-3">
              {versions.map((version, index) => (
                <VersionItem
                  key={version.id}
                  version={version}
                  index={index}
                  isSelectedA={selectedVersionA === version.id}
                  isSelectedB={selectedVersionB === version.id}
                  onSelectA={() => setSelectedVersionA(version.id)}
                  onSelectB={() => setSelectedVersionB(version.id)}
                />
              ))}
            </div>
          </>
        )}
      </section>

      {/* Diff Modal */}
      {showDiff && selectedVersionA && selectedVersionB && (
        <DiffModal
          versionA={versions.find((v) => v.id === selectedVersionA)}
          versionB={versions.find((v) => v.id === selectedVersionB)}
          onClose={() => setShowDiff(false)}
        />
      )}
    </div>
  );
}

function ChangeCard({ change, versionMap, actTitle }: {
  change: ChangeRecord;
  versionMap: Version[];
  actTitle: string;
}) {
  const fromLabel = change.version_from_id
    ? (versionMap.find((v) => v.id === change.version_from_id)?.version_label || "")
    : "";
  const toLabel = change.version_to_id
    ? (versionMap.find((v) => v.id === change.version_to_id)?.version_label || change.version_to_id.toString())
    : "";

  return (
    <div className="bg-surface/70 rounded-xl border border-white/[0.06] p-5 card-lift">
      <div className="flex items-start justify-between gap-4 mb-3">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-xs text-foreground/40 font-mono">{change.detected_at.slice(0, 10)}</span>
          <span className="inline-flex items-center px-2 py-0.5 bg-accent-amber/10 text-accent-amber rounded-full text-xs font-medium">
            {change.change_count} line{change.change_count !== 1 ? "s" : ""} changed
          </span>
        </div>
      </div>

      {/* Summary */}
      {change.summary && (
        <p className="text-sm leading-relaxed text-foreground/80 mb-3">{change.summary}</p>
      )}

      {/* Affected groups */}
      {change.affected_groups && change.affected_groups.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <span className="text-xs text-foreground/40 font-medium">Affects:</span>
          {change.affected_groups.map((group) => (
            <span key={group} className="px-2 py-0.5 bg-background/50 border border-white/[0.06] rounded-md text-xs text-muted">
              {group}
            </span>
          ))}
        </div>
      )}

      {/* Changed sections preview */}
      {change.sections_changed && change.sections_changed.length > 0 && (
        <details className="mt-2">
          <summary className="text-xs text-accent cursor-pointer hover:underline">
            View {change.sections_changed.length} changed section(s)
          </summary>
          <div className="mt-2 space-y-1 max-h-40 overflow-auto">
            {change.sections_changed.map((section, i) => (
              <p key={i} className="text-xs font-mono text-foreground/50 px-3 py-1.5 bg-background/50 rounded-md border-l-2 border-accent/40">
                {truncate(section, 120)}
              </p>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

function VersionItem({
  version,
  index,
  isSelectedA,
  isSelectedB,
  onSelectA,
  onSelectB,
}: {
  version: Version;
  index: number;
  isSelectedA: boolean;
  isSelectedB: boolean;
  onSelectA: () => void;
  onSelectB: () => void;
}) {
  const isLatest = index === 0;

  return (
    <div className={`flex items-center gap-4 p-4 bg-surface/70 rounded-xl border transition-colors ${isLatest ? "border-vic/25 bg-vic/[0.04]" : "border-white/[0.06] hover:border-white/15"}`}>
      {/* Timeline dot */}
      <div className="flex flex-col items-center shrink-0">
        <div className={`w-3 h-3 rounded-full border-2 ${isLatest ? "bg-vic border-vic" : "bg-surface-2 border-white/20"} ${isSelectedA || isSelectedB ? "ring-2 ring-accent/30 scale-125" : ""}`} />
        {index < 4 && <div className="w-px h-6 bg-foreground/10 mt-1" />}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap mb-1">
          <span className="text-sm font-medium truncate">{version.version_label || `Version #${version.id}`}</span>
          {isLatest && (
            <span className="inline-flex items-center px-1.5 py-0.5 bg-vic/15 text-vic rounded text-[10px] font-medium">
              Current
            </span>
          )}
        </div>
        <p className="text-xs text-foreground/40 flex items-center gap-1">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {new Date(version.fetched_at).toLocaleString("en-AU", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })}
        </p>
      </div>

      {/* Select controls */}
      <div className="flex items-center gap-1.5 shrink-0">
        <button
          onClick={onSelectA}
          title="Set as version A (from)"
          className={`w-7 h-7 rounded-lg text-xs font-bold flex items-center justify-center transition-all ${isSelectedA ? "bg-accent/20 text-accent border-accent/40" : "border border-white/10 text-faint hover:text-muted hover:border-white/25"}`}
        >
          A
        </button>
        <button
          onClick={onSelectB}
          title="Set as version B (new)"
          className={`w-7 h-7 rounded-lg text-xs font-bold flex items-center justify-center transition-all ${isSelectedB ? "bg-accent/20 text-accent border-accent/40" : "border border-white/10 text-faint hover:text-muted hover:border-white/25"}`}
        >
          B
        </button>
      </div>
    </div>
  );
}

function DiffModal({ versionA, versionB, onClose }: {
  versionA?: Version;
  versionB?: Version;
  onClose: () => void;
}) {
  if (!versionA || !versionB) return null;

  const oldText = versionA.plain_text || "";
  const newText = versionB.plain_text || "";

  if (oldText === newText) {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
        <div className="modal-overlay absolute inset-0" onClick={onClose} />
        <div className="relative bg-surface border border-white/[0.08] rounded-2xl shadow-[0_24px_80px_-24px_rgba(0,0,0,0.8)] w-full max-w-4xl max-h-[80vh] overflow-hidden animate-fade-in z-10">
          <div className="bg-white/[0.03] border-b border-white/[0.06] px-6 py-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold">No Differences</h2>
            <button onClick={onClose} className="text-muted hover:text-foreground">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="p-8 text-center">
            <svg className="w-12 h-12 mx-auto mb-3 text-vic" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 13l4 4L19 7" />
            </svg>
            <p className="text-foreground/50">The content of these two versions is identical.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="modal-overlay absolute inset-0" onClick={onClose} />
      <div className="relative bg-surface border border-white/[0.08] rounded-2xl shadow-[0_24px_80px_-24px_rgba(0,0,0,0.8)] w-full max-w-5xl max-h-[85vh] overflow-hidden animate-fade-in z-10 flex flex-col">
        {/* Header */}
        <div className="bg-white/[0.03] border-b border-white/[0.06] px-6 py-4 flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-lg font-semibold">Diff: {versionA.version_label || `v${versionA.id}`} → {versionB.version_label || `v${versionB.id}`}</h2>
            <p className="text-xs text-foreground/40 mt-0.5">{new Date(versionA.fetched_at).toLocaleDateString("en-AU")} → {new Date(versionB.fetched_at).toLocaleDateString("en-AU")}</p>
          </div>
          <button onClick={onClose} className="text-muted hover:text-foreground transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Diff content */}
        <div className="overflow-auto flex-1">
          <DiffViewer oldText={oldText} newText={newText} showContextLines={2} maxLines={300} />
        </div>
      </div>
    </div>
  );
}

function truncate(str: string, len: number): string {
  return str.length > len ? str.slice(0, len) + "..." : str;
}
