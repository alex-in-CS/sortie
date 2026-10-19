"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { PlannedField } from "@/lib/apply/types";
import { Button, Field, Select, TextArea, TextInput } from "./ui";

// The questions a form asked that nothing stored answers (or that only you may
// answer, like consent). Answers go into your answer bank, then Sortie fills
// the form again.
export function ApplicationQuestions({ id, questions }: { id: number; questions: PlannedField[] }) {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, string[]>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (key: string, v: string[]) => setValues((s) => ({ ...s, [key]: v }));
  const answered = questions.filter((q) => (values[q.key] ?? []).some((v) => v.trim())).length;

  async function save() {
    setBusy(true);
    setError(null);
    const answers = Object.entries(values).map(([key, answer]) => ({ key, answer }));
    const res = await fetch(`/api/applications/${id}/answers`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ answers }),
    }).catch(() => null);
    setBusy(false);
    if (!res?.ok) return setError((await res?.json().catch(() => null))?.error ?? "Couldn't save your answers.");
    router.refresh();
  }

  return (
    <div className="mt-3 space-y-3 rounded-md border border-warn bg-warn-soft px-3 py-3">
      <p className="text-xs">
        Answer these once. Sortie saves each answer to your answer bank and uses it on every form that asks the same
        question.
      </p>
      {questions.map((q) => (
        <Field key={q.key} label={`${q.label}${q.state === "decide" ? " (your decision)" : ""}`} hint={q.source}>
          {(fid) =>
            q.kind === "checkbox" && q.options.length ? (
              <div id={fid} className="flex flex-wrap gap-x-4 gap-y-1">
                {q.options.map((o) => {
                  const on = (values[q.key] ?? []).includes(o);
                  return (
                    <label key={o} className="flex items-center gap-1.5 text-sm">
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => set(q.key, on ? (values[q.key] ?? []).filter((x) => x !== o) : [...(values[q.key] ?? []), o])}
                      />
                      {o}
                    </label>
                  );
                })}
              </div>
            ) : q.options.length ? (
              <Select id={fid} value={values[q.key]?.[0] ?? ""} onChange={(e) => set(q.key, e.target.value ? [e.target.value] : [])}>
                <option value="">Choose…</option>
                {q.options.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </Select>
            ) : q.kind === "textarea" ? (
              <TextArea id={fid} rows={3} value={values[q.key]?.[0] ?? ""} onChange={(e) => set(q.key, [e.target.value])} />
            ) : (
              <TextInput id={fid} value={values[q.key]?.[0] ?? ""} onChange={(e) => set(q.key, [e.target.value])} />
            )
          }
        </Field>
      ))}
      <div className="flex items-center justify-end gap-3">
        {error && <p className="text-xs text-danger">{error}</p>}
        <Button variant="primary" disabled={busy || !answered} onClick={save}>
          {busy ? "Saving…" : `Save ${answered || ""} answer${answered === 1 ? "" : "s"} and fill again`}
        </Button>
      </div>
    </div>
  );
}
