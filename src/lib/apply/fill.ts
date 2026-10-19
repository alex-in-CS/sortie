import type { Locator, Page } from "playwright-core";
import type { ApplyProvider, FillResult, PlannedField } from "./types";

// Puts a plan into a live form and reads every value back (D-056). It never
// clicks submit; that's `submit()` below, and only the caller decides.

export type Files = { resume: string | null; cover: string | null };

const attr = (s: string) => s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
const byName = (name: string) => `[name="${attr(name)}"]`;
const byId = (id: string) => `[id="${attr(id)}"]`;
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

const SEARCH = 8_000; // how long a dropdown gets to show a match (city and school search remotely)

async function exists(l: Locator) {
  return (await l.count()) > 0;
}

// The option that is `value`, or starts with it as whole words ("India" →
// "India +91", "Bengaluru" → "Bengaluru, Karnataka, India"). Never a looser
// match: "India" must not pick "British Indian Ocean Territory".
export function matchOption(texts: string[], value: string): number {
  const v = norm(value);
  const exact = texts.findIndex((t) => norm(t) === v);
  if (exact >= 0) return exact;
  return texts.findIndex((t) => {
    const n = norm(t);
    return n.startsWith(v) && !/[a-z0-9]/i.test(n.charAt(v.length));
  });
}

// Greenhouse's dropdowns (react-select): type, then click the option. Tries
// each value in turn; options load as you type, so give each a moment.
async function pickFromDropdown(page: Page, input: Locator, values: string[]): Promise<string | null> {
  for (const value of values) {
    // Clicking an open menu closes it and fill() doesn't reopen it, so start
    // each try closed and empty, then type key by key as a person would.
    await input.fill("");
    await input.press("Escape");
    await input.click();
    await input.pressSequentially(value, { delay: 15 });
    const options = page.getByRole("option");
    // Remote searches (city, school) answer after a debounce, and may first
    // show stale options or "No options": poll until a match shows or time's up.
    const until = Date.now() + SEARCH;
    let texts: string[] = [];
    let i = -1;
    while (Date.now() < until) {
      texts = (await options.allTextContents()).map((t) => t.trim());
      i = matchOption(texts, value);
      if (i >= 0) break;
      await page.waitForTimeout(400);
    }
    if (i < 0) continue;
    await options.nth(i).click();
    return texts[i];
  }
  // Close the menu so it doesn't cover the next field.
  await input.fill("").catch(() => {});
  await input.press("Escape").catch(() => {});
  await page.locator("body").click({ position: { x: 1, y: 1 } }).catch(() => {});
  return null;
}

async function shownValue(input: Locator) {
  // The chosen option is rendered next to the input inside the dropdown's control.
  const control = input.locator("xpath=ancestor::div[contains(@class,'control')][1]");
  return (await exists(control)) ? ((await control.textContent()) ?? "").trim() : "";
}

async function fillGreenhouse(page: Page, f: PlannedField, files: Files): Promise<FillResult> {
  const done = (ok: boolean, note: string | null = null): FillResult => ({ key: f.key, label: f.label, ok, note });
  if (f.kind === "checkbox") {
    let ok = true;
    for (const v of f.value) {
      const i = f.options.indexOf(v);
      const id = f.optionKeys?.[i];
      const box = page.locator(id ? byId(`${f.key}[]_${id}`) : `${byName(`${f.key}[]`)}[value="${attr(v)}"]`);
      if (!(await exists(box))) {
        ok = false;
        continue;
      }
      await box.check();
      ok = ok && (await box.isChecked());
    }
    return done(ok, ok ? null : "Couldn't tick every option");
  }

  const input = page.locator(byId(f.key)).first();
  // The API can list an optional field the page leaves out (Stripe has no Discipline).
  if (!(await exists(input))) return f.required ? done(false, "Not on the page") : done(true, "Not on this form; left out");

  if (f.kind === "file") {
    const path = f.value[0] === "cover" ? files.cover : files.resume;
    if (!path) return done(false, "No file");
    await input.setInputFiles(path);
    // Greenhouse swaps the input for the file's name once it has the file.
    const name = path.split(/[\\/]/).pop()!;
    const shown = await page
      .getByText(name, { exact: true })
      .first()
      .waitFor({ timeout: SEARCH })
      .then(
        () => true,
        () => false,
      );
    const held = shown || ((await exists(input)) && (await input.evaluate((e) => (e as HTMLInputElement).files?.length ?? 0, null, { timeout: 2_000 })) > 0);
    return done(held, held ? null : "Upload didn't take");
  }
  if (f.kind === "select" || f.kind === "search") {
    const tries = [f.value[0], ...(f.fallbacks ?? [])];
    const picked = await pickFromDropdown(page, input, tries);
    if (!picked) return done(false, `No option matching ${tries.map((t) => `"${t}"`).join(" or ")}`);
    const shown = await shownValue(input);
    // The control can show less than the option did (the phone country shows just "+91").
    const same = !shown || norm(shown).includes(norm(picked)) || norm(picked).includes(norm(shown));
    return done(same, picked === f.value[0] ? null : `Picked "${picked}"`);
  }
  await input.fill(f.value[0]);
  return done((await input.inputValue()) === f.value[0]);
}

