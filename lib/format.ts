const TIME_ZONE = "Asia/Colombo";

export function formatMoney(value: number, currency = "LKR") {
  const sign = value < 0 ? "−" : "";
  return `${sign}${currency} ${Math.abs(value).toLocaleString("en-LK", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

/** 'YYYY-MM-DD' (or a timestamp) → '30 Sep 2026'. */
export function formatDate(value: string | Date | null | undefined, options: Intl.DateTimeFormatOptions = {}) {
  if (!value) return "—";
  const date = typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00+05:30`) : new Date(value);
  if (Number.isNaN(date.valueOf())) return "—";
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: TIME_ZONE, ...options }).format(date);
}

export function formatDateTime(value: string | Date | null | undefined) {
  return formatDate(value, { hour: "numeric", minute: "2-digit" });
}

/** Today's date in Sri Lanka as 'YYYY-MM-DD'. */
export function today() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

/** 'YYYY-MM' for the current month in Sri Lanka. */
export function currentMonth() {
  return today().slice(0, 7);
}

export function monthLabel(month: string) {
  return formatDate(`${month}-01`, { day: undefined, month: "long", year: "numeric" });
}

/** 'YYYY-MM' shifted by whole months: addMonths('2026-01', -1) → '2025-12'. */
export function addMonths(month: string, months: number) {
  const [year, index] = month.split("-").map(Number);
  const value = new Date(Date.UTC(year, index - 1 + months, 1));
  return value.toISOString().slice(0, 7);
}

/**
 * Profit is counted in periods that run from the 21st to the 20th, named by the month
 * they end in: '2026-11' is 21 Oct – 20 Nov. A period closes on its last day (the 20th),
 * when the profit share is paid. Months before October 2026 were calendar months, so
 * October 2026 is the short 1–20 Oct. Keep in step with pay_period() in the database.
 */
export const PERIOD_END_DAY = 20;
const FIRST_SHIFTED_PERIOD = "2026-10";

/** The period a 'YYYY-MM-DD' counts in: '2026-10-21' → '2026-11'. */
export function periodOf(date: string) {
  const month = date.slice(0, 7);
  if (month < FIRST_SHIFTED_PERIOD) return month;
  return Number(date.slice(8, 10)) > PERIOD_END_DAY ? addMonths(month, 1) : month;
}

/** The period today falls in. */
export function currentPeriod() {
  return periodOf(today());
}

/** Last day of a period: '2026-11' → '2026-11-20' ('2026-09' → '2026-09-30'). */
export function periodEnd(period: string) {
  if (period < FIRST_SHIFTED_PERIOD) return addDays(`${addMonths(period, 1)}-01`, -1);
  return `${period}-${String(PERIOD_END_DAY).padStart(2, "0")}`;
}

/** First day of a period: '2026-11' → '2026-10-21'. */
export function periodStart(period: string) {
  return addDays(periodEnd(addMonths(period, -1)), 1);
}

/** '21 Oct – 20 Nov' */
export function periodRange(period: string) {
  return `${formatDate(periodStart(period), { year: undefined })} – ${formatDate(periodEnd(period), { year: undefined })}`;
}

/** The latest period that has reached its last day (it can close now). */
export function lastEndedPeriod() {
  const period = currentPeriod();
  return periodEnd(period) <= today() ? period : addMonths(period, -1);
}

/** 'YYYY-MM-DD' the share for `period` is due: its last day; calendar months paid on the 20th after. */
export function payoutDate(period: string) {
  if (period < FIRST_SHIFTED_PERIOD) return `${addMonths(period, 1)}-${String(PERIOD_END_DAY).padStart(2, "0")}`;
  return periodEnd(period);
}

export function addDays(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

/** Days from today until a 'YYYY-MM-DD' date (negative = in the past). */
export function daysUntil(date: string) {
  return Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today()}T00:00:00Z`)) / 86_400_000);
}

export function relativeDay(date: string | null) {
  if (!date) return "No date";
  const days = daysUntil(date);
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days === -1) return "Yesterday";
  return days > 0 ? `In ${days} days` : `${-days} days ago`;
}

export function titleCase(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
