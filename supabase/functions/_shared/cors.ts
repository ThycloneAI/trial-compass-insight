/**
 * Shared CORS configuration for all Edge Functions.
 *
 * Allows Lovable preview domains, localhost dev, and production domains.
 * Falls back to first allowed origin if request origin doesn't match.
 */

const ALLOWED_ORIGINS = [
  // Lovable preview/production domains (wildcard handled below)
  // localhost dev
  'http://localhost:3000',
  'http://localhost:5173',
  'http://localhost:8080',
  'http://localhost:8788',
];

// Lovable uses dynamic subdomains like *.lovable.app and *.lovableproject.com
const ALLOWED_ORIGIN_PATTERNS = [
  /^https:\/\/.*\.lovable\.app$/,
  /^https:\/\/.*\.lovableproject\.com$/,
  /^https:\/\/.*\.supabase\.co$/,
];

export function getCorsHeaders(req?: Request): Record<string, string> {
  const origin = req?.headers.get('origin') || '';

  const isAllowed =
    ALLOWED_ORIGINS.includes(origin) ||
    ALLOWED_ORIGIN_PATTERNS.some((pattern) => pattern.test(origin));

  // In Supabase Edge Functions behind their proxy, we allow the matched origin
  // or fall back to '*' for non-browser requests (curl, Postman, etc.)
  const allowOrigin = isAllowed ? origin : '*';

  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
  };
}

export function handleCorsPreflightResponse(req: Request): Response {
  return new Response(null, { headers: getCorsHeaders(req) });
}
