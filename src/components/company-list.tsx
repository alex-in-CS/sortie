"use client";

import { useMemo, useState } from "react";
import type { Company } from "@/lib/jobs";
import { formatCount, formatDateTime } from "@/lib/format";
import { TextInput } from "./ui";

const PROVIDER_LABEL: Record<string, string> = {
  greenhouse: "Greenhouse",
  lever: "Lever",
  ashby: "Ashby",
  smartrecruiters: "SmartRecruiters",
  workday: "Workday",
};

export function CompanyList({ initial }: { initial: Company[] }) {
  const [companies, setCompanies] = useState(initial);
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);
  const shown = useMemo(
    () => companies.filter((c) => !q || c.name.toLowerCase().includes(q.toLowerCase()) || c.provider.includes(q.toLowerCase())),
    [companies, q],
  );

  async function toggle(c: Company) {
    const enabled = !c.enabled;
    setCompanies((all) => all.map((x) => (x.id === c.id ? { ...x, enabled: enabled ? 1 : 0 } : x)));
    const res = await fetch(`/api/companies/${c.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ enabled }),
    }).catch(() => null);
    if (!res?.ok) {
      setError(`Couldn't update ${c.name}.`);
      setCompanies((all) => all.map((x) => (x.id === c.id ? c : x)));
    }
  }

  const on = companies.filter((c) => c.enabled).length;
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">
          {on} of {companies.length} on
        </p>
        <TextInput className="max-w-xs" placeholder="Filter by name or ATS" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {error && <p className="mb-2 text-xs text-danger">{error}</p>}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-xs text-muted">
            <tr className="border-b border-line">
              <th className="py-2 pr-3 font-medium">On</th>
              <th className="py-2 pr-3 font-medium">Company</th>
              <th className="py-2 pr-3 font-medium">Job board</th>
              <th className="whitespace-nowrap py-2 pr-3 text-right font-medium">Open jobs</th>
              <th className="py-2 font-medium">Last checked</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((c) => (
              <tr key={c.id} className="border-b border-line last:border-0">
                <td className="py-2 pr-3">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={!!c.enabled}
                    aria-label={`Fetch ${c.name}`}
                    onClick={() => toggle(c)}
                    className={`relative h-5 w-9 rounded-full transition ${c.enabled ? "bg-accent" : "bg-line"}`}
                  >
                    <span
                      className={`absolute top-0.5 size-4 rounded-full bg-panel shadow transition-all ${c.enabled ? "left-4.5" : "left-0.5"}`}
                    />
                  </button>
                </td>
                <td className={`py-2 pr-3 font-medium ${c.enabled ? "" : "text-faint"}`}>{c.name}</td>
                <td className="py-2 pr-3 font-mono text-xs text-muted">
                  {PROVIDER_LABEL[c.provider] ?? c.provider} · {c.board}
                </td>
                <td className="py-2 pr-3 text-right tabular-nums">{c.last_job_count === null ? "–" : formatCount(c.last_job_count)}</td>
                <td className="py-2 text-xs text-muted">
                  {c.last_error?.startsWith("HTTP 429") ? (
                    <span className="text-warn" title={c.last_error}>
                      Rate-limited, resting 12 h
                    </span>
                  ) : c.last_error ? (
                    <span className="text-danger" title={c.last_error}>
                      Failed: {c.last_error}
                    </span>
                  ) : c.last_fetched_at ? (
                    formatDateTime(c.last_fetched_at)
                  ) : (
                    "Not yet"
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
