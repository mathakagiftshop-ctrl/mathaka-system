"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { formAction, UserError } from "@/lib/actions";
import { db } from "@/lib/db";
import { closeMonthNow } from "@/lib/data/month-close";

const monthSchema = z.object({ month: z.string().regex(/^\d{4}-\d{2}$/, "is not valid") });

/** Freezes a month's profit and split so later edits or ratio changes don't alter it. */
export const closeMonth = formAction(monthSchema, async ({ month }, user) => {
  await closeMonthNow(month, user.id);
  revalidatePath("/reports");
  return "Month closed. Its numbers and split are now fixed.";
}, "finance");

export const reopenMonth = formAction(monthSchema, async ({ month }, user) => {
  const [paid] = await db()`select 1 from month_closes where month = ${`${month}-01`}::date and partner_paid_at is not null`;
  if (paid) throw new UserError("The share for this month is marked paid. Undo that first, then reopen.");
  const rows = await db()`delete from month_closes where month = ${`${month}-01`}::date returning month`;
  if (!rows.length) throw new UserError("That month isn't closed.");
  await audit(user.id, "month.reopened", "month", month);
  revalidatePath("/reports");
  return "Month reopened.";
}, "settings");

/** Records that the second person's share for a closed month was handed over. */
export const markSharePaid = formAction(monthSchema, async ({ month }, user) => {
  const rows = await db()`
    update month_closes set partner_paid_at = now(), partner_paid_by = ${user.id}
    where month = ${`${month}-01`}::date and partner_paid_at is null returning partner_share`;
  if (!rows.length) throw new UserError("Close the month first (or it's already marked paid).");
  await audit(user.id, "month.share_paid", "month", month, { amount: rows[0].partner_share });
  revalidatePath("/reports");
  return "Marked paid.";
}, "finance");

export const unmarkSharePaid = formAction(monthSchema, async ({ month }, user) => {
  const rows = await db()`
    update month_closes set partner_paid_at = null, partner_paid_by = null
    where month = ${`${month}-01`}::date and partner_paid_at is not null returning month`;
  if (!rows.length) throw new UserError("That share isn't marked paid.");
  await audit(user.id, "month.share_unpaid", "month", month);
  revalidatePath("/reports");
  return "Payment undone.";
}, "settings");
