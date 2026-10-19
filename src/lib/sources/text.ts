import type { EmploymentType, WorkMode } from "../schema";

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
  ndash: "–",
  mdash: "—",
  hellip: "…",
  bull: "•",
};

export function decodeEntities(s: string) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

// Good enough for job descriptions: keeps paragraph and list structure, drops markup.
export function htmlToText(html: string) {
  const text = html
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<li[^>]*>/gi, "\n• ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|ul|ol|h[1-6]|tr|section)>/gi, "\n")
    .replace(/<[^>]+>/g, "");
  return decodeEntities(text)
    .replace(/[ \t ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n+(?=• )/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Workday says "Posted Today", "Posted Yesterday", "Posted 3 Days Ago", "Posted 30+ Days Ago".
export function parsePostedOn(text: string | undefined, now = new Date()): string | null {
  if (!text) return null;
  const day = 86_400_000;
  if (/today/i.test(text)) return new Date(now.getTime()).toISOString();
  if (/yesterday/i.test(text)) return new Date(now.getTime() - day).toISOString();
  const m = /(\d+)\+?\s*days?/i.exec(text);
  return m ? new Date(now.getTime() - Number(m[1]) * day).toISOString() : null;
}

export function employmentTypeFrom(label: string | null | undefined): EmploymentType | null {
  if (!label) return null;
  const l = label.toLowerCase();
  if (/intern|praktik|trainee|apprentice|stage\b/.test(l)) return "internship";
  if (/contract|temporary|fixed[- ]term|freelance|temp\b/.test(l)) return "contract";
  if (/part[- ]?time/.test(l)) return "part-time";
  if (/full[- ]?time|permanent|regular/.test(l)) return "full-time";
  return null;
}

export function workModeFrom(label: string | null | undefined): WorkMode | null {
  if (!label) return null;
  const l = label.toLowerCase();
  if (/hybrid/.test(l)) return "hybrid";
  if (/remote/.test(l)) return "remote";
  if (/on-?site|in[- ]office|office/.test(l)) return "onsite";
  return null;
}

export const isoDate = (v: string | number | null | undefined) => {
  if (v === null || v === undefined || v === "") return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

export const upperCodes = (...codes: (string | null | undefined)[]) =>
  [...new Set(codes.filter((c): c is string => !!c && /^[a-z]{2}$/i.test(c)).map((c) => c.toUpperCase()))];
