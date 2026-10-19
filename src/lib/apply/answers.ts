import "server-only";
import type { Application } from "../applications";
import { answersStore } from "../store";

// Answers you gave on the Applications page go into the answer bank (source
// "learned"), so the same question on any later form is answered the same way.
export function saveAnswers(app: Application, given: { key: string; answer: string[] }[]) {
  const plan = app.plan ?? [];
  const answers = answersStore.get().value;
  let saved = 0;
  for (const g of given) {
    const field = plan.find((p) => p.key === g.key);
    const value = g.answer.map((a) => a.trim()).filter(Boolean);
    if (!field || !value.length) continue;
    if (field.options.length && value.some((v) => !field.options.includes(v))) continue;
    const answer = value.join("\n");
    const existing = answers.custom.find((c) => c.question.trim() === field.label.trim());
    if (existing) Object.assign(existing, { answer, source: "learned" as const });
    else answers.custom.push({ id: crypto.randomUUID(), question: field.label, answer, source: "learned" });
    saved++;
  }
  if (saved) answersStore.save(answers);
  return saved;
}
