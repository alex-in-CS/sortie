"use client";

import { useState } from "react";
import { SKILL_CATEGORIES, SKILL_LEVELS, type Skill } from "@/lib/schema";
import { CATEGORY_LABELS, LEVEL_LABELS, guessCategory, norm } from "@/lib/skills";
import { Button, Empty, Select, TextInput } from "./ui";

const LEVEL_RANK = { learning: 1, working: 2, strong: 3, expert: 4 } as const;

function LevelBars({ level }: { level: Skill["level"] }) {
  return (
    <span aria-hidden className="flex items-end gap-px">
      {[1, 2, 3, 4].map((n) => (
        <span
          key={n}
          className={`w-[3px] rounded-sm ${n <= LEVEL_RANK[level] ? "bg-accent" : "bg-line"}`}
          style={{ height: 4 + n * 2 }}
        />
      ))}
    </span>
  );
}

export function SkillsEditor({ skills, onChange }: { skills: Skill[]; onChange: (s: Skill[]) => void }) {
  const [draft, setDraft] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const addFromText = (text: string) => {
    const seen = new Set(skills.map((s) => norm(s.name)));
    const fresh: Skill[] = [];
    for (const raw of text.split(/[,\n;]/)) {
      const name = raw.trim();
      if (!name || seen.has(norm(name))) continue;
      seen.add(norm(name));
      fresh.push({
        id: crypto.randomUUID(),
        name,
        category: guessCategory(name),
        level: "working",
        years: null,
        source: "manual",
      });
    }
    if (fresh.length) onChange([...skills, ...fresh]);
    setDraft("");
  };

  const update = (id: string, patch: Partial<Skill>) =>
    onChange(skills.map((s) => (s.id === id ? { ...s, ...patch } : s)));

  const groups = SKILL_CATEGORIES.map((category) => ({
    category,
    items: skills
      .filter((s) => s.category === category)
      .sort((a, b) => LEVEL_RANK[b.level] - LEVEL_RANK[a.level] || a.name.localeCompare(b.name)),
  })).filter((g) => g.items.length);

  return (
    <div>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          addFromText(draft);
        }}
      >
        <TextInput
          aria-label="Add skills"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Add skills, comma separated: Go, Kubernetes, gRPC"
        />
        <Button type="submit" disabled={!draft.trim()}>
          Add
        </Button>
      </form>

      <div className="mt-5 space-y-5">
        {groups.length === 0 && <Empty>No skills yet. Upload a resume or add them above.</Empty>}
        {groups.map(({ category, items }) => (
          <div key={category}>
            <h3 className="mb-2 font-mono text-[11px] uppercase tracking-wider text-faint">
              {CATEGORY_LABELS[category]} <span className="text-faint/70">· {items.length}</span>
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {items.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  aria-expanded={openId === s.id}
                  onClick={() => setOpenId(openId === s.id ? null : s.id)}
                  title={`${LEVEL_LABELS[s.level]}${s.years ? `, ${s.years} yrs` : ""}`}
                  className={`inline-flex items-center gap-2 rounded-md border px-2.5 py-1 text-sm transition ${
                    openId === s.id ? "border-accent bg-accent-soft" : "border-line bg-bg hover:border-faint"
                  }`}
                >
                  {s.name}
                  <LevelBars level={s.level} />
                </button>
              ))}
            </div>
            {items.some((s) => s.id === openId) && (
              <SkillDetail
                skill={items.find((s) => s.id === openId)!}
                onChange={(patch) => update(openId!, patch)}
                onRemove={() => {
                  onChange(skills.filter((s) => s.id !== openId));
                  setOpenId(null);
                }}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function SkillDetail({
  skill,
  onChange,
  onRemove,
}: {
  skill: Skill;
  onChange: (patch: Partial<Skill>) => void;
  onRemove: () => void;
}) {
  return (
    <div className="mt-2 grid grid-cols-2 gap-3 rounded-lg bg-sunken p-3 sm:grid-cols-[1fr_1fr_1fr_6rem_auto] sm:items-end">
      <label className="col-span-2 text-xs text-muted sm:col-span-1">
        Name
        <TextInput className="mt-1" value={skill.name} onChange={(e) => onChange({ name: e.target.value })} />
      </label>
      <label className="text-xs text-muted">
        Category
        <Select
          className="mt-1"
          value={skill.category}
          onChange={(e) => onChange({ category: e.target.value as Skill["category"] })}
        >
          {SKILL_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {CATEGORY_LABELS[c]}
            </option>
          ))}
        </Select>
      </label>
      <label className="text-xs text-muted">
        Level
        <Select className="mt-1" value={skill.level} onChange={(e) => onChange({ level: e.target.value as Skill["level"] })}>
          {SKILL_LEVELS.map((l) => (
            <option key={l} value={l}>
              {LEVEL_LABELS[l]}
            </option>
          ))}
        </Select>
      </label>
      <label className="text-xs text-muted">
        Years
        <TextInput
          className="mt-1"
          type="number"
          min={0}
          step={0.5}
          value={skill.years ?? ""}
          onChange={(e) => onChange({ years: e.target.value === "" ? null : Number(e.target.value) })}
        />
      </label>
      <Button variant="danger" onClick={onRemove}>
        Remove
      </Button>
    </div>
  );
}
