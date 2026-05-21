/**
 * cron.ts — Minimal 5-field cron parser (no external deps)
 *
 * Format: minute hour day-of-month month day-of-week
 *   minute        0-59
 *   hour          0-23
 *   day-of-month  1-31
 *   month         1-12
 *   day-of-week   0-6 (0 = Sunday)
 *
 * Supported syntax per field:
 *   - any value:     star
 *   - every N steps: star slash N
 *   - literal:       N
 *   - range:         N-M
 *   - list:          N,M,...
 *
 * Not supported (intentionally minimal): named months/days, ?, L, W.
 */

export interface ParsedCron {
  minute: Set<number>;
  hour: Set<number>;
  dayOfMonth: Set<number>;
  month: Set<number>;
  dayOfWeek: Set<number>;
}

const RANGES: Array<[keyof ParsedCron, number, number]> = [
  ["minute", 0, 59],
  ["hour", 0, 23],
  ["dayOfMonth", 1, 31],
  ["month", 1, 12],
  ["dayOfWeek", 0, 6]
];

export function parseCron(expr: string): ParsedCron {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) {
    throw new Error(`Cron expression must have 5 fields, got ${parts.length}: "${expr}"`);
  }
  const result: Partial<ParsedCron> = {};
  for (let i = 0; i < 5; i++) {
    const [field, min, max] = RANGES[i];
    result[field] = parseField(parts[i], min, max, field);
  }
  return result as ParsedCron;
}

function parseField(token: string, min: number, max: number, name: string): Set<number> {
  const out = new Set<number>();
  // Split on commas first
  for (const piece of token.split(",")) {
    let stepValue = 1;
    let body = piece;
    const slashIdx = piece.indexOf("/");
    if (slashIdx >= 0) {
      stepValue = parseInt(piece.slice(slashIdx + 1), 10);
      if (!Number.isInteger(stepValue) || stepValue <= 0) {
        throw new Error(`Invalid step in ${name}: "${piece}"`);
      }
      body = piece.slice(0, slashIdx);
    }
    let rangeStart: number, rangeEnd: number;
    if (body === "*" || body === "") {
      rangeStart = min;
      rangeEnd = max;
    } else if (body.includes("-")) {
      const [a, b] = body.split("-");
      rangeStart = parseInt(a, 10);
      rangeEnd = parseInt(b, 10);
      if (!Number.isInteger(rangeStart) || !Number.isInteger(rangeEnd)) {
        throw new Error(`Invalid range in ${name}: "${piece}"`);
      }
    } else {
      const v = parseInt(body, 10);
      if (!Number.isInteger(v)) {
        throw new Error(`Invalid value in ${name}: "${piece}"`);
      }
      rangeStart = v;
      rangeEnd = v;
    }
    if (rangeStart < min || rangeEnd > max || rangeStart > rangeEnd) {
      throw new Error(`Out-of-range value in ${name}: "${piece}" (allowed ${min}-${max})`);
    }
    for (let v = rangeStart; v <= rangeEnd; v += stepValue) {
      out.add(v);
    }
  }
  return out;
}

/** Validate a cron expression — returns null if OK, error message otherwise. */
export function validateCron(expr: string): string | null {
  try {
    parseCron(expr);
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}

/** Compute the next run time in UTC after `from`. Returns null if no fire in next 4 years. */
export function nextRunAfter(expr: string, from: Date = new Date()): Date | null {
  const parsed = parseCron(expr);
  // Start from next minute
  const candidate = new Date(from.getTime());
  candidate.setUTCSeconds(0, 0);
  candidate.setUTCMinutes(candidate.getUTCMinutes() + 1);

  // Search up to ~4 years ahead (4 * 366 * 24 * 60 minutes ~ 2.1M iterations max,
  // but we early-jump on day mismatches so practical iterations are far fewer).
  const maxDate = new Date(from.getTime() + 4 * 366 * 24 * 60 * 60 * 1000);
  while (candidate.getTime() < maxDate.getTime()) {
    if (matches(candidate, parsed)) return candidate;
    // Increment minute; jump to next valid minute when hour/day/month doesn't match.
    if (!parsed.month.has(candidate.getUTCMonth() + 1)) {
      candidate.setUTCDate(1);
      candidate.setUTCHours(0, 0, 0, 0);
      candidate.setUTCMonth(candidate.getUTCMonth() + 1);
      continue;
    }
    if (!parsed.dayOfMonth.has(candidate.getUTCDate()) || !parsed.dayOfWeek.has(candidate.getUTCDay())) {
      candidate.setUTCHours(0, 0, 0, 0);
      candidate.setUTCDate(candidate.getUTCDate() + 1);
      continue;
    }
    if (!parsed.hour.has(candidate.getUTCHours())) {
      candidate.setUTCMinutes(0, 0, 0);
      candidate.setUTCHours(candidate.getUTCHours() + 1);
      continue;
    }
    candidate.setUTCMinutes(candidate.getUTCMinutes() + 1);
  }
  return null;
}

export function matches(date: Date, parsed: ParsedCron): boolean {
  return (
    parsed.minute.has(date.getUTCMinutes()) &&
    parsed.hour.has(date.getUTCHours()) &&
    parsed.dayOfMonth.has(date.getUTCDate()) &&
    parsed.month.has(date.getUTCMonth() + 1) &&
    parsed.dayOfWeek.has(date.getUTCDay())
  );
}

/** Human-readable description for common cron expressions. Falls back to raw expr. */
export function describeCron(expr: string, locale: "zh" | "en" = "en"): string {
  const known: Record<string, { zh: string; en: string }> = {
    "* * * * *":   { zh: "每分钟",         en: "Every minute" },
    "*/5 * * * *": { zh: "每 5 分钟",       en: "Every 5 minutes" },
    "*/15 * * * *":{ zh: "每 15 分钟",      en: "Every 15 minutes" },
    "0 * * * *":   { zh: "每小时整点",      en: "Hourly at :00" },
    "0 */6 * * *": { zh: "每 6 小时",       en: "Every 6 hours" },
    "0 0 * * *":   { zh: "每天 UTC 00:00",  en: "Daily at 00:00 UTC" },
    "0 3 * * *":   { zh: "每天 UTC 03:00",  en: "Daily at 03:00 UTC" },
    "0 0 * * 0":   { zh: "每周日 UTC 00:00", en: "Weekly on Sunday 00:00 UTC" },
    "0 0 1 * *":   { zh: "每月 1 号 UTC 00:00", en: "Monthly on day 1 at 00:00 UTC" }
  };
  const k = known[expr.trim()];
  if (k) return k[locale];
  return expr;
}
