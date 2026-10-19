"use client";

import { EMPLOYMENT_TYPES, SENIORITY, WORK_MODES, type Preferences } from "@/lib/schema";
import { ChoiceGroup, Field, SaveBar, Section, Select, TagInput, TextInput, Toggle } from "./ui";
import { useSavedState } from "./use-saved-state";

const num = (v: string) => (v === "" ? null : Number(v));

export function PreferencesForm({ initial, updatedAt }: { initial: Preferences; updatedAt: string | null }) {
  const state = useSavedState<Preferences>("/api/preferences", "preferences", initial, updatedAt);
  const p = state.value;
  const set = (patch: Partial<Preferences>) => state.setValue({ ...p, ...patch });

  return (
    <>
      <Section title="Roles" hint="What to look for.">
        <div className="space-y-5">
          <Field
            label="Target roles"
            hint="Optional. Empty means any software role your skills match: backend, full-stack, data, ML, DevOps and so on."
          >
            {(id) => (
              <TagInput
                id={id}
                value={p.targetRoles}
                onChange={(targetRoles) => set({ targetRoles })}
                placeholder="Backend Engineer, Software Engineer, ML Engineer"
              />
            )}
          </Field>
          <Field label="Seniority">
            {() => <ChoiceGroup options={SENIORITY} value={p.seniority} onChange={(seniority) => set({ seniority })} />}
          </Field>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Years of professional experience">
              {(id) => (
                <TextInput
                  id={id}
                  type="number"
                  min={0}
                  step={0.5}
                  value={p.yearsOfExperience ?? ""}
                  onChange={(e) => set({ yearsOfExperience: num(e.target.value) })}
                />
              )}
            </Field>
            <Field label="Employment type">
              {() => (
                <ChoiceGroup
                  options={EMPLOYMENT_TYPES}
                  labels={{ "full-time": "Full-time", "part-time": "Part-time" }}
                  value={p.employmentTypes}
                  onChange={(employmentTypes) => set({ employmentTypes })}
                />
              )}
            </Field>
          </div>
        </div>
      </Section>

      <Section title="Location & eligibility" hint="Sortie skips jobs you can't legally take or don't want to move for.">
        <div className="space-y-5">
          <Field label="Work mode">
            {() => <ChoiceGroup options={WORK_MODES} value={p.workModes} onChange={(workModes) => set({ workModes })} />}
          </Field>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Countries" hint="Where you'd work (onsite, hybrid or remote-from).">
              {(id) => (
                <TagInput id={id} value={p.countries} onChange={(countries) => set({ countries })} placeholder="India, Singapore" />
              )}
            </Field>
            <Field label="Cities" hint="Optional. Narrows onsite and hybrid roles.">
              {(id) => (
                <TagInput id={id} value={p.cities} onChange={(cities) => set({ cities })} placeholder="Bengaluru, Hyderabad" />
              )}
            </Field>
            <Field label="Authorized to work in" hint="Without sponsorship.">
              {(id) => (
                <TagInput
                  id={id}
                  value={p.authorizedCountries}
                  onChange={(authorizedCountries) => set({ authorizedCountries })}
                  placeholder="India"
                />
              )}
            </Field>
            <Field label="Notice period (days)">
              {(id) => (
                <TextInput
                  id={id}
                  type="number"
                  min={0}
                  value={p.noticePeriodDays ?? ""}
                  onChange={(e) => set({ noticePeriodDays: num(e.target.value) })}
                />
              )}
            </Field>
          </div>
          <div className="space-y-3">
            <Toggle
              checked={p.needsSponsorshipElsewhere}
              onChange={(needsSponsorshipElsewhere) => set({ needsSponsorshipElsewhere })}
              label="I need visa sponsorship outside those countries"
              hint="Jobs that say they won't sponsor are skipped in those countries."
            />
            <Toggle
              checked={p.willingToRelocate}
              onChange={(willingToRelocate) => set({ willingToRelocate })}
              label="Willing to relocate"
            />
          </div>
        </div>
      </Section>

      <Section title="Pay & exclusions">
        <div className="space-y-5">
          <Field label="Minimum salary" hint="Only applied when a posting lists pay. Leave empty for no floor.">
            {(id) => (
              <div className="grid grid-cols-[1fr_6rem_7rem] gap-2">
                <TextInput
                  id={id}
                  type="number"
                  min={0}
                  value={p.minSalary?.amount ?? ""}
                  onChange={(e) => {
                    const amount = num(e.target.value);
                    set({
                      minSalary:
                        amount === null ? null : { currency: "INR", period: "year", ...p.minSalary, amount },
                    });
                  }}
                />
                <TextInput
                  aria-label="Currency"
                  value={p.minSalary?.currency ?? "INR"}
                  disabled={!p.minSalary}
                  onChange={(e) => p.minSalary && set({ minSalary: { ...p.minSalary, currency: e.target.value.toUpperCase() } })}
                />
                <Select
                  aria-label="Period"
                  value={p.minSalary?.period ?? "year"}
                  disabled={!p.minSalary}
                  onChange={(e) =>
                    p.minSalary && set({ minSalary: { ...p.minSalary, period: e.target.value as "year" | "month" } })
                  }
                >
                  <option value="year">per year</option>
                  <option value="month">per month</option>
                </Select>
              </div>
            )}
          </Field>
          <Field label="Never apply to">
            {(id) => (
              <TagInput
                id={id}
                value={p.excludeCompanies}
                onChange={(excludeCompanies) => set({ excludeCompanies })}
                placeholder="Current employer, companies you've ruled out"
              />
            )}
          </Field>
          <Field label="Skip postings mentioning" hint="Matched against title and description.">
            {(id) => (
              <TagInput
                id={id}
                value={p.excludeKeywords}
                onChange={(excludeKeywords) => set({ excludeKeywords })}
                placeholder="unpaid, commission only, night shift"
              />
            )}
          </Field>
        </div>
      </Section>

      <Section
        title="Autopilot limits"
        hint="Guard rails. Recruiters see every application you send them, so more is not better."
      >
        <div className="grid gap-5 sm:grid-cols-3">
          <Field label="Max applications per company" hint="Best-matching roles win.">
            {(id) => (
              <TextInput
                id={id}
                type="number"
                min={1}
                max={10}
                value={p.maxPerCompany}
                onChange={(e) => set({ maxPerCompany: Math.max(1, Math.min(10, Number(e.target.value) || 1)) })}
              />
            )}
          </Field>
          <Field label="Max applications per day">
            {(id) => (
              <TextInput
                id={id}
                type="number"
                min={1}
                max={200}
                value={p.dailyLimit}
                onChange={(e) => set({ dailyLimit: Math.max(1, Math.min(200, Number(e.target.value) || 1)) })}
              />
            )}
          </Field>
          <Field label="Auto-submit at match score ≥" hint="Below this, it waits for your OK.">
            {(id) => (
              <TextInput
                id={id}
                type="number"
                min={0}
                max={100}
                value={p.autoSubmitThreshold}
                onChange={(e) =>
                  set({ autoSubmitThreshold: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })
                }
              />
            )}
          </Field>
        </div>
        <div className="mt-5">
          <Toggle
            checked={p.discovery}
            onChange={(discovery) => set({ discovery })}
            label="Daily discovery"
            hint="Besides the curated company list, search job boards every day for new companies hiring for your skills."
          />
        </div>
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
