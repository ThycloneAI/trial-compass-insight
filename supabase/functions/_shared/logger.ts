/**
 * Structured JSON logging utility for Edge Functions.
 *
 * Outputs one JSON object per log line so Supabase / any log aggregator can
 * parse, filter, and alert on them.  Every request gets a traceId so you can
 * correlate all log lines from a single invocation.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  ts: string;
  level: LogLevel;
  fn: string;          // function name, e.g. "trials-search"
  traceId: string;
  msg: string;
  durationMs?: number;
  [key: string]: unknown;
}

/** Generate a short trace ID (8 hex chars) for per-request correlation. */
export function newTraceId(): string {
  return crypto.randomUUID().slice(0, 8);
}

/** Create a scoped logger bound to a specific function + traceId. */
export function createLogger(fn: string, traceId: string) {
  const write = (level: LogLevel, msg: string, extra?: Record<string, unknown>) => {
    const entry: LogEntry = {
      ts: new Date().toISOString(),
      level,
      fn,
      traceId,
      msg,
      ...extra,
    };
    // Use appropriate console method for level so Supabase log viewer
    // can filter by severity.
    if (level === 'error') {
      console.error(JSON.stringify(entry));
    } else if (level === 'warn') {
      console.warn(JSON.stringify(entry));
    } else {
      console.log(JSON.stringify(entry));
    }
  };

  return {
    debug: (msg: string, extra?: Record<string, unknown>) => write('debug', msg, extra),
    info:  (msg: string, extra?: Record<string, unknown>) => write('info', msg, extra),
    warn:  (msg: string, extra?: Record<string, unknown>) => write('warn', msg, extra),
    error: (msg: string, extra?: Record<string, unknown>) => write('error', msg, extra),
  };
}

export type Logger = ReturnType<typeof createLogger>;
