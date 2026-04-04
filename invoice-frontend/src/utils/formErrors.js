import React, { useEffect, useRef } from "react";

/** Default auto-dismiss delay for PDF / new-tab pop-up related alerts (ms). */
export const POPUP_RELATED_ALERT_DISMISS_MS = 8000;

/** Turn API error into a string or field map for display. */
export function formatApiError(err) {
  if (!err) return "Something went wrong.";
  const d = err.data;
  if (d?.errors && typeof d.errors === "object") {
    return d.errors;
  }
  return err.message || String(err);
}

export function ErrorAlert({ error }) {
  if (!error) return null;
  if (typeof error === "string") {
    return <div className="alert alert-error">{error}</div>;
  }
  const entries = Object.entries(error);
  if (entries.length === 0) return null;
  return (
    <div className="alert alert-error">
      <strong>Please fix the following:</strong>
      <ul className="error-list">
        {entries.map(([field, msg]) => (
          <li key={field}>
            <code>{field}</code>: {msg}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Same as ErrorAlert, but clears string errors after `dismissMs` (e.g. pop-up blocked, PDF open failures).
 * Object-shaped field errors are not auto-dismissed. Uses a ref for onDismiss so the timer is not reset every render.
 */
export function ErrorAlertAutoDismiss({
  error,
  onDismiss,
  dismissMs = POPUP_RELATED_ALERT_DISMISS_MS,
}) {
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  useEffect(() => {
    if (error == null || error === "") return undefined;
    if (typeof error !== "string") return undefined;
    const id = window.setTimeout(() => {
      onDismissRef.current?.();
    }, dismissMs);
    return () => window.clearTimeout(id);
  }, [error, dismissMs]);

  return <ErrorAlert error={error} />;
}
