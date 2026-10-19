"use client";

import type { Certification, Education, Experience, Profile, Project } from "@/lib/schema";
import { EntryList } from "./entry-list";
import { ResumeUpload, type ResumeInfo } from "./resume-upload";
import { SkillsEditor } from "./skills-editor";
import { Field, SaveBar, Section, TagInput, TextArea, TextInput } from "./ui";
import { useSavedState } from "./use-saved-state";

const span = (start: string, end: string | null) => [start, end ?? "present"].filter(Boolean).join(" – ");

function Lines({ id, value, onChange, rows = 4 }: { id: string; value: string[]; onChange: (v: string[]) => void; rows?: number }) {
  return (
    <TextArea id={id} rows={rows} value={value.join("\n")} onChange={(e) => onChange(e.target.value.split("\n"))} />
  );
}

function DateRange({
  start,
  end,
  set,
}: {
  start: string;
  end: string | null;
  set: (patch: { start?: string; end?: string | null }) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <Field label="Start" hint="YYYY-MM or YYYY">
        {(id) => <TextInput id={id} value={start} onChange={(e) => set({ start: e.target.value })} placeholder="2023-06" />}
      </Field>
      <Field label="End" hint="Leave empty if current">
        {(id) => (
          <TextInput
            id={id}
            value={end ?? ""}
            onChange={(e) => set({ end: e.target.value || null })}
            placeholder="present"
          />
        )}
      </Field>
    </div>
  );
}

