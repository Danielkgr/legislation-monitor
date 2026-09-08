"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface LLMForm {
  enabled: boolean;
  apiBase: string;
  apiKey: string;
  model: string;
  temperature: number;
  maxTokens: number;
}

const EMPTY: LLMForm = {
  enabled: false,
  apiBase: "",
  apiKey: "",
  model: "",
  temperature: 0.2,
  maxTokens: 1024,
};

export default function SettingsPage() {
  const [form, setForm] = useState<LLMForm>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/settings")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && !cancelled) setForm((data as { llm: LLMForm }).llm);
      })
      .catch((err) => console.error("Failed to load settings:", err))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const update = <K extends keyof LLMForm>(key: K, value: LLMForm[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const save = async () => {
    setSaving(true);
    setStatus(null);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ llm: form }),
      });
      const data = (await res.json()) as { success: boolean; error?: string };
      if (res.ok && data.success) {
        setStatus({ ok: true, text: "Settings saved." });
      } else {
        setStatus({ ok: false, text: data.error || "Failed to save settings." });
      }
    } catch (err) {
      console.error("Failed to save settings:", err);
      setStatus({ ok: false, text: "Failed to save settings." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="bg-background/75 backdrop-blur-xl sticky top-0 z-50 border-b border-white/[0.06]">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center font-bold text-white text-sm shadow-[0_0_20px_-4px_rgba(124,92,252,0.8)]">
              LM
            </div>
            <div>
              <h1 className="text-lg font-semibold tracking-tight">Settings</h1>
              <p className="text-xs text-white/50 hidden sm:block">Configure how changes are summarised</p>
            </div>
          </div>
          <Link
            href="/"
            className="text-xs text-faint hover:text-foreground transition-colors flex items-center gap-1"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Dashboard
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* AI summaries card */}
        <section className="bg-surface/70 rounded-xl border border-white/[0.06] p-5">
          <div className="flex items-center justify-between gap-4 mb-4">
            <div>
              <h2 className="text-sm font-semibold">AI change summaries</h2>
              <p className="text-xs text-muted mt-1 leading-relaxed max-w-lg">
                Generate plain-English briefs for each detected change using any
                OpenAI-compatible <span className="font-mono-custom">/chat/completions</span> endpoint
                — a cloud provider or a local server (Ollama, LM Studio, vLLM).
                When disabled, a deterministic auto-summary is used instead.
              </p>
            </div>
            {/* Enable toggle */}
            <button
              type="button"
              role="switch"
              aria-checked={form.enabled}
              onClick={() => update("enabled", !form.enabled)}
              className={`relative inline-flex shrink-0 items-center h-6 w-11 rounded-full transition-colors ${
                form.enabled ? "bg-accent" : "bg-white/10"
              }`}
            >
              <span
                className={`inline-block h-4 w-4 rounded-full bg-white transform transition-transform ${
                  form.enabled ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </div>

          <div className="grid gap-4">
            <Field label="API base URL" hint="e.g. http://localhost:11434/v1 (Ollama) or https://api.openai.com/v1">
              <input
                type="url"
                value={form.apiBase}
                onChange={(e) => update("apiBase", e.target.value)}
                placeholder="https://api.openai.com/v1"
                className="w-full bg-background/60 border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-faint focus:outline-none focus:border-accent/60 focus:ring-1 focus:ring-accent/30 font-mono-custom"
              />
            </Field>

            <Field label="API key" hint="Optional for local servers">
              <input
                type="password"
                value={form.apiKey}
                onChange={(e) => update("apiKey", e.target.value)}
                placeholder="sk-…"
                className="w-full bg-background/60 border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-faint focus:outline-none focus:border-accent/60 focus:ring-1 focus:ring-accent/30 font-mono-custom"
              />
            </Field>

            <Field label="Model" hint="e.g. llama3.1, mistral-small, gpt-4o-mini">
              <input
                type="text"
                value={form.model}
                onChange={(e) => update("model", e.target.value)}
                placeholder="llama3.1"
                className="w-full bg-background/60 border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-faint focus:outline-none focus:border-accent/60 focus:ring-1 focus:ring-accent/30 font-mono-custom"
              />
            </Field>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Temperature" hint="0 = deterministic, 1 = creative">
                <input
                  type="number"
                  min={0}
                  max={2}
                  step={0.1}
                  value={form.temperature}
                  onChange={(e) => update("temperature", Number(e.target.value))}
                  className="w-full bg-background/60 border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-accent/60 focus:ring-1 focus:ring-accent/30 font-mono-custom"
                />
              </Field>
              <Field label="Max tokens" hint="Upper bound on response length">
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={form.maxTokens}
                  onChange={(e) => update("maxTokens", Number(e.target.value))}
                  className="w-full bg-background/60 border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-accent/60 focus:ring-1 focus:ring-accent/30 font-mono-custom"
                />
              </Field>
            </div>
          </div>

          <div className="flex items-center gap-3 mt-5">
            <button
              onClick={save}
              disabled={saving || loading}
              className="bg-accent hover:bg-accent-light disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium px-5 py-2 rounded-lg text-sm transition-all hover:shadow-[0_0_22px_-4px_rgba(124,92,252,0.8)] flex items-center gap-1.5"
            >
              {saving && (
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                </svg>
              )}
              {saving ? "Saving…" : "Save settings"}
            </button>
            {status && (
              <span className={`text-xs ${status.ok ? "text-success" : "text-danger"}`}>{status.text}</span>
            )}
          </div>

          {form.enabled && !form.apiBase && (
            <p className="text-xs text-accent-amber mt-3">
              Enabled, but no API base URL set — briefs will fall back to the automatic summary until an endpoint is configured.
            </p>
          )}
        </section>
      </main>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-foreground/50 mb-1.5">{label}</span>
      {children}
      {hint && <span className="block text-[11px] text-faint mt-1">{hint}</span>}
    </label>
  );
}
