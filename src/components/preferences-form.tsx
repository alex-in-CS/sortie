"use client";

import { WORK_MODES, type Preferences } from "@/lib/schema";
import { MoneyInput } from "./money-input";
import { ChoiceGroup, Field, SaveBar, Section, TagInput, TextInput, Toggle } from "./ui";
import { useSavedState } from "./use-saved-state";

const num = (v: string) => (v === "" ? null : Number(v));
const clamp = (v: string, min: number, max: number) => Math.max(min, Math.min(max, Number(v) || min));

export function PreferencesForm({ initial, updatedAt }: { initial: Preferences; updatedAt: string | null }) {
  const state = useSavedState<Preferences>("/api/preferences", "preferences", initial, updatedAt);
  const p = state.value;
  const set = (patch: Partial<Preferences>) => state.setValue({ ...p, ...patch });

  return (
    <>
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
            <Field label="Notice period (days)" hint="0 if you can start immediately.">
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
          <Field label="Minimum salary" hint="Jobs that list pay below this are skipped. Leave empty for no floor.">
            {(id) => <MoneyInput id={id} value={p.minSalary} onChange={(minSalary) => set({ minSalary })} />}
          </Field>
          <Field label="Never apply to" hint="Applies to every search.">
            {(id) => (
              <TagInput
                id={id}
                value={p.excludeCompanies}
                onChange={(excludeCompanies) => set({ excludeCompanies })}
                placeholder="Current employer, companies you've ruled out"
              />
            )}
          </Field>
        </div>
      </Section>

      <Section
        title="Autopilot limits"
        hint="Guard rails across all searches. Recruiters see every application you send them, so more is not better."
      >
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Max applications per company" hint="Best-matching roles win.">
            {(id) => (
              <TextInput
                id={id}
                type="number"
                min={1}
                max={10}
                value={p.maxPerCompany}
                onChange={(e) => set({ maxPerCompany: clamp(e.target.value, 1, 10) })}
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
                onChange={(e) => set({ dailyLimit: clamp(e.target.value, 1, 200) })}
              />
            )}
          </Field>
        </div>
        <div className="mt-5">
          <Toggle
            checked={p.discovery}
            onChange={(discovery) => set({ discovery })}
            label="Discovery"
            hint="Besides the curated company list, search for new companies hiring for your skills."
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
