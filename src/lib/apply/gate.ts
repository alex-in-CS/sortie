import { AI } from "../llm";
import type { Search } from "../schema";
import type { FillResult, PlannedField } from "./types";

// The auto-submit gate (D-056), apart from the browser code so the pages and
// tests can use it.

// Sortie sends an application on its own only when nothing about it needs a
// person: the search is in auto mode, the owner switched auto-submit on, every
// value came from a rule or the answer bank (none from Claude), every field
// read back correctly, and no CAPTCHA puzzle is showing. Returns why not, or null.
export function autoSubmitBlocker(a: {
  mode: Search["mode"] | "review";
  enabled: boolean;
  plan: PlannedField[];
  fill: FillResult[];
  challenge: boolean;
}): string | null {
  if (a.mode !== "auto") return "This search is in review mode: you submit.";
  if (!a.enabled) return "Auto-submit is off (set SORTIE_AUTO_SUBMIT=on to allow it).";
  if (a.plan.some((p) => p.state === "missing" || p.state === "decide")) return "Some questions need your answer.";
  const claude = a.plan.filter((p) => p.state === "ok" && p.by === "claude").length;
  if (claude) return `${AI} answered ${claude} question${claude === 1 ? "" : "s"}: check before sending.`;
  const failed = a.fill.filter((f) => !f.ok).length;
  if (failed) return `${failed} field${failed === 1 ? "" : "s"} didn't fill cleanly.`;
  if (a.challenge) return "The form is showing a CAPTCHA.";
  return null;
}

export const autoSubmitEnabled = () => /^(on|true|1|yes)$/i.test(process.env.SORTIE_AUTO_SUBMIT ?? "");
