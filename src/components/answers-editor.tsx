"use client";

import { DECLINE, type Answers, type CustomAnswer } from "@/lib/schema";
import { EntryList } from "./entry-list";
import { MoneyInput } from "./money-input";
import { Field, SaveBar, Section, Select, TextArea, TextInput } from "./ui";
import { useSavedState } from "./use-saved-state";

// Common screening questions that can't be answered from the profile or
// preferences. One click adds them to the bank for you to answer.
const SUGGESTED = [
  "Are you comfortable working rotational or night shifts?",
  "Are you open to travelling for work?",
  "Do you hold a valid passport?",
  "Are you willing to sign a service agreement or bond?",
  "Do you currently have any other offers?",
  "Why are you looking for a change?",
  "Are you comfortable with a background check?",
];

const EEO = {
  gender: [DECLINE, "Male", "Female", "Non-binary"],
  ethnicity: [
    DECLINE,
    "Asian",
    "Black or African American",
    "Hispanic or Latino",
    "White",
    "American Indian or Alaska Native",
    "Native Hawaiian or Other Pacific Islander",
    "Two or more races",
  ],
  veteran: [DECLINE, "I am not a protected veteran", "I identify as one or more of the classifications of protected veteran"],
  disability: [DECLINE, "No, I do not have a disability", "Yes, I have a disability"],
} as const;

const EEO_LABELS: Record<keyof typeof EEO, string> = {
  gender: "Gender",
  ethnicity: "Race / ethnicity",
  veteran: "Veteran status",
  disability: "Disability",
};

export function AnswersEditor({ initial, updatedAt }: { initial: Answers; updatedAt: string | null }) {
  const state = useSavedState<Answers>("/api/answers", "answers", initial, updatedAt);
  const a = state.value;
  const set = (patch: Partial<Answers>) => state.setValue({ ...a, ...patch });

  const asked = new Set(a.custom.map((c) => c.question.trim().toLowerCase()));
  const suggestions = SUGGESTED.filter((q) => !asked.has(q.toLowerCase()));

  return (
    <>
      <Section title="Salary" hint="Many forms make these fields mandatory.">
        <div className="space-y-5">
          <Field label="Expected salary">
            {(id) => <MoneyInput id={id} value={a.expectedSalary} onChange={(expectedSalary) => set({ expectedSalary })} />}
          </Field>
          <Field label="Current salary" hint="Leave empty to not disclose; the fallback below is used where text is allowed.">
            {(id) => <MoneyInput id={id} value={a.currentSalary} onChange={(currentSalary) => set({ currentSalary })} />}
          </Field>
          <Field label="Free-text fallback" hint="Used when a salary field accepts text and you'd rather not give a figure.">
            {(id) => (
              <TextInput id={id} value={a.salaryFallback} onChange={(e) => set({ salaryFallback: e.target.value })} />
            )}
          </Field>
        </div>
      </Section>

      <Section title="Standard questions">
        <Field label="How did you hear about us?">
          {(id) => <TextInput id={id} value={a.hearAbout} onChange={(e) => set({ hearAbout: e.target.value })} />}
        </Field>
      </Section>

      <Section
        title="Voluntary self-identification"
        hint="Mostly on US forms. Optional, never used for matching. Defaults to declining."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          {(Object.keys(EEO) as (keyof typeof EEO)[]).map((k) => (
            <Field key={k} label={EEO_LABELS[k]}>
              {(id) => (
                <Select id={id} value={a[k]} onChange={(e) => set({ [k]: e.target.value })}>
                  {EEO[k].map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          ))}
        </div>
      </Section>

      <Section
        title={`Answer bank · ${a.custom.length}`}
        hint="Anything else forms ask. When you correct an answer while reviewing an application, it lands here and is reused next time."
      >
        {suggestions.length > 0 && (
          <div className="mb-4">
            <p className="mb-2 text-xs text-muted">Common questions:</p>
            <div className="flex flex-wrap gap-1.5">
              {suggestions.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() =>
                    set({ custom: [...a.custom, { id: crypto.randomUUID(), question: q, answer: "", source: "manual" }] })
                  }
                  className="rounded-full border border-dashed border-line px-3 py-1 text-xs text-muted transition hover:border-accent hover:text-ink"
                >
                  + {q}
                </button>
              ))}
            </div>
          </div>
        )}
        <EntryList<CustomAnswer>
          items={a.custom}
          onChange={(custom) => set({ custom })}
          addLabel="Add question"
          emptyText="No saved answers yet."
          create={() => ({ id: crypto.randomUUID(), question: "", answer: "", source: "manual" })}
          summary={(c) => ({
            title: c.question,
            meta: `${c.source === "learned" ? "Learned · " : ""}${c.answer.trim() ? c.answer : "No answer yet"}`,
          })}
          fields={(c, setC) => (
            <>
              <Field label="Question">
                {(id) => <TextInput id={id} value={c.question} onChange={(e) => setC({ question: e.target.value })} />}
              </Field>
              <Field label="Your answer">
                {(id) => <TextArea id={id} rows={3} value={c.answer} onChange={(e) => setC({ answer: e.target.value })} />}
              </Field>
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
