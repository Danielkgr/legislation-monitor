"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

type Provider = "openai-compatible" | "anthropic";
type Effort = "low" | "medium" | "high";

interface LLMForm {
  enabled: boolean;
  provider: Provider;
  apiBase: string;
  model: string;
  temperature: number;
  maxTokens: number;
  anthropicModel: string;
  anthropicEffort: Effort;
}

/** What GET /api/settings returns.  The keys themselves never leave the server. */
interface LLMSettingsResponse extends LLMForm {
  hasApiKey: boolean;
  hasAnthropicApiKey: boolean;
}

/** Claude models offered here.  Both take an effort level and structured outputs. */
const CLAUDE_MODELS = [
  { id: "claude-opus-5-5", label: "Claude Opus 5.5 (default)" },
  { id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5" },
];

const EMPTY: LLMForm = {
  enabled: false,
  provider: "openai-compatible",
  apiBase: "",
  model: "",
  temperature: 0.2,
  maxTokens: 1024,
  anthropicModel: "claude-opus-5-5",
  anthropicEffort: "low",
};

function toForm(s: LLMSettingsResponse): LLMForm {
  return {
    enabled: s.enabled,
    provider: s.provider,
    apiBase: s.apiBase,
    model: s.model,
    temperature: s.temperature,
    maxTokens: s.maxTokens,
    anthropicModel: s.anthropicModel,
    anthropicEffort: s.anthropicEffort,
  };
}

const INPUT_CLASS =
  "w-full bg-background/60 border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-faint focus:outline-none focus:border-accent/60 focus:ring-1 focus:ring-accent/30 font-mono-custom";

export default function SettingsPage() {
  const [form, setForm] = useState<LLMForm>(EMPTY);
  // A new key typed by the user.  Blank means "keep the saved key".
  const [newApiKey, setNewApiKey] = useState("");
  const [hasApiKey, setHasApiKey] = useState(false);
  const [newAnthropicKey, setNewAnthropicKey] = useState("");
  const [hasAnthropicApiKey, setHasAnthropicApiKey] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/settings")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && !cancelled) {
          const llm = (data as { llm: LLMSettingsResponse }).llm;
          setForm(toForm(llm));
          setHasApiKey(llm.hasApiKey);
          setHasAnthropicApiKey(llm.hasAnthropicApiKey);
        }
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

  const save = async (extra: { clearApiKey?: boolean; clearAnthropicApiKey?: boolean } = {}) => {
    setSaving(true);
    setStatus(null);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          llm: { ...form, apiKey: newApiKey, anthropicApiKey: newAnthropicKey, ...extra },
        }),
      });
      const data = (await res.json()) as {
        success: boolean;
        error?: string;
        llm?: LLMSettingsResponse;
      };
      if (res.ok && data.success) {
        if (data.llm) {
          setHasApiKey(data.llm.hasApiKey);
          setHasAnthropicApiKey(data.llm.hasAnthropicApiKey);
        }
        setNewApiKey("");
        setNewAnthropicKey("");
        const removed = extra.clearApiKey || extra.clearAnthropicApiKey;
        setStatus({ ok: true, text: removed ? "Saved key removed." : "Settings saved." });
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
              <p className="text-xs text-white/50 hidden sm:block">
                Configure how changes are summarised
              </p>
            </div>
          </div>
          <Link
            href="/"
            className="text-xs text-faint hover:text-foreground transition-colors flex items-center gap-1"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M10 19l-7-7m0 0l7-7m-7 7h18"
              />
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
                Write a plain-English brief for each detected change with Claude, or with any
                OpenAI-compatible <span className="font-mono-custom">/chat/completions</span>{" "}
                endpoint such as a local Ollama, LM Studio or vLLM server. When this is off, or a
                model call fails, a deterministic heuristic writes the brief instead, and the brief
                says so.
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
            <Field label="Provider" hint="Where briefs come from when this is on">
              <select
                value={form.provider}
                onChange={(e) => update("provider", e.target.value as Provider)}
                className={INPUT_CLASS}
              >
                <option value="anthropic">Claude (Anthropic API)</option>
                <option value="openai-compatible">
                  OpenAI-compatible endpoint (local or cloud)
                </option>
              </select>
            </Field>

            {form.provider === "anthropic" ? (
              <>
                <Field
                  label="Anthropic API key"
                  hint={
                    hasAnthropicApiKey
                      ? "A key is saved or set in ANTHROPIC_API_KEY. Leave this blank to keep it."
                      : "Or set ANTHROPIC_API_KEY in the environment"
                  }
                >
                  <input
                    type="password"
                    value={newAnthropicKey}
                    onChange={(e) => setNewAnthropicKey(e.target.value)}
                    autoComplete="off"
                    placeholder={hasAnthropicApiKey ? "Saved key on file" : "sk-ant-..."}
                    className={INPUT_CLASS}
                  />
                </Field>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Model">
                    <select
                      value={form.anthropicModel}
                      onChange={(e) => update("anthropicModel", e.target.value)}
                      className={INPUT_CLASS}
                    >
                      {CLAUDE_MODELS.some((m) => m.id === form.anthropicModel) ? null : (
                        <option value={form.anthropicModel}>{form.anthropicModel}</option>
                      )}
                      {CLAUDE_MODELS.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.label}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Effort" hint="Low suits a short brief">
                    <select
                      value={form.anthropicEffort}
                      onChange={(e) => update("anthropicEffort", e.target.value as Effort)}
                      className={INPUT_CLASS}
                    >
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                    </select>
                  </Field>
                </div>
                <p className="text-[11px] text-faint leading-relaxed">
                  If Claude declines a request, the API retries it on Anthropic&apos;s recommended
                  fallback model, and the brief records which model wrote it.
                </p>
              </>
            ) : (
              <>
                <Field
                  label="API base URL"
                  hint="e.g. http://localhost:11434/v1 (Ollama) or https://api.openai.com/v1"
                >
                  <input
                    type="url"
                    value={form.apiBase}
                    onChange={(e) => update("apiBase", e.target.value)}
                    placeholder="https://api.openai.com/v1"
                    className="w-full bg-background/60 border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-faint focus:outline-none focus:border-accent/60 focus:ring-1 focus:ring-accent/30 font-mono-custom"
                  />
                </Field>

                <Field
                  label="API key"
                  hint={
                    hasApiKey
                      ? "A key is saved. Leave this blank to keep it, or type a new key to replace it."
                      : "Optional for local servers"
                  }
                >
                  <input
                    type="password"
                    value={newApiKey}
                    onChange={(e) => setNewApiKey(e.target.value)}
                    autoComplete="off"
                    placeholder={hasApiKey ? "Saved key on file" : "sk-..."}
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
              </>
            )}
          </div>

          <div className="flex items-center gap-3 mt-5">
            <button
              onClick={() => save()}
              disabled={saving || loading}
              className="bg-accent hover:bg-accent-light disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium px-5 py-2 rounded-lg text-sm transition-all hover:shadow-[0_0_22px_-4px_rgba(124,92,252,0.8)] flex items-center gap-1.5"
            >
              {saving && (
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
                  />
                </svg>
              )}
              {saving ? "Saving…" : "Save settings"}
            </button>
            {form.provider === "anthropic" && hasAnthropicApiKey && (
              <button
                type="button"
                onClick={() => save({ clearAnthropicApiKey: true })}
                disabled={saving || loading}
                className="text-xs text-faint hover:text-danger transition-colors disabled:opacity-50"
              >
                Remove saved key
              </button>
            )}
            {form.provider === "openai-compatible" && hasApiKey && (
              <button
                type="button"
                onClick={() => save({ clearApiKey: true })}
                disabled={saving || loading}
                className="text-xs text-faint hover:text-danger transition-colors disabled:opacity-50"
              >
                Remove saved key
              </button>
            )}
            {status && (
              <span className={`text-xs ${status.ok ? "text-success" : "text-danger"}`}>
                {status.text}
              </span>
            )}
          </div>

          {form.enabled && form.provider === "openai-compatible" && !form.apiBase && (
            <p className="text-xs text-accent-amber mt-3">
              Enabled, but no API base URL is set, so the heuristic writes every brief until an
              endpoint is configured.
            </p>
          )}
          {form.enabled &&
            form.provider === "anthropic" &&
            !hasAnthropicApiKey &&
            !newAnthropicKey && (
              <p className="text-xs text-accent-amber mt-3">
                Enabled, but no Anthropic API key is set, so the heuristic writes every brief until
                a key is saved.
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
