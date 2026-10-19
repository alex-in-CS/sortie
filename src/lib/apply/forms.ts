import type { Page } from "playwright-core";
import { fetchJson } from "../sources/http";
import type { FormField } from "./types";

// Readers: a provider's application form → FormFields (D-054).

// ---------- Greenhouse: the public Job Board API lists every question ----------

type GhField = { name: string; type: string; values?: { label: string; value: number | string }[] };
type GhQuestion = { label: string; required: boolean; fields: GhField[] };
export type GhJob = {
  questions?: GhQuestion[];
  location_questions?: GhQuestion[];
  education?: string | null;
  compliance?: { type: string; questions?: GhQuestion[] }[] | null;
  demographic_questions?: { questions?: { label: string; required: boolean; answer_options?: { label: string; id: number }[]; type?: string; id: number }[] } | null;
};

export const greenhouseApplyUrl = (board: string, jobId: string) =>
  `https://job-boards.greenhouse.io/embed/job_app?for=${encodeURIComponent(board)}&token=${encodeURIComponent(jobId)}`;

function ghQuestion(q: GhQuestion): FormField | null {
  // A question can offer alternatives (a file or pasted text): the first real field wins.
  const f = q.fields.find((x) => x.type !== "input_hidden");
  if (!f) return null;
  const label = q.label.replace(/\s+/g, " ").trim();
  const values = f.values ?? [];
  const kind: FormField["kind"] | null =
    f.type === "input_text"
      ? "text"
      : f.type === "textarea"
        ? "textarea"
        : f.type === "input_file"
          ? "file"
          : f.type === "multi_value_single_select"
            ? "select"
            : f.type === "multi_value_multi_select"
              ? "checkbox"
              : null;
  if (!kind) return null;
  return {
    key: f.name.replace(/\[\]$/, ""),
    label,
    kind,
    required: q.required,
    options: values.map((v) => v.label),
    optionKeys: values.length ? values.map((v) => String(v.value)) : undefined,
  };
}

export function greenhouseFields(job: GhJob): FormField[] {
  const fields: FormField[] = [];
  for (const q of job.questions ?? []) {
    const f = ghQuestion(q);
    if (f) fields.push(f);
  }
  // The phone field comes with a country picker the API doesn't list.
  const phone = fields.findIndex((f) => f.key === "phone");
  if (phone >= 0)
    fields.splice(phone, 0, { key: "country", label: "Country (for phone)", kind: "search", required: fields[phone].required, options: [] });
  // Hidden latitude/longitude questions mean the form asks for a city.
  if (job.location_questions?.some((q) => q.required))
    fields.push({ key: "candidate-location", label: "Location (City)", kind: "search", required: true, options: [] });
  if (job.education === "education_required" || job.education === "education_optional") {
    const required = job.education === "education_required";
    fields.push(
      { key: "school--0", label: "School", kind: "search", required, options: [] },
      { key: "degree--0", label: "Degree", kind: "search", required, options: [] },
      { key: "discipline--0", label: "Discipline", kind: "search", required: false, options: [] },
    );
  }
  for (const c of job.compliance ?? [])
    for (const q of c.questions ?? []) {
      const f = ghQuestion(q);
      if (f) fields.push({ ...f, kind: f.kind === "checkbox" ? "checkbox" : "select" });
    }
  for (const q of job.demographic_questions?.questions ?? [])
    fields.push({
      key: `demographic-${q.id}`,
      label: q.label,
      kind: q.type === "multi_value_multi_select" ? "checkbox" : "select",
      required: q.required,
      options: (q.answer_options ?? []).map((o) => o.label),
      optionKeys: (q.answer_options ?? []).map((o) => String(o.id)),
    });
  return fields;
}

export const fetchGreenhouseForm = (board: string, jobId: string) =>
  fetchJson<GhJob>(`https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(board)}/jobs/${encodeURIComponent(jobId)}?questions=true`).then(
    greenhouseFields,
  );

// ---------- Lever: the form is plain HTML, read from the page itself ----------

// Runs in the browser. Each question block has a label and one or more controls
// sharing a name (radio and checkbox groups).
export function readLeverDom(): FormField[] {
  const blocks = Array.from(document.querySelectorAll(".application-question, .application-additional"));
  const out: FormField[] = [];
  const seen = new Set<string>();
  for (const q of blocks) {
    const raw = (q.querySelector(".application-label")?.textContent ?? q.querySelector("label")?.textContent ?? "").replace(/\s+/g, " ").trim();
    const starred = /✱/.test(raw);
    const label = raw.replace(/✱/g, "").trim();
    const controls = Array.from(q.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>("input, textarea, select")).filter(
      (c) => c.getAttribute("type") !== "hidden" && c.getAttribute("name"),
    );
    for (const name of Array.from(new Set(controls.map((c) => c.getAttribute("name")!)))) {
      if (seen.has(name) || /h-captcha|g-recaptcha/.test(name)) continue;
      seen.add(name);
      const group = controls.filter((c) => c.getAttribute("name") === name);
      const el = group[0];
      const type = (el.getAttribute("type") ?? "").toLowerCase();
      const kind: FormField["kind"] =
        el.tagName === "SELECT"
          ? "select"
          : el.tagName === "TEXTAREA"
            ? "textarea"
            : type === "file"
              ? "file"
              : type === "radio"
                ? "radio"
                : type === "checkbox"
                  ? "checkbox"
                  : "text";
      const options =
        el.tagName === "SELECT"
          ? Array.from((el as HTMLSelectElement).options)
              .filter((o) => o.value)
              .map((o) => o.textContent!.trim())
          : kind === "radio" || kind === "checkbox"
            ? group.map((c) => (c as HTMLInputElement).value)
            : [];
      out.push({
        key: name,
        label: label || name,
        kind,
        required: starred || group.some((c) => c.required),
        options,
      });
    }
  }
  return out;
}

export const leverFields = (page: Page) => page.evaluate(readLeverDom);
