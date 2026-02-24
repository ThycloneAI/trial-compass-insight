/**
 * Barrel export for all shared Edge Function utilities.
 *
 * Usage:
 *   import { getCorsHeaders, checkRateLimit, createLogger, ... } from '../_shared/mod.ts';
 */

export { getCorsHeaders, handleCorsPreflightResponse } from './cors.ts';
export { createLogger, newTraceId } from './logger.ts';
export type { Logger, LogLevel, LogEntry } from './logger.ts';
export { checkRateLimit, getClientIP, maskIP, RATE_LIMITS } from './rateLimit.ts';
export type { RateLimitConfig, RateLimitResult } from './rateLimit.ts';
export {
  buildErrorResponse,
  buildValidationErrorResponse,
  buildRateLimitResponse,
  buildTimeoutResponse,
} from './errors.ts';
export { fetchWithTimeout } from './fetchWithTimeout.ts';
export type { FetchWithTimeoutOptions } from './fetchWithTimeout.ts';
