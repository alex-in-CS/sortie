"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ApplicationAction } from "@/lib/applications";
import type { ApplicationStatus } from "@/lib/schema";
import { Button } from "./ui";

type Act = { action: ApplicationAction; label: string; variant?: "primary" | "danger" | "secondary"; needs?: "resume" | "plan" };

const SKIP: Act = { action: "skip", label: "Skip", variant: "danger" };
const SENT: Act = { action: "submitted", label: "I submitted it" };

const ACTIONS: Record<ApplicationStatus, Act[]> = {
  queued: [SKIP],
  tailoring: [],
  ready: [{ action: "retailor", label: "Redo documents" }, SKIP],
  applying: [],
  held: [{ action: "open", label: "Open in Chrome to submit", variant: "primary" }, { action: "refill", label: "Fill again" }, SENT, SKIP],
  submitting: [SENT, SKIP],
  submitted: [],
  needs_you: [
    { action: "retailor", label: "Try again", needs: undefined },
    { action: "open", label: "Open in Chrome", needs: "plan" },
    { action: "refill", label: "Fill again", needs: "resume" },
    SENT,
    SKIP,
  ],
  skipped: [{ action: "restore", label: "Restore" }],
};

export function ApplicationActions({
  id,
  status,
  hasResume,
  hasPlan,
  canFill,
}: {
  id: number;
  status: ApplicationStatus;
  hasResume: boolean;
  hasPlan: boolean;
  canFill: boolean; // Sortie can fill this board's forms (Greenhouse, Lever)
}) {
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

  // Needs you after a failed tailoring: only a retry makes sense. After the
  // form step: fill again, open it, or say you sent it yourself.
  const list = ACTIONS[status].filter((a) => {
    if (status !== "needs_you") return true;
    if (a.action === "retailor") return !hasResume;
    if (a.needs === "plan") return hasResume && hasPlan;
    if (a.needs === "resume") return hasResume && canFill;
    return true;
  });
  if (!list.length) return null;
  return (
    <div className="flex flex-col items-end gap-1 self-end sm:self-auto">
      <div className="flex flex-wrap justify-end gap-1 sm:max-w-56">
        {list.map((a) => (
          <Button key={a.action} variant={a.variant ?? "secondary"} disabled={busy} onClick={() => act(a.action)}>
            {a.label}
          </Button>
        ))}
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
