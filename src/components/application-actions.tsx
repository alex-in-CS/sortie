"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ApplicationAction } from "@/lib/applications";
import type { ApplicationStatus } from "@/lib/schema";
import { Button } from "./ui";

const ACTIONS: Record<ApplicationStatus, { action: ApplicationAction; label: string; variant?: "danger" | "secondary" }[]> = {
  queued: [{ action: "skip", label: "Skip", variant: "danger" }],
  tailoring: [],
  ready: [
    { action: "retailor", label: "Re-tailor" },
    { action: "skip", label: "Skip", variant: "danger" },
  ],
  needs_you: [
    { action: "retailor", label: "Try again" },
    { action: "skip", label: "Skip", variant: "danger" },
  ],
  skipped: [{ action: "restore", label: "Restore" }],
};

export function ApplicationActions({ id, status }: { id: number; status: ApplicationStatus }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function act(action: ApplicationAction) {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/applications/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action }),
    }).catch(() => null);
    setBusy(false);
    if (!res?.ok) return setError((await res?.json().catch(() => null))?.error ?? "Couldn't update it.");
    router.refresh();
  }

  return (
    <div className="flex flex-col items-end gap-1 self-end sm:self-auto">
      <div className="flex gap-1">
        {ACTIONS[status].map((a) => (
          <Button key={a.action} variant={a.variant ?? "secondary"} disabled={busy} onClick={() => act(a.action)}>
            {a.label}
          </Button>
        ))}
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
