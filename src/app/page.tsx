"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import AddActForm from "@/components/AddActForm";
import ActCard from "@/components/ActCard";
import CheckButton from "@/components/CheckButton";

interface ActItem {
  id: number;
  title: string;
  url: string;
  jurisdiction: "federal" | "vic";
  version_count: number;
  last_checked: string | null;
  recent_changes: number;
}

export default function Dashboard() {
  const [acts, setActs] = useState<ActItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [checkingAll, setCheckingAll] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [jurisdictionFilter, setJurisdictionFilter] = useState<"all" | "federal" | "vic">("all");

  const fetchActs = useCallback(async () => {
    try {
      const res = await fetch("/api/acts");
      if (res.ok) {
        const data = await res.json();
        setActs(data);
      }
    } catch (err) {
      console.error("Failed to fetch acts:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchActs();
  }, [fetchActs]);

  // Fetch pending-change count on mount
  useEffect(() => {
    fetch("/api/changes/count")
      .then((r) => r.json())
      .then((data: { pending?: number }) => setPendingCount(data.pending ?? 0))
      .catch(() => {});
  }, []);

  const dismissPending = async () => {
    setPendingCount(0);
    try {
      await fetch("/api/changes/ack", { method: "POST" });
    } catch {}
  };

  const handleCheckAll = async () => {
    setCheckingAll(true);
    const promises = acts.map((act) =>
      fetch(`/api/acts/${act.id}/check`, { method: "POST" })
        .then(async (res) => res.json())
        .catch(() => null)
    );
    await Promise.all(promises);
    setCheckingAll(false);
    fetchActs();
  };

  const federalCount = acts.filter((a) => a.jurisdiction === "federal").length;
  const vicCount = acts.filter((a) => a.jurisdiction === "vic").length;
  const totalChanges = acts.reduce((sum, a) => sum + a.recent_changes, 0);

  // Filtered acts based on search + jurisdiction
  const filteredActs = acts.filter((act) => {
    const matchesSearch = !searchQuery || act.title.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesJurisdiction = jurisdictionFilter === "all" || act.jurisdiction === jurisdictionFilter;
    return matchesSearch && matchesJurisdiction;
  });

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="bg-background/75 backdrop-blur-xl sticky top-0 z-50 border-b border-white/[0.06] no-print">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center font-bold text-white text-sm shadow-[0_0_20px_-4px_rgba(124,92,252,0.8)]">
              LM
            </div>
            <div>
              <h1 className="text-lg font-semibold tracking-tight">Legislation Monitor</h1>
              <p className="text-xs text-white/50 hidden sm:block">Track what&apos;s changing in the law</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/settings"
              className="text-xs text-faint hover:text-foreground transition-colors flex items-center gap-1"
              title="Settings (AI summaries, automation)"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span className="hidden sm:inline">Settings</span>
            </Link>
            <Link href="/docs" className="text-xs text-faint hover:text-foreground transition-colors flex items-center gap-1" title="Open API documentation (Swagger UI)">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-3-3v6m-7 4h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
              <span className="hidden sm:inline">API</span>
            </Link>
            {pendingCount > 0 && (
              <button
                onClick={dismissPending}
                className="flex items-center gap-1.5 text-xs text-accent animate-fade-in hover:text-accent-light transition-colors"
                title={`Automated check detected ${pendingCount} new change${pendingCount > 1 ? "s" : ""}. Click to dismiss.`}
              >
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-accent" />
                </span>
                {pendingCount} new{pendingCount > 1 ? "s" : ""}
              </button>
            )}
            <CheckButton
              onClick={handleCheckAll}
              checking={checkingAll}
              disabled={acts.length === 0 || checkingAll}
            />
            <button
              onClick={() => setShowAddForm(true)}
              className="bg-accent hover:bg-accent-light text-white font-medium px-4 py-2 rounded-lg text-sm transition-all hover:shadow-[0_0_22px_-4px_rgba(124,92,252,0.8)] flex items-center gap-1.5"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              <span className="hidden sm:inline">Watch New Act</span>
            </button>
          </div>
        </div>
      </header>

      {/* Stats Bar */}
      {acts.length > 0 && !loading && (
        <div className="bg-background/60 backdrop-blur-xl border-b border-white/[0.06]">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <div className="flex flex-wrap items-center gap-6 text-sm">
              <div className="flex items-center gap-2 text-muted">
                <span className="w-2 h-2 rounded-full bg-federal" />
                <span>{federalCount} Federal</span>
              </div>
              <div className="flex items-center gap-2 text-muted">
                <span className="w-2 h-2 rounded-full bg-vic" />
                <span>{vicCount} Victorian</span>
              </div>
              <div className="flex items-center gap-2 text-muted">
                <span className="w-2 h-2 rounded-full bg-accent" />
                <span>{totalChanges} change{totalChanges !== 1 ? "s" : ""} this week</span>
              </div>
              <div className="flex items-center gap-2 text-muted ml-auto">
                <svg className="w-4 h-4 text-foreground/40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 16h-1v-4h-1m1-4h.01M12 20a8 8 0 100-16 8 8 0 000 16z" />
                </svg>
                <span className="hidden sm:inline">Last updated: {new Date().toLocaleDateString("en-AU", { month: "short", day: "numeric" })}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Search & Filter bar */}
        {acts.length > 0 && !loading && (
          <div className="flex flex-wrap items-center gap-3 mb-6">
            <div className="relative flex-1 min-w-64">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground/30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-2a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                placeholder="Search acts…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-background/60 border border-white/[0.08] rounded-lg text-sm text-foreground placeholder:text-foreground/30 focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent/60"
              />
            </div>
            <div className="flex items-center gap-1 bg-background/60 border border-white/[0.08] rounded-lg p-1">
              {(["all", "federal", "vic"] as const).map((j) => (
                <button
                  key={j}
                  onClick={() => setJurisdictionFilter(j)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                    jurisdictionFilter === j
                      ? "bg-accent/20 text-accent"
                      : "text-foreground/50 hover:text-foreground/80"
                  }`}
                >
                  {j === "all" ? "All" : j === "federal" ? "Federal" : "VIC"}
                </button>
              ))}
            </div>
            {(searchQuery || jurisdictionFilter !== "all") && (
              <button
                onClick={() => { setSearchQuery(""); setJurisdictionFilter("all"); }}
                className="text-xs text-faint hover:text-foreground transition-colors flex items-center gap-1"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                Clear
              </button>
            )}
          </div>
        )}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="bg-surface/70 rounded-xl border border-white/[0.06] p-5 animate-pulse">
                <div className="h-5 skeleton w-3/4 mb-3 rounded" />
                <div className="h-3.5 skeleton w-full mb-2 rounded" />
                <div className="h-3.5 skeleton w-1/2 mb-4 rounded" />
                <div className="flex gap-2">
                  <div className="h-6 skeleton w-16 rounded-full" />
                  <div className="h-6 skeleton w-20 rounded-full" />
                </div>
              </div>
            ))}
          </div>
        ) : acts.length === 0 ? (
          <div className="text-center py-24">
            <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-surface border border-white/[0.06] flex items-center justify-center">
              <svg className="w-8 h-8 text-foreground/30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold mb-2">No Acts being monitored</h2>
            <p className="text-foreground/50 max-w-sm mx-auto mb-6">
              Start tracking legislation changes by adding an Act. We&apos;ll monitor for amendments and show you what changed.
            </p>
            <button
              onClick={() => setShowAddForm(true)}
              className="bg-accent hover:bg-accent-light text-white font-medium px-6 py-2.5 rounded-lg text-sm inline-flex items-center gap-2 transition-all hover:shadow-[0_0_22px_-4px_rgba(124,92,252,0.8)]"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Your First Act
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold">Watched Legislation</h2>
              {totalChanges > 0 && (
                <span className="bg-accent-amber/10 text-accent-amber px-3 py-1 rounded-full text-sm font-medium animate-fade-in inline-flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-accent-amber animate-pulse" />
                  {totalChanges} new change{totalChanges !== 1 ? "s" : ""} this week
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredActs.length === 0 && acts.length > 0 ? (
                <div className="col-span-full text-center py-12">
                  <p className="text-foreground/40">No acts match your search.</p>
                </div>
              ) : (
                filteredActs.map((act, index) => (
                  <div key={act.id} className={`animate-fade-in animate-delay-${Math.min(index * 100, 300)}`}>
                    <Link href={`/acts/${act.id}`} className="block">
                      <ActCard act={act} />
                    </Link>
                  </div>
                ))
              )}
            </div>

            {/* Add more row */}
            <div className="mt-4 flex justify-center">
              <button
                onClick={() => setShowAddForm(true)}
                className="w-full max-w-md py-3 border border-dashed border-white/10 rounded-xl text-sm text-faint hover:border-accent/60 hover:text-accent transition-colors flex items-center justify-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Watch another Act
              </button>
            </div>
          </>
        )}
      </main>

      {/* Add Act Modal */}
      {showAddForm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div
            className="modal-overlay absolute inset-0"
            onClick={() => setShowAddForm(false)}
          />
          <div className="relative bg-surface border border-white/[0.08] rounded-2xl shadow-[0_24px_80px_-24px_rgba(0,0,0,0.8)] w-full max-w-lg animate-fade-in z-10 overflow-hidden">
            <div className="bg-white/[0.03] border-b border-white/[0.06] px-6 py-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Watch New Legislation</h2>
              <button
                onClick={() => setShowAddForm(false)}
                className="text-muted hover:text-foreground transition-colors"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <AddActForm onSuccess={() => { setShowAddForm(false); fetchActs(); }} onCancel={() => setShowAddForm(false)} />
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="border-t border-white/[0.06] mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-faint">
          <p>Legislation Monitor — Automated legislative change detection</p>
          <div className="flex items-center gap-4">
            <a href="https://www.legislation.gov.au" target="_blank" rel="noopener noreferrer" className="hover:text-muted transition-colors">
              Federal Register of Legislation
            </a>
            <span>·</span>
            <a href="https://www.legislation.vic.gov.au" target="_blank" rel="noopener noreferrer" className="hover:text-muted transition-colors">
              Victorian Legislation
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
