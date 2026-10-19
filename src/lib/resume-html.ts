import type { Profile, TailoredResume } from "./schema";

// The resume and cover letter as print-ready HTML (FR-20). One column, real
// text, standard headings and no tables or icons, so applicant tracking systems
// parse it cleanly. Everything factual (name, contact, employers, titles, dates,
// education) comes from the profile; only wording comes from the tailoring.

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function formatMonth(d: string | null) {
  if (d === null) return "Present";
  const m = /^(\d{4})-(\d{2})/.exec(d);
  return m ? `${MONTHS[Number(m[2]) - 1] ?? ""} ${m[1]}`.trim() : d;
}
const range = (start: string, end: string | null) => [start && formatMonth(start), formatMonth(end)].filter(Boolean).join(" – ");

const STYLE = `
  @page { size: A4; margin: 14mm 16mm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 10.5pt; line-height: 1.38; color: #111; margin: 0; }
  h1 { font-size: 20pt; margin: 0 0 2pt; letter-spacing: 0.2pt; }
  .contact { font-size: 9.5pt; color: #333; margin-bottom: 2pt; }
  .headline { font-size: 11pt; font-weight: bold; color: #333; margin-bottom: 8pt; }
  h2 { font-size: 10.5pt; text-transform: uppercase; letter-spacing: 0.8pt; border-bottom: 0.75pt solid #999;
       margin: 10pt 0 5pt; padding-bottom: 1.5pt; }
  .entry { margin-bottom: 6pt; break-inside: avoid; }
  .row { display: flex; justify-content: space-between; gap: 12pt; }
  .row .when { white-space: nowrap; color: #333; }
  .sub { color: #333; }
  ul { margin: 2pt 0 0 0; padding-left: 14pt; }
  li { margin-bottom: 1.5pt; }
  p { margin: 0 0 8pt; }
  a { color: inherit; text-decoration: none; }
  .letter { font-size: 11pt; line-height: 1.5; }
  .letter .date { margin: 12pt 0; }
`;

function head(p: Profile) {
  const c = p.contact;
  const contact = [c.email, c.phone, c.location, ...c.links.map((l) => l.url.replace(/^https?:\/\/(www\.)?/, ""))]
    .filter(Boolean)
    .map(esc)
    .join(" &nbsp;·&nbsp; ");
  return `<h1>${esc(c.fullName)}</h1>${contact ? `<div class="contact">${contact}</div>` : ""}`;
}

const page = (title: string, body: string) =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(title)}</title><style>${STYLE}</style></head><body>${body}</body></html>`;

export function resumeHtml(profile: Profile, r: TailoredResume) {
  const bullets = (list: string[]) => (list.length ? `<ul>${list.map((b) => `<li>${esc(b)}</li>`).join("")}</ul>` : "");
  const tailored = new Map(r.experience.map((e) => [e.id, e.bullets]));
  const parts = [head(profile)];
  if (r.headline) parts.push(`<div class="headline">${esc(r.headline)}</div>`);
  if (r.summary) parts.push(`<h2>Summary</h2><p>${esc(r.summary)}</p>`);
  if (r.skills.length) parts.push(`<h2>Skills</h2><p>${r.skills.map(esc).join(", ")}</p>`);
  if (profile.experience.length)
    parts.push(
      "<h2>Experience</h2>" +
        profile.experience
          .map(
            (e) => `<div class="entry"><div class="row"><div><strong>${esc(e.title)}</strong>, ${esc(e.company)}${
              e.location ? `<span class="sub"> · ${esc(e.location)}</span>` : ""
            }</div><div class="when">${esc(range(e.start, e.end))}</div></div>${bullets(tailored.get(e.id) ?? e.bullets)}</div>`,
          )
          .join(""),
    );
  const projects = r.projects
    .map((t) => ({ t, p: profile.projects.find((p) => p.id === t.id) }))
    .filter((x): x is { t: (typeof r.projects)[number]; p: Profile["projects"][number] } => !!x.p);
  if (projects.length)
    parts.push(
      "<h2>Projects</h2>" +
        projects
          .map(
            ({ t, p }) =>
              `<div class="entry"><div class="row"><div><strong>${esc(p.name)}</strong>${
                p.url ? `<span class="sub"> · ${esc(p.url.replace(/^https?:\/\/(www\.)?/, ""))}</span>` : ""
              }</div></div>${bullets(t.bullets)}</div>`,
          )
          .join(""),
    );
  if (profile.education.length)
    parts.push(
      "<h2>Education</h2>" +
        profile.education
          .map(
            (e) =>
              `<div class="entry"><div class="row"><div><strong>${esc([e.degree, e.field].filter(Boolean).join(", "))}</strong>, ${esc(
                e.school,
              )}${e.grade ? `<span class="sub"> · ${esc(e.grade)}</span>` : ""}</div><div class="when">${esc(range(e.start, e.end))}</div></div></div>`,
          )
          .join(""),
    );
  if (profile.certifications.length)
    parts.push(
      `<h2>Certifications</h2><ul>${profile.certifications
        .map((c) => `<li>${esc([c.name, c.issuer, c.year].filter(Boolean).join(", "))}</li>`)
        .join("")}</ul>`,
    );
  return page(`${profile.contact.fullName} – Resume`, parts.join(""));
}

export function coverLetterHtml(profile: Profile, letter: string, company: string, today = new Date()) {
  const date = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric" }).format(today);
  const paragraphs = letter
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${esc(p)}</p>`)
    .join("");
  return page(
    `${profile.contact.fullName} – Cover letter`,
    `${head(profile)}<div class="letter"><div class="date">${esc(date)}</div><p>Dear ${esc(company)} hiring team,</p>${paragraphs}<p>Kind regards,<br>${esc(
      profile.contact.fullName,
    )}</p></div>`,
  );
}
