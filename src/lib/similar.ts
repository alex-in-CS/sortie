import { skillOverlap } from "./match";
import type { Skill } from "./schema";
import { norm } from "./skills";

// How alike two job postings are, 0–1, so a resume tailored for one can go to
// the other instead of paying Opus again (D-060). Postings are compared on the
// skills they name (yours and the known ones you lack): the share of all named
// skills that both ask for. Postings that name too few skills to judge fall
// back to how much of their wording they share.

export const REUSE_AT = 0.5;
const MIN_SKILLS = 3;

export function skillsNamed(text: string, profile: Skill[]) {
  const { matched, missing } = skillOverlap(text, profile);
  return new Set([...matched.map((s) => norm(s.name)), ...missing.map(norm)]);
}

const STOP = new Set(
  "the and for with you your our are will this that from have has can who what all any not but its their they them into more about work team role ability experience years strong skills including such well also other using across within able etc may must should would".split(
    " ",
  ),
);

function words(text: string) {
  const counts = new Map<string, number>();
  for (const w of text.toLowerCase().match(/[a-z][a-z+#.]{2,}/g) ?? []) if (!STOP.has(w)) counts.set(w, (counts.get(w) ?? 0) + 1);
  return counts;
}

function cosine(a: Map<string, number>, b: Map<string, number>) {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (const [w, n] of a) {
    na += n * n;
    dot += n * (b.get(w) ?? 0);
  }
  for (const n of b.values()) nb += n * n;
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

export function similarity(a: string, b: string, profile: Skill[]) {
  const sa = skillsNamed(a, profile);
  const sb = skillsNamed(b, profile);
  if (sa.size >= MIN_SKILLS && sb.size >= MIN_SKILLS) {
    let both = 0;
    for (const s of sa) if (sb.has(s)) both++;
    return both / (sa.size + sb.size - both);
  }
  return cosine(words(a), words(b));
}
