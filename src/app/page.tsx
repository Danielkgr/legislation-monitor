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

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="bg-bg-dark text-white sticky top-0 z-50 border-b border-white/10 no-print">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center font-bold text-bg-dark text-sm">
              LM
            </div>
            <div>
              <h1 className="text-lg font-semibold tracking-tight">Legislation Monitor</h1>
              <p className="text-xs text-white/50 hidden sm:block">Track what&apos;s changing in the law</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/docs" className="text-xs text-white/40 hover:text-white/80 transition-colors flex items-center gap-1" title="Open API documentation (Swagger UI)">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-3-3v6m-7 4h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
              <span className="hidden sm:inline">API</span>
            </Link>
            <CheckButton
              onClick={handleCheckAll}
              checking={checkingAll}
              disabled={acts.length === 0 || checkingAll}
            />
            <button
              onClick={() => setShowAddForm(true)}
              className="bg-accent hover:bg-accent-light text-bg-dark font-medium px-4 py-2 rounded-lg text-sm transition-colors flex items-center gap-1.5"
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
        <div className="bg-white border-b border-card-border">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <div className="flex flex-wrap items-center gap-6 text-sm">
              <div className="flex items-center gap-2 text-foreground/70">
                <span className="w-2 h-2 rounded-full bg-federal" />
                <span>{federalCount} Federal</span>
              </div>
              <div className="flex items-center gap-2 text-foreground/70">
                <span className="w-2 h-2 rounded-full bg-vic" />
                <span>{vicCount} Victorian</span>
              </div>
              <div className="flex items-center gap-2 text-foreground/70">
                <span className="w-2 h-2 rounded-full bg-accent" />
                <span>{totalChanges} change{totalChanges !== 1 ? "s" : ""} this week</span>
              </div>
              <div className="flex items-center gap-2 text-foreground/70 ml-auto">
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
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="bg-white rounded-xl border border-card-border p-5 animate-pulse">
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
            <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-surface flex items-center justify-center">
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
              className="bg-accent hover:bg-accent-light text-bg-dark font-medium px-6 py-2.5 rounded-lg text-sm inline-flex items-center gap-2 transition-colors"
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
                <span className="bg-accent/10 text-accent-amber px-3 py-1 rounded-full text-sm font-medium animate-fade-in inline-flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-accent-amber animate-pulse" />
                  {totalChanges} new change{totalChanges !== 1 ? "s" : ""} this week
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {acts.map((act, index) => (
                <div key={act.id} className={`animate-fade-in animate-delay-${Math.min(index * 100, 300)}`}>
                  <Link href={`/acts/${act.id}`} className="block">
                    <ActCard act={act} />
                  </Link>
                </div>
              ))}
            </div>

            {/* Add more row */}
            <div className="mt-4 flex justify-center">
              <button
                onClick={() => setShowAddForm(true)}
                className="w-full max-w-md py-3 border-2 border-dashed border-card-border rounded-xl text-sm text-foreground/40 hover:border-accent hover:text-accent transition-colors flex items-center justify-center gap-2"
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
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg animate-fade-in z-10 overflow-hidden">
            <div className="bg-bg-dark text-white px-6 py-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Watch New Legislation</h2>
              <button
                onClick={() => setShowAddForm(false)}
                className="text-white/60 hover:text-white transition-colors"
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
      <footer className="border-t border-card-border mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-foreground/40">
          <p>Legislation Monitor — Automated legislative change detection</p>
          <div className="flex items-center gap-4">
            <a href="https://www.legislation.gov.au" target="_blank" rel="noopener noreferrer" className="hover:text-foreground/70 transition-colors">
              Federal Register of Legislation
            </a>
            <span>·</span>
            <a href="https://www.legislation.vic.gov.au" target="_blank" rel="noopener noreferrer" className="hover:text-foreground/70 transition-colors">
              Victorian Legislation
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
