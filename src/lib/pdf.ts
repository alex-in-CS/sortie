import "server-only";
import { chromium, type Browser } from "playwright-core";

// HTML → PDF with the Chrome already installed on this machine (D-052), through
// playwright-core: no browser download, no install script. SORTIE_CHROME_PATH
// points at another Chromium-based browser if Chrome isn't installed.

let browser: Promise<Browser> | null = null;

// The same Chrome, for the form step too (headless to check, visible for you to submit).
export const launchChrome = (headless = true) =>
  chromium.launch({
    ...(process.env.SORTIE_CHROME_PATH ? { executablePath: process.env.SORTIE_CHROME_PATH } : { channel: "chrome" }),
    headless,
  });

const launch = () => launchChrome();

export async function htmlToPdf(html: string): Promise<Buffer> {
  browser ??= launch().catch((err) => {
    browser = null;
    throw new Error(
      `Couldn't start Chrome to make the PDF (${(err as Error).message.split("\n")[0]}). Install Google Chrome or set SORTIE_CHROME_PATH.`,
    );
  });
  const b = await browser;
  const page = await b.newPage();
  try {
    await page.setContent(html, { waitUntil: "load" });
    return await page.pdf({ format: "A4", printBackground: true, preferCSSPageSize: true });
  } finally {
    await page.close();
  }
}

export async function closePdf() {
  const b = browser;
  browser = null;
  if (b) await (await b.catch(() => null))?.close();
}
