import { useCallback, useEffect, useRef, useState } from "react";

export type AutosaveStatus = "idle" | "saving" | "saved" | "error";

/**
 * Saves as you go (docs/plans/ui-redesign-2.md slice G): `schedule` debounces a
 * value, `flush` saves it now (blur, Enter), and the last write wins — a save
 * that finishes after a newer one started is ignored. "saved" shows for two
 * seconds, then goes quiet; an error stays until `retry` sends the same value.
 */
export function useAutosave<T>(save: (value: T) => Promise<unknown>, delay = 600) {
  const [status, setStatus] = useState<AutosaveStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const pending = useRef<T | null>(null);
  const last = useRef<T | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sequence = useRef(0);
  const settle = useRef<ReturnType<typeof setTimeout> | null>(null);

  const run = useCallback(
    async (value: T) => {
      const mine = ++sequence.current;
      last.current = value;
      // A previous save's "saved → idle" timer must not overwrite this one's status.
      if (settle.current) clearTimeout(settle.current);
      settle.current = null;
      setStatus("saving");
      setError(null);
      try {
        await save(value);
        if (mine !== sequence.current) return;
        setStatus("saved");
        if (settle.current) clearTimeout(settle.current);
        settle.current = setTimeout(() => setStatus("idle"), 2000);
      } catch (failed) {
        if (mine !== sequence.current) return;
        setStatus("error");
        setError(failed instanceof Error ? failed.message : String(failed));
      }
    },
    [save],
  );

  const flush = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const value = pending.current;
    pending.current = null;
    if (value !== null) void run(value);
  }, [run]);

  const schedule = useCallback(
    (value: T) => {
      pending.current = value;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(flush, delay);
    },
    [delay, flush],
  );

  const retry = useCallback(() => {
    if (last.current !== null) void run(last.current);
  }, [run]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      if (settle.current) clearTimeout(settle.current);
    },
    [],
  );

  return { status, error, schedule, flush, retry, saveNow: run };
}
