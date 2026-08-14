interface ActCardProps {
  act: {
    id: number;
    title: string;
    url: string;
    jurisdiction: "federal" | "vic";
    version_count: number;
    last_checked: string | null;
    recent_changes: number;
  };
}

export default function ActCard({ act }: ActCardProps) {
  const jurisdictionBadge =
    act.jurisdiction === "federal"
      ? "badge-federal"
      : "badge-vic";

  const jurisdictionLabel =
    act.jurisdiction === "federal" ? "Federal" : "Victoria";

  const lastCheckedText = act.last_checked
    ? new Date(act.last_checked).toLocaleDateString("en-AU", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "Never";

  return (
    <div className="card-lift bg-white rounded-xl border border-card-border p-5 flex flex-col h-full">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <h3 className="font-semibold text-sm leading-tight line-clamp-2 flex-1">{act.title}</h3>
        <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium whitespace-nowrap ${jurisdictionBadge}`}>
          {jurisdictionLabel}
        </span>
      </div>

      {/* Meta */}
      <div className="flex items-center gap-3 text-xs text-foreground/40 mb-4 flex-wrap">
        <span className="inline-flex items-center gap-1">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 7v10c0 .6.4 1 1 1h14c.6 0 1-.4 1-1V7c0-.6-.4-1-1-1H5a1 1 0 00-1 1z" />
          </svg>
          {act.version_count} version{act.version_count !== 1 ? "s" : ""}
        </span>
        <span className="inline-flex items-center gap-1">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Checked {lastCheckedText}
        </span>
      </div>

      {/* Recent changes indicator */}
      <div className="mt-auto">
        {act.recent_changes > 0 ? (
          <div className="flex items-center gap-2 text-xs text-accent-amber bg-accent-amber/5 px-3 py-2 rounded-lg border border-accent-amber/10">
            <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
            <span className="font-medium">{act.recent_changes} amendment{act.recent_changes !== 1 ? "s" : ""} detected</span>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-xs text-foreground/30 px-3 py-2 rounded-lg bg-surface">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>No recent changes</span>
          </div>
        )}
      </div>
    </div>
  );
}
