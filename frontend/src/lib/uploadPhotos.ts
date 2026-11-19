/**
 * Reliable phone photo uploads: one photo per request, at most `concurrency`
 * requests in flight, each attempt capped at `timeoutMs`, and transient failures
 * (network errors, timeouts, 408/429/5xx) retried with backoff.
 */

export const RETRY_DELAYS_MS = [1000, 3000, 6000];
export const ATTEMPT_TIMEOUT_MS = 60_000;

export class UploadError extends Error {
  constructor(message: string, readonly status?: number, readonly retryable = false) {
    super(message);
    this.name = "UploadError";
  }
}

const isRetryableStatus = (s: number) => s === 408 || s === 429 || s >= 500;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** POST one file; resolves with the URLs the server returns. Throws UploadError. */
async function uploadOnce(url: string, file: File, headers: HeadersInit, timeoutMs: number): Promise<string[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const data = new FormData();
    data.append("files", file);
    let res: Response;
    try {
      res = await fetch(url, { method: "POST", headers, body: data, signal: controller.signal });
    } catch {
      throw new UploadError(controller.signal.aborted ? "timed out" : "network error", undefined, true);
    }
    if (!res.ok) {
      const msg =
        res.status === 413 ? "photo too large for the server (HTTP 413)" : `HTTP ${res.status}`;
      throw new UploadError(msg, res.status, isRetryableStatus(res.status));
    }
    const urls = await res.json();
    if (!Array.isArray(urls) || urls.length === 0) throw new UploadError("empty server response", res.status, true);
    return urls as string[];
  } finally {
    clearTimeout(timer);
  }
}

/** Upload with automatic retries (1s, 3s, 6s). 401/413 and other 4xx are not retried. */
export async function uploadWithRetry(
  url: string,
  file: File,
  getHeaders: () => HeadersInit,
  opts: { delays?: number[]; timeoutMs?: number; onRetry?: (attempt: number, err: UploadError) => void } = {}
): Promise<string[]> {
  const delays = opts.delays ?? RETRY_DELAYS_MS;
  for (let attempt = 0; ; attempt++) {
    try {
      return await uploadOnce(url, file, getHeaders(), opts.timeoutMs ?? ATTEMPT_TIMEOUT_MS);
    } catch (e) {
      const err = e instanceof UploadError ? e : new UploadError(String(e));
      if (!err.retryable || attempt >= delays.length) throw err;
      opts.onRetry?.(attempt + 1, err);
      await sleep(delays[attempt]);
    }
  }
}

/** Run `worker` over `items` in order with at most `limit` running at once. */
export async function runPool<T>(items: T[], limit: number, worker: (item: T, index: number) => Promise<void>) {
  let next = 0;
  const lanes = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      await worker(items[i], i);
    }
  });
  await Promise.all(lanes);
}
