"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

// Local edit buffer for a document that is saved with PUT to `url`.
export function useSavedState<T>(url: string, key: string, initial: T, initialSavedAt: string | null) {
  const [saved, setSaved] = useState(initial);
  const [value, setValue] = useState(initial);
  const [savedAt, setSavedAt] = useState(initialSavedAt);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty = useMemo(() => JSON.stringify(saved) !== JSON.stringify(value), [saved, value]);

  const save = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(url, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(value),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `Save failed (${res.status})`);
      setSaved(body[key]);
      setValue(body[key]);
      setSavedAt(body.updatedAt);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }, [url, key, value]);

  // Replace both copies, e.g. after the server merged an uploaded resume.
  const replace = useCallback((next: T, at: string) => {
    setSaved(next);
    setValue(next);
    setSavedAt(at);
  }, []);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  return {
    value,
    setValue,
    dirty,
    saving,
    savedAt,
    error,
    save,
    reset: () => setValue(saved),
    replace,
  };
}
