export const ORDER_STATUSES = [
  { value: "enquiry", label: "Enquiry", tone: "muted", hint: "Asked about an order, not confirmed yet" },
  { value: "confirmed", label: "Confirmed", tone: "blue", hint: "Customer confirmed, usually after an advance" },
  { value: "in_progress", label: "Being prepared", tone: "gold", hint: "Partners are making the cake and gifts" },
  { value: "out_for_delivery", label: "Out for delivery", tone: "gold", hint: "On the way to the recipient" },
  { value: "delivered", label: "Delivered", tone: "sage", hint: "Delivered — send photos and settle money" },
  { value: "completed", label: "Completed", tone: "sage", hint: "Delivered and all money settled" },
  { value: "cancelled", label: "Cancelled", tone: "ribbon", hint: "Won't go ahead" },
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number]["value"];
export const ORDER_STATUS_VALUES = ORDER_STATUSES.map((status) => status.value) as [OrderStatus, ...OrderStatus[]];
export const ACTIVE_STATUSES: OrderStatus[] = ["confirmed", "in_progress", "out_for_delivery", "delivered"];
export const DONE_STATUSES: OrderStatus[] = ["delivered", "completed"];
/** Orders whose money is final, so they count towards a month's profit. */
export const FINISHED_STATUSES: OrderStatus[] = [...DONE_STATUSES, "cancelled"];

export function statusInfo(value: string) {
  return ORDER_STATUSES.find((status) => status.value === value) ?? ORDER_STATUSES[0];
}

export const JOB_STATUSES = [
  { value: "assigned", label: "Assigned" },
  { value: "accepted", label: "Accepted" },
  { value: "ready", label: "Ready" },
  { value: "delivered", label: "Delivered" },
  { value: "cancelled", label: "Cancelled" },
] as const;
export type JobStatus = (typeof JOB_STATUSES)[number]["value"];
export const JOB_STATUS_VALUES = JOB_STATUSES.map((status) => status.value) as [JobStatus, ...JobStatus[]];

export const SERVICES = ["Cakes", "Flowers", "Gifts", "Hampers", "Balloons", "Decorations", "Delivery", "Photography"] as const;

export const EXPENSE_CATEGORIES = [
  { value: "meta_ads", label: "Meta ads" },
  { value: "packaging", label: "Packaging" },
  { value: "delivery", label: "Delivery" },
  { value: "transport", label: "Transport" },
  { value: "phone_internet", label: "Phone & internet" },
  { value: "bank_fees", label: "Bank fees" },
  { value: "software", label: "Software" },
  { value: "other", label: "Other" },
] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number]["value"];
export const EXPENSE_CATEGORY_VALUES = EXPENSE_CATEGORIES.map((category) => category.value) as [ExpenseCategory, ...ExpenseCategory[]];
export const expenseLabel = (value: string) => EXPENSE_CATEGORIES.find((category) => category.value === value)?.label ?? value;

export const PAYMENT_METHODS = [
  { value: "bank_transfer", label: "Bank transfer" },
  { value: "cash", label: "Cash" },
  { value: "card", label: "Card" },
  { value: "other", label: "Other" },
] as const;
export const PAYMENT_METHOD_VALUES = PAYMENT_METHODS.map((method) => method.value) as [string, ...string[]];
export const methodLabel = (value: string) => PAYMENT_METHODS.find((method) => method.value === value)?.label ?? value;

export const ORDER_SOURCES = [
  { value: "facebook_ad", label: "Facebook / Meta ad" },
  { value: "repeat", label: "Repeat customer" },
  { value: "referral", label: "Referral" },
  { value: "other", label: "Other" },
] as const;
export const ORDER_SOURCE_VALUES = ORDER_SOURCES.map((source) => source.value) as [string, ...string[]];

export const GULF_COUNTRIES = ["United Arab Emirates", "Qatar", "Saudi Arabia", "Kuwait", "Oman", "Bahrain", "Sri Lanka", "Other"];