export function ProfileEditor({
  initial,
  updatedAt,
  resume,
}: {
  initial: Profile;
  updatedAt: string | null;
  resume: ResumeInfo | null;
}) {
  const state = useSavedState<Profile>("/api/profile", "profile", initial, updatedAt);
  const p = state.value;
  const set = (patch: Partial<Profile>) => state.setValue({ ...p, ...patch });
  const setContact = (patch: Partial<Profile["contact"]>) => set({ contact: { ...p.contact, ...patch } });

  return (
    <>
      <Section
        title="Resume"
        hint="Sortie reads it into the profile below. Re-uploading only adds what's missing, so your edits are kept."
      >
        <ResumeUpload
          current={resume}
          blocked={state.dirty ? "Save or discard your edits before uploading." : null}
          onParsed={(profile, at) => state.replace(profile, at)}
        />
      </Section>

      <Section title="Contact" hint="Used to fill application forms. Recruiters reply to this email and phone.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name">
            {(id) => <TextInput id={id} value={p.contact.fullName} onChange={(e) => setContact({ fullName: e.target.value })} />}
          </Field>
          <Field label="Location">
            {(id) => (
              <TextInput
                id={id}
                value={p.contact.location}
                onChange={(e) => setContact({ location: e.target.value })}
                placeholder="Bengaluru, India"
              />
            )}
          </Field>
          <Field label="Email">
            {(id) => (
              <TextInput id={id} type="email" value={p.contact.email} onChange={(e) => setContact({ email: e.target.value })} />
            )}
          </Field>
          <Field label="Phone" hint="With country code">
            {(id) => (
              <TextInput
                id={id}
                type="tel"
                value={p.contact.phone}
                onChange={(e) => setContact({ phone: e.target.value })}
                placeholder="+91 98765 43210"
              />
            )}
          </Field>
          <Field label="Links" hint="LinkedIn, GitHub, portfolio. Paste URLs." className="sm:col-span-2">
            {(id) => (
              <TagInput
                id={id}
                value={p.contact.links.map((l) => l.url)}
                onChange={(urls) =>
                  setContact({
                    links: urls.map((url) => p.contact.links.find((l) => l.url === url) ?? { label: labelFor(url), url }),
                  })
                }
                placeholder="https://github.com/you"
              />
            )}
          </Field>
          <Field label="Headline" className="sm:col-span-2">
            {(id) => (
              <TextInput
                id={id}
                value={p.headline}
                onChange={(e) => set({ headline: e.target.value })}
                placeholder="Software engineer, backend and AI systems"
              />
            )}
          </Field>
          <Field label="Summary" className="sm:col-span-2">
            {(id) => <TextArea id={id} rows={3} value={p.summary} onChange={(e) => set({ summary: e.target.value })} />}
          </Field>
        </div>
      </Section>

      <Section
        title={`Skills · ${p.skills.length}`}
        hint="Everything you can do. Jobs are matched against this list, and tailored resumes only ever claim skills from here. Click a skill to set its level."
      >
        <SkillsEditor skills={p.skills} onChange={(skills) => set({ skills })} />
      </Section>

      <Section title="Experience">
        <EntryList<Experience>
          items={p.experience}
          onChange={(experience) => set({ experience })}
          addLabel="Add role"
          emptyText="No roles yet."
          create={() => ({
            id: crypto.randomUUID(),
            company: "",
            title: "",
            location: "",
            start: "",
            end: null,
            bullets: [],
            skills: [],
          })}
          summary={(e) => ({
            title: [e.title, e.company].filter(Boolean).join(" · "),
            meta: [span(e.start, e.end), e.location].filter(Boolean).join(" · "),
          })}
          fields={(e, setE) => (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Title">{(id) => <TextInput id={id} value={e.title} onChange={(ev) => setE({ title: ev.target.value })} />}</Field>
                <Field label="Company">
                  {(id) => <TextInput id={id} value={e.company} onChange={(ev) => setE({ company: ev.target.value })} />}
                </Field>
                <Field label="Location">
                  {(id) => <TextInput id={id} value={e.location} onChange={(ev) => setE({ location: ev.target.value })} />}
                </Field>
                <DateRange start={e.start} end={e.end} set={setE} />
              </div>
              <Field label="What you did" hint="One bullet per line. Keep numbers real; tailoring rewords these but never invents.">
                {(id) => <Lines id={id} rows={5} value={e.bullets} onChange={(bullets) => setE({ bullets })} />}
              </Field>
              <Field label="Skills used">{(id) => <TagInput id={id} value={e.skills} onChange={(skills) => setE({ skills })} />}</Field>
            </>
          )}
        />
      </Section>

      <Section title="Projects">
        <EntryList<Project>
          items={p.projects}
          onChange={(projects) => set({ projects })}
          addLabel="Add project"
          emptyText="No projects yet."
          create={() => ({ id: crypto.randomUUID(), name: "", url: "", description: "", bullets: [], skills: [] })}
          summary={(pr) => ({ title: pr.name, meta: pr.skills.slice(0, 5).join(", ") })}
          fields={(pr, setP) => (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Name">{(id) => <TextInput id={id} value={pr.name} onChange={(ev) => setP({ name: ev.target.value })} />}</Field>
                <Field label="URL">{(id) => <TextInput id={id} value={pr.url} onChange={(ev) => setP({ url: ev.target.value })} />}</Field>
              </div>
              <Field label="Description">
                {(id) => <TextArea id={id} rows={2} value={pr.description} onChange={(ev) => setP({ description: ev.target.value })} />}
              </Field>
              <Field label="Highlights" hint="One per line">
                {(id) => <Lines id={id} value={pr.bullets} onChange={(bullets) => setP({ bullets })} />}
              </Field>
              <Field label="Skills used">{(id) => <TagInput id={id} value={pr.skills} onChange={(skills) => setP({ skills })} />}</Field>
            </>
          )}
        />
      </Section>

      <Section title="Education">
        <EntryList<Education>
          items={p.education}
          onChange={(education) => set({ education })}
          addLabel="Add education"
          emptyText="No education yet."
          create={() => ({ id: crypto.randomUUID(), school: "", degree: "", field: "", start: "", end: null, grade: "" })}
          summary={(e) => ({
            title: [e.degree, e.field].filter(Boolean).join(", ") || e.school,
            meta: [e.school, span(e.start, e.end)].filter(Boolean).join(" · "),
          })}
          fields={(e, setE) => (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="School">{(id) => <TextInput id={id} value={e.school} onChange={(ev) => setE({ school: ev.target.value })} />}</Field>
              <Field label="Degree">{(id) => <TextInput id={id} value={e.degree} onChange={(ev) => setE({ degree: ev.target.value })} />}</Field>
              <Field label="Field of study">
                {(id) => <TextInput id={id} value={e.field} onChange={(ev) => setE({ field: ev.target.value })} />}
              </Field>
              <Field label="Grade / GPA">{(id) => <TextInput id={id} value={e.grade} onChange={(ev) => setE({ grade: ev.target.value })} />}</Field>
              <div className="sm:col-span-2">
                <DateRange start={e.start} end={e.end} set={setE} />
              </div>
            </div>
          )}
        />
      </Section>

      <Section title="Certifications">
        <EntryList<Certification>
          items={p.certifications}
          onChange={(certifications) => set({ certifications })}
          addLabel="Add certification"
          emptyText="No certifications yet."
          create={() => ({ id: crypto.randomUUID(), name: "", issuer: "", year: "" })}
          summary={(c) => ({ title: c.name, meta: [c.issuer, c.year].filter(Boolean).join(" · ") })}
          fields={(c, setC) => (
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Name">{(id) => <TextInput id={id} value={c.name} onChange={(ev) => setC({ name: ev.target.value })} />}</Field>
              <Field label="Issuer">{(id) => <TextInput id={id} value={c.issuer} onChange={(ev) => setC({ issuer: ev.target.value })} />}</Field>
              <Field label="Year">{(id) => <TextInput id={id} value={c.year} onChange={(ev) => setC({ year: ev.target.value })} />}</Field>
            </div>
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

function labelFor(url: string) {
  const host = url.replace(/^https?:\/\//, "").split("/")[0].replace(/^www\./, "");
  if (host.includes("linkedin")) return "LinkedIn";
  if (host.includes("github")) return "GitHub";
  return host || "Link";
}
