// One shape for application forms from every provider (D-054). Readers turn a
// provider's form into FormFields; the planner decides a value for each; the
// filler puts the values into the page.

export const APPLY_PROVIDERS = ["greenhouse", "lever"] as const;
export type ApplyProvider = (typeof APPLY_PROVIDERS)[number];

// "select" is a single choice from known options (a native select, or
// Greenhouse's dropdown); "radio" a single choice shown as buttons; "checkbox"
// any number of choices; "search" a field that suggests options as you type
// (city, school, the phone's country), whose options aren't known up front.
export type FieldKind = "text" | "textarea" | "file" | "select" | "radio" | "checkbox" | "search";

export type FormField = {
  key: string; // the provider's field name: "first_name", "question_68935294", "cards[…][field0]"
  label: string;
  kind: FieldKind;
  required: boolean;
  options: string[]; // visible option labels, for select / radio / checkbox
  optionKeys?: string[]; // the provider's id for each option, where the page needs it
};

export type ApplyForm = { provider: ApplyProvider; url: string; fields: FormField[] };

// ok: a value backed by stored data; skip: optional and nothing to say;
// missing: required and nothing stored answers it; decide: a consent or
// attestation that only the owner may give.
export type PlanState = "ok" | "skip" | "missing" | "decide";

export type PlannedField = FormField & {
  value: string[]; // text: [text]; select/radio: [option]; checkbox: options; file: ["resume" | "cover"]
  state: PlanState;
  by: "rule" | "bank" | "claude" | null;
  source: string; // where the value came from, in plain words
  // Search dropdowns whose options only appear as you type (Greenhouse's city,
  // school, degree): what to try, in order, if `value` finds no option.
  fallbacks?: string[];
};

export type FillResult = {
  key: string;
  label: string;
  ok: boolean; // read back from the page after filling
  note: string | null;
};
