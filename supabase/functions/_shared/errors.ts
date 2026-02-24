/**
 * Standardised error responses for all Edge Functions.
 *
 * - Generic public messages (no internal details leaked).
 * - Structured JSON body with `error`, `errorCode`, optional `message`.
 * - Correct HTTP status codes per error type.
 */

import type { Logger } from './logger.ts';

export interface ErrorResponseBody {
  error: string;
  errorCode: string;
  message?: string;
}

/**
 * Build a safe JSON Response from an unknown caught error.
 * Internal details are logged but NOT returned to the client.
 */
export function buildErrorResponse(
  error: unknown,
  opts: {
    status?: number;
    publicMessage?: string;
    errorCode?: string;
    corsHeaders: Record<string, string>;
    log?: Logger;
    context?: string;
  },
): Response {
  const status = opts.status ?? 500;
  const internalMsg = error instanceof Error ? error.message : String(error);

  // Always log the real error server-side
  opts.log?.error(opts.context ?? 'unhandled_error', {
    internalError: internalMsg,
    status,
  });

  const body: ErrorResponseBody = {
    error: opts.publicMessage ?? publicMessageForStatus(status),
    errorCode: opts.errorCode ?? errorCodeForStatus(status),
  };

  return new Response(JSON.stringify(body), {
    status,
    headers: { ...opts.corsHeaders, 'Content-Type': 'application/json' },
  });
}

/**
 * Build a validation-error response (400) with field-level detail.
 * Validation errors are safe to show to clients since they describe
 * the request shape, not internal state.
 */
export function buildValidationErrorResponse(
  validationErrors: string,
  corsHeaders: Record<string, string>,
  log?: Logger,
): Response {
  log?.warn('validation_error', { details: validationErrors });

  const body: ErrorResponseBody = {
    error: 'Invalid request',
    errorCode: 'VALIDATION_ERROR',
    message: validationErrors,
  };

  return new Response(JSON.stringify(body), {
    status: 400,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/**
 * Build a rate-limit-exceeded response (429).
 */
export function buildRateLimitResponse(
  corsHeaders: Record<string, string>,
  rateLimitHeaders: Record<string, string>,
): Response {
  const body: ErrorResponseBody = {
    error: 'Rate limit exceeded. Please try again later.',
    errorCode: 'RATE_LIMIT_EXCEEDED',
  };

  return new Response(JSON.stringify(body), {
    status: 429,
    headers: { ...corsHeaders, ...rateLimitHeaders, 'Content-Type': 'application/json' },
  });
}

/**
 * Build a timeout response (504).
 */
export function buildTimeoutResponse(
  corsHeaders: Record<string, string>,
  timeoutSec: number,
): Response {
  const body: ErrorResponseBody = {
    error: `Request timed out after ${timeoutSec} seconds`,
    errorCode: 'TIMEOUT',
  };

  return new Response(JSON.stringify(body), {
    status: 504,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function publicMessageForStatus(status: number): string {
  switch (status) {
    case 400: return 'Bad request';
    case 404: return 'Resource not found';
    case 413: return 'Payload too large';
    case 429: return 'Rate limit exceeded';
    case 502: return 'Upstream service error';
    case 503: return 'Service temporarily unavailable';
    case 504: return 'Request timed out';
    default:  return 'An unexpected error occurred. Please try again.';
  }
}

function errorCodeForStatus(status: number): string {
  switch (status) {
    case 400: return 'BAD_REQUEST';
    case 404: return 'NOT_FOUND';
    case 413: return 'PAYLOAD_TOO_LARGE';
    case 429: return 'RATE_LIMIT_EXCEEDED';
    case 502: return 'UPSTREAM_ERROR';
    case 503: return 'SERVICE_UNAVAILABLE';
    case 504: return 'TIMEOUT';
    default:  return 'INTERNAL_ERROR';
  }
}
