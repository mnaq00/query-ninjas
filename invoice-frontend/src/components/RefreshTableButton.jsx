import React from "react";

/** Hover text uses the native `title` attribute; override with `tooltip` if needed. */
export default function RefreshTableButton({
  loading,
  disabled,
  onClick,
  ariaLabel = "Refresh table",
  tooltip = "Refresh",
}) {
  return (
    <button
      type="button"
      className="btn table-section-refresh-btn"
      disabled={Boolean(disabled || loading)}
      onClick={onClick}
      aria-label={ariaLabel}
      title={tooltip}
    >
      <svg
        className={loading ? "table-refresh-icon table-refresh-icon--spinning" : "table-refresh-icon"}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
        <path d="M21 3v5h-5" />
      </svg>
    </button>
  );
}
