import { useCallback, useEffect, useRef, useState } from "react";

const DEFAULT_MS = 3000;

/**
 * Shows a success state for a short duration (e.g. green alert), with timer cleanup.
 */
export function useTimedTableRefreshSuccess(durationMs = DEFAULT_MS) {
  const [successVisible, setSuccessVisible] = useState(false);
  const timerRef = useRef(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current != null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => () => clearTimer(), [clearTimer]);

  const showSuccess = useCallback(() => {
    clearTimer();
    setSuccessVisible(true);
    timerRef.current = window.setTimeout(() => {
      setSuccessVisible(false);
      timerRef.current = null;
    }, durationMs);
  }, [clearTimer, durationMs]);

  const hideSuccess = useCallback(() => {
    clearTimer();
    setSuccessVisible(false);
  }, [clearTimer]);

  return { successVisible, showSuccess, hideSuccess, clearTimer };
}
