/**
 * Calendar-date helpers. Dates are 'YYYY-MM-DD' strings and all arithmetic is done in UTC on
 * those strings, so results never depend on the browser's time zone. "Today" is defined in the
 * organisation's time zone (South Africa), matching the database (private.org_today()).
 */

export const ORG_TIME_ZONE = "Africa/Johannesburg";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const d = parse(value);
  return toIso(d) === value;
}

function parse(date: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function toIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Today's calendar date in the organisation's time zone. */
export function orgToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: ORG_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function addDays(date: string, days: number): string {
  const d = parse(date);
  d.setUTCDate(d.getUTCDate() + days);
  return toIso(d);
}

export function diffDays(later: string, earlier: string): number {
  return Math.round((parse(later).getTime() - parse(earlier).getTime()) / 86_400_000);
}

/** Monday of the ISO week containing `date`. */
export function weekStart(date: string): string {
  const dow = parse(date).getUTCDay(); // 0 = Sunday
  return addDays(date, -((dow + 6) % 7));
}

export function addMonths(date: string, months: number): string {
  const d = parse(date);
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  return toIso(d);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "29 Sep 2026" */
export function formatDate(date: string | null | undefined): string {
  if (!date) return "—";
  const d = parse(date.slice(0, 10));
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** "29 Sep" */
export function formatDay(date: string): string {
  const d = parse(date);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

/** Timestamp (ISO with zone) rendered as an organisation-time date and time. */
export function formatDateTime(timestamp: string | null | undefined): string {
  if (!timestamp) return "—";
  const d = new Date(timestamp);
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: ORG_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone: ORG_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
  return `${formatDate(date)}, ${time}`;
}

/** The organisation-time calendar date of a timestamp. */
export function dateOfTimestamp(timestamp: string): string {
  return orgToday(new Date(timestamp));
}
