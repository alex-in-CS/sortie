"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "./ui";

type Status = "queued" | "running" | "done" | "failed" | null;

// Queues a fetch for the worker and polls until it finishes, then refreshes the page.
export function FetchButton({ initial }: { initial: Status }) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>(initial);
  const [error, setError] = useState<string | null>(null);
  const busy = status === "queued" || status === "running";

  useEffect(() => {
    if (!busy) return;
    const t = setInterval(async () => {
      const res = await fetch("/api/fetch").catch(() => null);
      if (!res?.ok) return;
      const { task } = await res.json();
      if (task?.status !== status) {
        setStatus(task?.status ?? null);
        if (task?.status === "done" || task?.status === "failed") router.refresh();
      }
    }, 5000);
    return () => clearInterval(t);
  }, [busy, status, router]);

  async function start() {
    setError(null);
    const res = await fetch("/api/fetch", { method: "POST" }).catch(() => null);
    if (!res?.ok) return setError("Couldn't queue the fetch.");
    setStatus((await res.json()).task?.status ?? "queued");
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button variant="primary" onClick={start} disabled={busy}>
        {status === "running" ? "Fetching…" : status === "queued" ? "Queued…" : "Fetch now"}
      </Button>
      {status === "queued" && (
        <p className="text-xs text-muted">
          Waiting for the worker. Is <code className="font-mono">npm run worker</code> running?
        </p>
      )}
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
