"use client";

import Link from "next/link";
import { useState } from "react";
import type { ApplicationStatus } from "@/lib/schema";
import { Button } from "./ui";

const LABEL: Record<ApplicationStatus, string> = {
  queued: "being prepared",
  tailoring: "being tailored",
  ready: "being prepared",
  applying: "filling the form",
  held: "ready to submit",
  submitting: "open in Chrome",
  submitted: "submitted",
  needs_you: "needs you",
  skipped: "skipped",
};

// "Apply" on a job row: queues it for tailoring, outside the bar and the caps.
export function ApplyButton({
  jobId,
  searchId,
  existing,
}: {
  jobId: number;
  searchId: string;
  existing: ApplicationStatus | null;
}) {
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">(existing ? "done" : "idle");
  const [label, setLabel] = useState<ApplicationStatus | null>(existing);

  async function apply() {
    setState("busy");
    const res = await fetch("/api/applications", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jobId, searchId }),
    }).catch(() => null);
    if (!res?.ok) return setState("error");
    setLabel("queued");
    setState("done");
  }

  if (state === "done")
    return (
      <Link href="/applications" className="self-end whitespace-nowrap text-xs text-muted underline-offset-2 hover:underline sm:self-auto">
        In Applications ({label ? LABEL[label] : "added"})
      </Link>
    );
  return (
    <div className="flex flex-col items-end gap-1 self-end sm:self-auto">
      <Button onClick={apply} disabled={state === "busy"} className="whitespace-nowrap">
        {state === "busy" ? "Adding…" : "Apply"}
      </Button>
      {state === "error" && <p className="text-xs text-danger">Couldn&apos;t add it.</p>}
    </div>
  );
}
