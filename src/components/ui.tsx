"use client";

import { useId, useState, type ReactNode } from "react";
import { formatDateTime } from "@/lib/format";

export function PageHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <header className="mb-8">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      {children && <p className="mt-1.5 max-w-2xl text-sm leading-6 text-muted">{children}</p>}
    </header>
  );
}

export function Section({
  title,
  hint,
  action,
  children,
}: {
  title: string;
  hint?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="mb-6 rounded-xl border border-line bg-panel">
      <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          {hint && <p className="mt-0.5 text-xs leading-5 text-muted">{hint}</p>}
        </div>
        {action}
      </div>
      <div className="px-5 py-5">{children}</div>
    </section>
  );
}

export function Field({
  label,
  hint,
  children,
  className = "",
}: {
  label: string;
  hint?: string;
  children: (id: string) => ReactNode;
  className?: string;
}) {
  const id = useId();
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-xs font-medium text-muted">
        {label}
      </label>
      {children(id)}
      {hint && <p className="mt-1 text-xs text-faint">{hint}</p>}
    </div>
  );
}

const inputClass =
  "w-full rounded-md border border-line bg-bg px-3 py-2 text-sm placeholder:text-faint focus:border-accent focus:outline-none";

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${inputClass} ${props.className ?? ""}`} />;
}

export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`${inputClass} leading-6 ${props.className ?? ""}`} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${inputClass} ${props.className ?? ""}`} />;
}

export function Button({
  variant = "secondary",
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" | "danger" }) {
  const styles = {
    primary: "bg-accent text-accent-ink hover:opacity-90",
    secondary: "border border-line bg-panel hover:bg-sunken",
    ghost: "text-muted hover:bg-sunken hover:text-ink",
    danger: "text-danger hover:bg-sunken",
  }[variant];
  return (
    <button
      type="button"
      {...props}
      className={`inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${styles} ${className}`}
    />
  );
}

// Free-text list editor: Enter or comma adds, pasting "a, b, c" adds all three.
export function TagInput({
  value,
  onChange,
  placeholder,
  id,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  id?: string;
}) {
  const [draft, setDraft] = useState("");

  const add = (raw: string) => {
    const items = raw
      .split(/[,\n]/)
      .map((s) => s.trim())
      .filter(Boolean);
    const seen = new Set(value.map((v) => v.toLowerCase()));
    const fresh = items.filter((i) => !seen.has(i.toLowerCase()) && seen.add(i.toLowerCase()));
    if (fresh.length) onChange([...value, ...fresh]);
    setDraft("");
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-line bg-bg px-2 py-1.5 focus-within:border-accent">
      {value.map((tag) => (
        <span key={tag} className="inline-flex items-center gap-1 rounded bg-sunken py-0.5 pl-2 pr-1 text-xs">
          {tag}
          <button
            type="button"
            aria-label={`Remove ${tag}`}
            onClick={() => onChange(value.filter((t) => t !== tag))}
            className="rounded px-1 text-faint hover:text-ink"
          >
            ×
          </button>
        </span>
      ))}
      <input
        id={id}
        value={draft}
        placeholder={value.length ? "" : placeholder}
        onChange={(e) => {
          const v = e.target.value;
          if (v.includes(",")) add(v);
          else setDraft(v);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            add(draft);
          } else if (e.key === "Backspace" && !draft && value.length) {
            onChange(value.slice(0, -1));
          }
        }}
        onBlur={() => draft && add(draft)}
        className="min-w-32 flex-1 bg-transparent py-0.5 text-sm placeholder:text-faint focus:outline-none"
      />
    </div>
  );
}

export function ChoiceGroup<T extends string>({
  options,
  value,
  onChange,
  labels,
}: {
  options: readonly T[];
  value: T[];
  onChange: (next: T[]) => void;
  labels?: Partial<Record<T, string>>;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((opt) => {
        const on = value.includes(opt);
        return (
          <button
            key={opt}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(on ? value.filter((v) => v !== opt) : [...value, opt])}
            className={`rounded-full border px-3 py-1 text-xs font-medium capitalize transition ${
              on ? "border-accent bg-accent-soft text-ink" : "border-line text-muted hover:text-ink"
            }`}
          >
            {labels?.[opt] ?? opt}
          </button>
        );
      })}
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition ${checked ? "bg-accent" : "bg-line"}`}
      >
        <span
          className={`absolute top-0.5 size-4 rounded-full bg-panel shadow transition-all ${checked ? "left-4.5" : "left-0.5"}`}
        />
      </button>
      <span>
        <span className="block text-sm">{label}</span>
        {hint && <span className="block text-xs text-muted">{hint}</span>}
      </span>
    </label>
  );
}

export function SaveBar({
  dirty,
  saving,
  savedAt,
  error,
  onSave,
  onReset,
}: {
  dirty: boolean;
  saving: boolean;
  savedAt: string | null;
  error: string | null;
  onSave: () => void;
  onReset: () => void;
}) {
  let status = savedAt ? `Saved ${formatDateTime(savedAt)}` : "Not saved yet";
  if (dirty) status = "Unsaved changes";
  return (
    <div className="fixed inset-x-0 bottom-0 z-10 border-t border-line bg-panel/95 backdrop-blur md:left-56">
      <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-4 py-3 md:px-0">
        <p className={`truncate text-xs ${error ? "text-danger" : dirty ? "text-warn" : "text-muted"}`}>
          {error ?? status}
        </p>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onReset} disabled={!dirty || saving}>
            Discard
          </Button>
          <Button variant="primary" onClick={onSave} disabled={!dirty || saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function Loading() {
  return (
    <div aria-busy className="space-y-4">
      {[0, 1].map((i) => (
        <div key={i} className="h-40 animate-pulse rounded-xl border border-line bg-panel" />
      ))}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-md border border-dashed border-line px-4 py-6 text-center text-sm text-muted">{children}</p>;
}
