"use client";

import { useRef, useState } from "react";
import type { Profile } from "@/lib/schema";
import { formatDate } from "@/lib/format";
import type { MergeSummary } from "@/lib/merge";

export type ResumeInfo = { filename: string; uploadedAt: string };

const ACCEPT = ".pdf,.docx,.txt,.md";

function describeAdded(a: MergeSummary) {
  const parts = [
    [a.skills, "skill"],
    [a.experience, "role"],
    [a.projects, "project"],
    [a.education, "school"],
    [a.certifications, "certification"],
  ]
    .filter(([n]) => (n as number) > 0)
    .map(([n, word]) => `${n} ${word}${n === 1 ? "" : "s"}`);
  return parts.length ? `Added ${parts.join(", ")}.` : "Nothing new; your profile already had everything on it.";
}

export function ResumeUpload({
  current,
  blocked,
  onParsed,
}: {
  current: ResumeInfo | null;
  blocked: string | null;
  onParsed: (profile: Profile, savedAt: string) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState(current);
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const upload = async (f: File) => {
    if (blocked) return setMessage({ tone: "error", text: blocked });
    setBusy(true);
    setMessage(null);
    try {
      const body = new FormData();
      body.append("file", f);
      const res = await fetch("/api/resume", { method: "POST", body });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Upload failed (${res.status})`);
      onParsed(data.profile, data.updatedAt);
      setFile({ filename: f.name, uploadedAt: new Date().toISOString() });
      setMessage({ tone: "ok", text: describeAdded(data.added) });
    } catch (err) {
      setMessage({ tone: "error", text: err instanceof Error ? err.message : "Upload failed" });
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };

  return (
    <div>
      <button
        type="button"
        disabled={busy}
        onClick={() => input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          const f = e.dataTransfer.files[0];
          if (f) upload(f);
        }}
        className={`flex w-full flex-col items-center justify-center gap-1 rounded-lg border border-dashed px-4 py-8 text-center transition ${
          over ? "border-accent bg-accent-soft" : "border-line hover:border-faint hover:bg-sunken"
        } ${busy ? "cursor-wait" : ""}`}
      >
        {busy ? (
          <>
            <span className="flex items-center gap-2 text-sm font-medium">
              <span className="size-3 animate-spin rounded-full border-2 border-accent border-t-transparent" />
              Reading your resume…
            </span>
            <span className="text-xs text-muted">This takes 20–60 seconds.</span>
          </>
        ) : (
          <>
            <span className="text-sm font-medium">{file ? "Upload a newer resume" : "Drop your resume here"}</span>
            <span className="text-xs text-muted">PDF, DOCX, TXT or Markdown, up to 10 MB</span>
          </>
        )}
      </button>
      <input
        ref={input}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) upload(f);
        }}
      />
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="text-muted">
          {file ? (
            <>
              Current: <span className="font-medium text-ink">{file.filename}</span> ·{" "}
              {formatDate(file.uploadedAt)}
            </>
          ) : (
            "No resume uploaded yet."
          )}
        </span>
        {message && <span className={message.tone === "ok" ? "text-ok" : "text-danger"}>{message.text}</span>}
      </div>
    </div>
  );
}
