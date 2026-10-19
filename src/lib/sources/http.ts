// Polite JSON fetching for public job feeds: an honest User-Agent, a timeout,
// a small per-host gap between requests, and retries with backoff on 429/5xx.

export const USER_AGENT = "Sortie/0.1 (personal job search; single user)";

const TIMEOUT_MS = 30_000;
const RETRIES = 3;
const HOST_GAP_MS = 400;
// A host that rate-limits us gets a wider gap for the rest of the process.
const MAX_GAP_MS = 8_000;

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly url: string,
  ) {
    super(`HTTP ${status} from ${new URL(url).host}`);
  }
}

const nextSlot = new Map<string, number>();
const hostGap = new Map<string, number>();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Serialises requests per host so a board with many pages never bursts.
async function waitForHost(host: string) {
  const now = Date.now();
  const at = Math.max(now, nextSlot.get(host) ?? 0);
  nextSlot.set(host, at + (hostGap.get(host) ?? HOST_GAP_MS));
  if (at > now) await sleep(at - now);
}

export async function fetchJson<T>(url: string, init: RequestInit = {}): Promise<T> {
  const host = new URL(url).host;
  for (let attempt = 0; ; attempt++) {
    await waitForHost(host);
    let res: Response;
    try {
      res = await fetch(url, {
        ...init,
        headers: { "user-agent": USER_AGENT, accept: "application/json", ...init.headers },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (err) {
      if (attempt < RETRIES) {
        await sleep(1000 * 2 ** attempt);
        continue;
      }
      throw err;
    }
    if (res.ok) return (await res.json()) as T;
    if ((res.status === 429 || res.status >= 500) && attempt < RETRIES) {
      const retryAfter = Number(res.headers.get("retry-after"));
      // Rate limited: back off hard (5 s, 15 s, 45 s) and hold every other request to this host too.
      const wait =
        Number.isFinite(retryAfter) && retryAfter > 0
          ? retryAfter * 1000
          : res.status === 429
            ? 5000 * 3 ** attempt
            : 1000 * 2 ** attempt;
      if (res.status === 429) {
        nextSlot.set(host, Math.max(nextSlot.get(host) ?? 0, Date.now() + wait));
        hostGap.set(host, Math.min(MAX_GAP_MS, (hostGap.get(host) ?? HOST_GAP_MS) * 4));
      }
      await sleep(wait);
      continue;
    }
    throw new HttpError(res.status, url);
  }
}

export const postJson = <T>(url: string, body: unknown) =>
  fetchJson<T>(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
