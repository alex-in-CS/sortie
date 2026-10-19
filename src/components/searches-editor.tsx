"use client";

import { EMPLOYMENT_TYPES, SENIORITY, newSearch, type Search } from "@/lib/schema";
import { EntryList } from "./entry-list";
import { ChoiceGroup, Field, SaveBar, Section, TagInput, TextInput, Toggle } from "./ui";
import { useSavedState } from "./use-saved-state";

const selectivityLabel = (n: number) => (n >= 80 ? "Strict" : n >= 60 ? "Balanced" : "Broad");

const MODES: { value: Search["mode"]; title: string; text: string }[] = [
  {
    value: "review",
    title: "Review first",
    text: "Sortie finds the job, tailors the resume and fills the form, then waits for your OK. Start here.",
  },
  {
    value: "auto",
    title: "Auto-apply",
    text: "Submits on its own where the form allows. Workday-style portals still wait for your click.",
  },
];

export function SearchesEditor({ initial, updatedAt }: { initial: Search[]; updatedAt: string | null }) {
  const state = useSavedState<Search[]>("/api/searches", "searches", initial, updatedAt);

  return (
    <>
      <Section
        title="Searches"
        hint="Each search runs on its own, with its own titles, bar and apply mode. Use several when you'd take quite different roles, e.g. Backend and ML engineer."
      >
        <EntryList<Search>
          items={state.value}
          onChange={state.setValue}
          addLabel="Add search"
          emptyText="No searches. Sortie won't look for jobs until you add one."
          create={() => newSearch("New search")}
          summary={(s) => ({
            title: `${s.name || "Untitled"}${s.enabled ? "" : " (paused)"}`,
            meta: [
              s.titles.length ? s.titles.join(", ") : "Any role your skills match",
              s.mode === "auto" ? "Auto-apply" : "Review first",
              `${selectivityLabel(s.minMatch)} (${s.minMatch}+)`,
            ].join(" · "),
          })}
          fields={(s, set) => (
            <>
              <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
                <Field label="Name">{(id) => <TextInput id={id} value={s.name} onChange={(e) => set({ name: e.target.value })} />}</Field>
                <Toggle checked={s.enabled} onChange={(enabled) => set({ enabled })} label="Running" />
              </div>
              <Field
                label="Job titles"
                hint="Optional. Empty means any software role your skills match. Titles in any language work."
              >
                {(id) => (
                  <TagInput
                    id={id}
                    value={s.titles}
                    onChange={(titles) => set({ titles })}
                    placeholder="Backend Engineer, Software Engineer, SDE"
                  />
                )}
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Seniority">
                  {() => <ChoiceGroup options={SENIORITY} value={s.seniority} onChange={(seniority) => set({ seniority })} />}
                </Field>
                <Field label="Employment type">
                  {() => (
                    <ChoiceGroup
                      options={EMPLOYMENT_TYPES}
                      labels={{ "full-time": "Full-time", "part-time": "Part-time" }}
                      value={s.employmentTypes}
                      onChange={(employmentTypes) => set({ employmentTypes })}
                    />
                  )}
                </Field>
              </div>
              <Field label="Skip postings mentioning" hint="Matched against title and description.">
                {(id) => (
                  <TagInput
                    id={id}
                    value={s.excludeKeywords}
                    onChange={(excludeKeywords) => set({ excludeKeywords })}
                    placeholder="unpaid, commission only, night shift"
                  />
                )}
              </Field>
              <Field
                label={`Selectivity: ${selectivityLabel(s.minMatch)}, match score ${s.minMatch}+`}
                hint="How well a job must fit your skills and preferences before Sortie spends an application on it."
              >
                {(id) => (
                  <input
                    id={id}
                    type="range"
                    min={40}
                    max={95}
                    step={5}
                    value={s.minMatch}
                    onChange={(e) => set({ minMatch: Number(e.target.value) })}
                    className="w-full accent-[var(--accent)]"
                  />
                )}
              </Field>
              <fieldset>
                <legend className="mb-1.5 text-xs font-medium text-muted">When a job qualifies</legend>
                <div className="grid gap-2 sm:grid-cols-2">
                  {MODES.map((m) => (
                    <label
                      key={m.value}
                      className={`cursor-pointer rounded-lg border p-3 transition ${
                        s.mode === m.value ? "border-accent bg-accent-soft" : "border-line hover:border-faint"
                      }`}
                    >
                      <input
                        type="radio"
                        name={`mode-${s.id}`}
                        value={m.value}
                        checked={s.mode === m.value}
                        onChange={() => set({ mode: m.value })}
                        className="sr-only"
                      />
                      <span className="block text-sm font-medium">{m.title}</span>
                      <span className="mt-0.5 block text-xs leading-5 text-muted">{m.text}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            </>
          )}
        />
      </Section>

      <SaveBar
        dirty={state.dirty}
        saving={state.saving}
        savedAt={state.savedAt}
        error={state.error}
        onSave={state.save}
        onReset={state.reset}
      />
    </>
  );
}
