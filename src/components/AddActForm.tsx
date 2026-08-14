"use client";

import { useState } from "react";

interface AddActFormProps {
  onSuccess: () => void;
  onCancel: () => void;
}

export default function AddActForm({ onSuccess, onCancel }: AddActFormProps) {
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [jurisdiction, setJurisdiction] = useState<"federal" | "vic">("federal");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !url.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/acts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), url: url.trim(), jurisdiction }),
      });

      if (res.ok) {
        onSuccess();
      } else {
        const data = await res.json();
        setError(data.error || "Failed to add Act");
      }
    } catch (err) {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // Quick-fill presets
  const presets = {
    federal: [
      { title: "Privacy Act 1988", url: "https://www.legislation.gov.au/Details/C2024C00026" },
      { title: "Corporations Act 2001", url: "https://www.legislation.gov.au/Details/C2024C00001" },
      { title: "Work Health and Safety Act 2011", url: "https://www.legislation.gov.au/Details/C2024C00070" },
    ],
    vic: [
      { title: "Crimes Act 1958", url: "https://www.legislation.vic.gov.uk/html/in-force/act/100/1958/amends" },
      { title: "Health Practitioner Regulation National Law (Vic)", url: "https://www.legislation.vic.gov.au/html/in-force/act/324/2008/amends" },
    ],
  };

  const currentPresets = presets[jurisdiction];

  return (
    <form onSubmit={handleSubmit} className="p-6">
      {/* Jurisdiction selector */}
      <div className="mb-5">
        <label className="block text-sm font-medium text-foreground/70 mb-2">Jurisdiction</label>
        <div className="flex gap-2">
          {(["federal", "vic"] as const).map((j) => (
            <button
              key={j}
              type="button"
              onClick={() => setJurisdiction(j)}
              className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium border transition-all ${
                jurisdiction === j
                  ? j === "federal"
                    ? "bg-blue-50 border-blue-300 text-blue-700"
                    : "bg-green-50 border-green-300 text-green-700"
                  : "border-card-border text-foreground/50 hover:border-foreground/20"
              }`}
            >
              {j === "federal" ? "🏛️ Federal" : "🟢 Victoria"}
            </button>
          ))}
        </div>
      </div>

      {/* Presets */}
      <div className="mb-5">
        <label className="block text-sm font-medium text-foreground/70 mb-2">Quick add</label>
        <div className="flex flex-wrap gap-2">
          {currentPresets.map((p) => (
            <button
              key={p.title}
              type="button"
              onClick={() => {
                setTitle(p.title);
                setUrl(p.url);
              }}
              className="text-xs px-3 py-1.5 rounded-lg border border-card-border text-foreground/60 hover:border-accent hover:text-accent transition-colors bg-surface truncate max-w-[200px]"
            >
              {p.title}
            </button>
          ))}
        </div>
      </div>

      {/* Title */}
      <div className="mb-4">
        <label htmlFor="title" className="block text-sm font-medium text-foreground/70 mb-1.5">
          Act title
        </label>
        <input
          id="title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={`e.g., Privacy Act 1988`}
          className="w-full px-3 py-2.5 border border-card-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition-all"
          required
        />
      </div>

      {/* URL */}
      <div className="mb-5">
        <label htmlFor="url" className="block text-sm font-medium text-foreground/70 mb-1.5">
          Legislation URL
        </label>
        <input
          id="url"
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder={`https://www.legislation.gov.au/Details/C2024C00001`}
          className="w-full px-3 py-2.5 border border-card-border rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition-all"
          required
        />
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3 justify-end">
        <button
          type="button"
          onClick={onCancel}
          disabled={loading}
          className="px-4 py-2 text-sm font-medium text-foreground/60 hover:text-foreground transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={loading || !title.trim() || !url.trim()}
          className="bg-accent hover:bg-accent-light disabled:opacity-50 disabled:cursor-not-allowed text-bg-dark font-medium px-6 py-2 rounded-lg text-sm transition-colors"
        >
          {loading ? (
            <span className="inline-flex items-center gap-2">
              <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Adding...
            </span>
          ) : (
            "Start Watching"
          )}
        </button>
      </div>
    </form>
  );
}
