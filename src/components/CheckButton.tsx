interface CheckButtonProps {
  onClick: () => void;
  checking?: boolean;
  disabled?: boolean;
  size?: "sm" | "md" | "lg";
}

export default function CheckButton({ onClick, checking = false, disabled = false, size = "md" }: CheckButtonProps) {
  const sizeClasses = {
    sm: "px-3 py-1.5 text-xs gap-1.5",
    md: "px-4 py-2 text-sm gap-2",
    lg: "px-6 py-2.5 text-sm gap-2",
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled || checking}
      className={`${sizeClasses[size]} bg-surface-2/70 hover:bg-surface-2 disabled:opacity-50 disabled:cursor-not-allowed text-foreground/70 hover:text-foreground border border-white/[0.08] rounded-lg transition-all flex items-center ${checking ? "status-checking relative" : ""}`}
    >
      {checking ? (
        <>
          <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Checking...
        </>
      ) : (
        <>
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          <span className="hidden sm:inline">Check for Updates</span>
        </>
      )}
    </button>
  );
}