async function fillLever(page: Page, f: PlannedField, files: Files): Promise<FillResult> {
  const done = (ok: boolean, note: string | null = null): FillResult => ({ key: f.key, label: f.label, ok, note });
  const sel = byName(f.key);
  if (f.kind === "radio" || f.kind === "checkbox") {
    let ok = true;
    for (const v of f.value) {
      const box = page.locator(`${sel}[value="${attr(v)}"]`);
      if (!(await exists(box))) {
        ok = false;
        continue;
      }
      await box.check();
      ok = ok && (await box.isChecked());
    }
    return done(ok, ok ? null : "Couldn't choose every option");
  }
  const el = page.locator(sel).first();
  if (!(await exists(el))) return done(false, "Not on the page");
  if (f.kind === "file") {
    const path = f.value[0] === "cover" ? files.cover : files.resume;
    if (!path) return done(false, "No file");
    await el.setInputFiles(path);
    const n = await el.evaluate((e) => (e as HTMLInputElement).files?.length ?? 0);
    return done(n > 0, n > 0 ? null : "Upload didn't take");
  }
  if (f.kind === "select") {
    await el.selectOption({ label: f.value[0] });
    const chosen = await el.evaluate((e) => (e as HTMLSelectElement).selectedOptions[0]?.textContent?.trim() ?? "");
    return done(chosen === f.value[0]);
  }
  await el.fill(f.value[0]);
  return done((await el.inputValue()) === f.value[0]);
}

// Lever reads an uploaded resume and pre-fills the form from it; upload first
// and let that settle, so our values (from the profile) are the ones that stay.
async function leverResumeFirst(page: Page, plan: PlannedField[], files: Files, results: FillResult[], waitMs: number) {
  const resume = plan.find((f) => f.key === "resume" && f.state === "ok");
  if (!resume) return plan;
  results.push(await fillLever(page, resume, files));
  await page
    .waitForFunction(() => (document.querySelector('input[name="resumeStorageId"]') as HTMLInputElement | null)?.value, null, { timeout: waitMs })
    .catch(() => {});
  return plan.filter((f) => f !== resume);
}

// Boards upload a file as soon as it is attached (Lever even reads it into its
// own storage), so the checking pass doesn't attach: it only confirms the
// upload field is there. Files go in when the application is really sent.
async function checkUpload(page: Page, provider: ApplyProvider, f: PlannedField, files: Files): Promise<FillResult> {
  const path = f.value[0] === "cover" ? files.cover : files.resume;
  const there = await exists(page.locator(provider === "greenhouse" ? byId(f.key) : byName(f.key)));
  const ok = there && !!path;
  return { key: f.key, label: f.label, ok, note: !there ? "Upload field not on the page" : !path ? "No file" : "Attached when you submit" };
}

export async function fillForm(
  page: Page,
  provider: ApplyProvider,
  plan: PlannedField[],
  files: Files,
  { resumeWaitMs = 20_000, upload = true } = {},
): Promise<FillResult[]> {
  const results: FillResult[] = [];
  let todo = plan.filter((f) => f.state === "ok");
  if (!upload) {
    for (const f of todo.filter((x) => x.kind === "file")) results.push(await checkUpload(page, provider, f, files));
    todo = todo.filter((x) => x.kind !== "file");
  } else if (provider === "lever") todo = await leverResumeFirst(page, todo, files, results, resumeWaitMs);
  for (const f of todo) {
    try {
      results.push(await (provider === "greenhouse" ? fillGreenhouse(page, f, files) : fillLever(page, f, files)));
    } catch (err) {
      results.push({ key: f.key, label: f.label, ok: false, note: (err as Error).message.split("\n")[0] });
    }
  }
  return results;
}

// ---------- submitting ----------

export async function challengeVisible(page: Page) {
  // A CAPTCHA puzzle (not the invisible badge) means a person must take over (D-013).
  for (const sel of ['iframe[src*="recaptcha/api2/bframe"]', 'iframe[src*="recaptcha/enterprise/bframe"]', 'iframe[src*="hcaptcha"][src*="challenge"]', 'iframe[title*="challenge" i]']) {
    const frames = page.locator(sel);
    for (let i = 0; i < (await frames.count()); i++) if (await frames.nth(i).isVisible()) return true;
  }
  return false;
}

const CONFIRMED = /thank(s| you) for (applying|your application|your interest)|application (has been )?(submitted|received)|we('ve| have) received your application/i;

export async function confirmed(page: Page) {
  if (/\/(confirmation|thanks|thank-you)\b/i.test(page.url())) return true;
  const text = await page.locator("body").innerText().catch(() => "");
  return CONFIRMED.test(text);
}

// Waits for the confirmation page, for up to `ms`. False on timeout or if the
// window was closed.
export async function waitForConfirmation(page: Page, ms: number) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    if (page.isClosed()) return false;
    if (await confirmed(page).catch(() => false)) return true;
    await page.waitForTimeout(1500).catch(() => {});
  }
  return false;
}

export async function submit(page: Page): Promise<"submitted" | "challenge" | "no-button" | "unconfirmed"> {
  const button = page.locator('button[type="submit"], #btn-submit, input[type="submit"]').filter({ hasText: /submit|apply/i }).first();
  const any = (await exists(button)) ? button : page.locator('button[type="submit"], #btn-submit').first();
  if (!(await exists(any))) return "no-button";
  await any.click();
  const until = Date.now() + 30_000;
  while (Date.now() < until) {
    if (await confirmed(page)) return "submitted";
    if (await challengeVisible(page)) return "challenge";
    await page.waitForTimeout(1000);
  }
  return "unconfirmed";
}
