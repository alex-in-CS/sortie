"use client";

import { useState, type ReactNode } from "react";
import { Button, Empty } from "./ui";

// A list of editable records (jobs, projects, schools) shown as collapsible rows.
export function EntryList<T extends { id: string }>({
  items,
  onChange,
  create,
  summary,
  fields,
  addLabel,
  emptyText,
}: {
  items: T[];
  onChange: (items: T[]) => void;
  create: () => T;
  summary: (item: T) => { title: string; meta?: string };
  fields: (item: T, set: (patch: Partial<T>) => void) => ReactNode;
  addLabel: string;
  emptyText: string;
}) {
  const [openId, setOpenId] = useState<string | null>(null);

  const set = (id: string) => (patch: Partial<T>) =>
    onChange(items.map((it) => (it.id === id ? { ...it, ...patch } : it)));

  const move = (index: number, by: number) => {
    const next = [...items];
    const [it] = next.splice(index, 1);
    next.splice(index + by, 0, it);
    onChange(next);
  };

  return (
    <div className="space-y-2">
      {items.length === 0 && <Empty>{emptyText}</Empty>}
      {items.map((item, i) => {
        const { title, meta } = summary(item);
        const open = openId === item.id;
        return (
          <div key={item.id} className={`rounded-lg border ${open ? "border-faint" : "border-line"}`}>
            <div className="flex items-center gap-2 px-3 py-2.5">
              <button
                type="button"
                aria-expanded={open}
                onClick={() => setOpenId(open ? null : item.id)}
                className="min-w-0 flex-1 text-left"
              >
                <span className="block truncate text-sm font-medium">{title || "Untitled"}</span>
                {meta && <span className="block truncate text-xs text-muted">{meta}</span>}
              </button>
              <Button variant="ghost" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}>
                ↑
              </Button>
              <Button variant="ghost" aria-label="Move down" disabled={i === items.length - 1} onClick={() => move(i, 1)}>
                ↓
              </Button>
            </div>
            {open && (
              <div className="space-y-4 border-t border-line px-3 py-4">
                {fields(item, set(item.id))}
                <div className="flex justify-end">
                  <Button variant="danger" onClick={() => onChange(items.filter((it) => it.id !== item.id))}>
                    Delete
                  </Button>
                </div>
              </div>
            )}
          </div>
        );
      })}
      <Button
        onClick={() => {
          const fresh = create();
          onChange([...items, fresh]);
          setOpenId(fresh.id);
        }}
      >
        + {addLabel}
      </Button>
    </div>
  );
}
