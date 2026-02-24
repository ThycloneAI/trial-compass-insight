/**
 * Fetch wrapper that adds AbortController-based timeout.
 *
 * Returns the Response on success or throws:
 * - `TimeoutError` (name === 'AbortError') on timeout
 * - `FetchError` for network issues
 * - Original Response for non-ok HTTP status (caller handles)
 */

const DEFAULT_TIMEOUT_MS = 30_000; // 30 seconds

export interface FetchWithTimeoutOptions extends RequestInit {
  timeoutMs?: number;
}

export async function fetchWithTimeout(
  url: string | URL,
  opts: FetchWithTimeoutOptions = {},
): Promise<Response> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, ...fetchOpts } = opts;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url.toString(), {
      ...fetchOpts,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}
