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

/** The profit share for a month is paid on this day of the following month. */
export const PAYOUT_DAY = 20;

/** 'YYYY-MM-DD' the share for `month` is due: September → 20 October. */
export function payoutDate(month: string) {
  return `${addMonths(month, 1)}-${String(PAYOUT_DAY).padStart(2, "0")}`;
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
