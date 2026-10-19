// Dry run of the form filler against a live application page. It plans answers
// from the stored profile, fills the form, reads the values back and saves a
// screenshot. It NEVER submits, and it skips file uploads, which some boards
// send to their servers as soon as a file is attached (D-037).
//
//   npm run try-apply -- greenhouse <board> <jobId> [--headed]
//   npm run try-apply -- lever <applyUrl> [--headed]
//
// Use SORTIE_DATA_DIR to point at a demo profile.
import path from "node:path";
import { chromium } from "playwright-core";

async function main() {
  const [provider, a, b] = process.argv.slice(2);
  const headed = process.argv.includes("--headed");
  const { fetchGreenhouseForm, greenhouseApplyUrl, leverFields } = await import("../src/lib/apply/forms");
  const { planForm } = await import("../src/lib/apply/plan");
  const { fillForm } = await import("../src/lib/apply/fill");
  const store = await import("../src/lib/store");

  const browser = await chromium.launch({ channel: "chrome", headless: !headed });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  let fields;
  let location = "";
  if (provider === "greenhouse") {
    fields = await fetchGreenhouseForm(a, b);
    const { fetchJson } = await import("../src/lib/sources/http");
    location = (await fetchJson<{ location?: { name?: string } }>(`https://boards-api.greenhouse.io/v1/boards/${a}/jobs/${b}`)).location?.name ?? "";
    await page.goto(greenhouseApplyUrl(a, b), { waitUntil: "networkidle" });
  } else if (provider === "lever") {
    await page.goto(a, { waitUntil: "domcontentloaded" });
    fields = await leverFields(page);
  } else throw new Error("provider must be greenhouse or lever");

  const plan = planForm(fields, {
    profile: store.profileStore.get().value,
    answers: store.answersStore.get().value,
    prefs: store.preferencesStore.get().value,
    job: { company: "", title: "", location, countryCodes: [] },
    documents: { resume: true, coverLetter: true },
  });
  console.log(`Job location: ${location || "(unknown)"}\n`);
  for (const p of plan) console.log(`${p.state.padEnd(7)} ${p.label.slice(0, 70).padEnd(70)} ${p.value.join(" | ")}  (${p.source})`);

  const results = await fillForm(page, provider as "greenhouse" | "lever", plan, { resume: "resume.pdf", cover: "cover.pdf" }, { upload: false });
  console.log("\nFill results:");
  for (const r of results) console.log(`${r.ok ? "ok  " : "FAIL"} ${r.label.slice(0, 70)}${r.note ? `  (${r.note})` : ""}`);
  const shot = path.join(process.cwd(), `try-apply-${provider}.png`);
  await page.screenshot({ path: shot, fullPage: true });
  console.log(`\nScreenshot: ${shot}\nNothing was submitted.`);
  if (headed) await page.waitForTimeout(60_000);
  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
