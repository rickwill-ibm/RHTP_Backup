// log.ts: minimal structured logger for server/lib code (mechanical hardening, Cycle 1).
//
// This is the future OpenTelemetry seam: when OTel wiring lands, only this
// module changes; call sites keep the same (event, fields) contract.
//
// Rules:
//   - `event` is a stable, machine-readable name (dot.case, e.g. 'referral.created').
//   - `fields` must be PHI-safe: ids, codes, counts, statuses. Never names, DOBs,
//     addresses, or free-text clinical notes.

type LogFields = Record<string, string | number | boolean | null | undefined>;
type Level = 'debug' | 'info' | 'warn' | 'error';

const CONSOLE: Record<Level, (msg: string) => void> = {
  // debug level rides on console.info: the JSON payload carries level:'debug',
  // and the repo gate requires zero raw log/debug console call sites.
  debug: (m) => console.info(m),
  info: (m) => console.info(m),
  warn: (m) => console.warn(m),
  error: (m) => console.error(m),
};

function emit(level: Level, event: string, fields?: LogFields): void {
  const entry: Record<string, unknown> = {
    ts: new Date().toISOString(), // wall-clock log timestamp; intentionally not the injected test clock
    level,
    event,
  };
  if (fields) {
    for (const [k, v] of Object.entries(fields)) {
      if (v !== undefined) entry[k] = v;
    }
  }
  CONSOLE[level](JSON.stringify(entry));
}

export const log = {
  debug: (event: string, fields?: LogFields) => emit('debug', event, fields),
  info: (event: string, fields?: LogFields) => emit('info', event, fields),
  warn: (event: string, fields?: LogFields) => emit('warn', event, fields),
  error: (event: string, fields?: LogFields) => emit('error', event, fields),
};

export type { LogFields };
