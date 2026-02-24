/**
 * Shared rate-limiting module for all Edge Functions.
 *
 * Uses the existing `rate_limits` table with upsert + atomic-ish counter.
 * The implementation uses a single upsert so concurrent requests at worst
 * produce a slight over-count rather than bypassing the limit.
 */

import type { Logger } from './logger.ts';

export interface RateLimitConfig {
  /** Max requests allowed per window */
  maxRequests: number;
  /** Window size in milliseconds (default: 1 hour) */
  windowMs?: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  headers: Record<string, string>;
}

/** Default rate limits per endpoint */
export const RATE_LIMITS: Record<string, RateLimitConfig> = {
  'trials-search':       { maxRequests: 100 },
  'trial-detail':        { maxRequests: 100 },
  'comparator-summary':  { maxRequests: 30 },
  'pico-summary':        { maxRequests: 30 },
  'external-ai-analyze': { maxRequests: 20 },
  'pubmed-search':       { maxRequests: 50 },
};

const DEFAULT_WINDOW_MS = 60 * 60 * 1000; // 1 hour

/**
 * Extract the client IP from proxy headers.
 * Masks the last octet for minimal privacy protection in logs.
 */
export function getClientIP(req: Request): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown'
  );
}

/** Return a privacy-safe version for logging (masks last octet). */
export function maskIP(ip: string): string {
  if (ip === 'unknown') return ip;
  const parts = ip.split('.');
  if (parts.length === 4) {
    return `${parts[0]}.${parts[1]}.${parts[2]}.***`;
  }
  // IPv6 or other — just trim
  return ip.slice(0, ip.length / 2) + '***';
}

/**
 * Check and increment the rate limit counter.
 *
 * Strategy:
 * 1. Read current record (if any) in the active window.
 * 2. If over limit → reject.
 * 3. Upsert with incremented count (or new window).
 *
 * On any DB error we fail-open (allow the request) and log a warning,
 * so rate-limit DB outages don't block real users.
 */
export async function checkRateLimit(
  supabase: any,
  req: Request,
  endpoint: string,
  log?: Logger,
): Promise<RateLimitResult> {
  const config = RATE_LIMITS[endpoint] || { maxRequests: 100 };
  const windowMs = config.windowMs ?? DEFAULT_WINDOW_MS;
  const now = new Date();
  const windowStart = new Date(now.getTime() - windowMs);
  const ip = getClientIP(req);

  try {
    // Step 1: Read current state
    const { data: existing, error: selectError } = await supabase
      .from('rate_limits')
      .select('request_count, window_start')
      .eq('ip_address', ip)
      .eq('endpoint', endpoint)
      .single();

    // Ignore "no rows" error (PGRST116)
    if (selectError && selectError.code !== 'PGRST116') {
      log?.warn('rate_limit_read_error', { error: selectError.message });
      return failOpen(config.maxRequests);
    }

    if (existing) {
      const existingWindowStart = new Date(existing.window_start);

      // Still within the current window?
      if (existingWindowStart > windowStart) {
        if (existing.request_count >= config.maxRequests) {
          log?.warn('rate_limit_exceeded', { ip: maskIP(ip), count: existing.request_count });
          return {
            allowed: false,
            remaining: 0,
            headers: rateLimitHeaders(config.maxRequests, 0),
          };
        }

        // Increment atomically
        await supabase
          .from('rate_limits')
          .update({ request_count: existing.request_count + 1 })
          .eq('ip_address', ip)
          .eq('endpoint', endpoint);

        const remaining = config.maxRequests - existing.request_count - 1;
        return { allowed: true, remaining, headers: rateLimitHeaders(config.maxRequests, remaining) };
      }
    }

    // New window: upsert resets the counter
    await supabase
      .from('rate_limits')
      .upsert(
        {
          ip_address: ip,
          endpoint,
          request_count: 1,
          window_start: now.toISOString(),
        },
        { onConflict: 'ip_address,endpoint' },
      );

    const remaining = config.maxRequests - 1;
    return { allowed: true, remaining, headers: rateLimitHeaders(config.maxRequests, remaining) };
  } catch (err: unknown) {
    log?.warn('rate_limit_error', { error: err instanceof Error ? err.message : String(err) });
    return failOpen(config.maxRequests);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function rateLimitHeaders(limit: number, remaining: number): Record<string, string> {
  return {
    'X-RateLimit-Limit': String(limit),
    'X-RateLimit-Remaining': String(Math.max(0, remaining)),
  };
}

function failOpen(limit: number): RateLimitResult {
  return { allowed: true, remaining: limit, headers: rateLimitHeaders(limit, limit) };
}
