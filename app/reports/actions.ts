"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { formAction, positiveMoney, requiredDate, text, UserError, uuid } from "@/lib/actions";
import { PAYMENT_METHOD_VALUES } from "@/lib/constants";
import { db } from "@/lib/db";
import { closeMonthNow } from "@/lib/data/month-close";
import { formatMoney } from "@/lib/format";
import { sharePayout } from "@/lib/money";

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

// Serialises anything that changes how much of the advances is still owed back.
const ADVANCES_LOCK = 8_020_001;

/**
 * Records that the second person's share for a closed month was handed over.
 * Advances still owed back come off it first (never more than the share).
 */
export const markSharePaid = formAction(monthSchema, async ({ month }, user) => {
  const result = await db().begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(${ADVANCES_LOCK})`;
    const [row] = await tx<{ partner_share: number }[]>`
      select partner_share from month_closes where month = ${`${month}-01`}::date and partner_paid_at is null for update`;
    if (!row) throw new UserError("Close the month first (or it's already marked paid).");
    const [{ owed }] = await tx<{ owed: number }[]>`
      select (select coalesce(sum(amount), 0) from share_advances) - (select coalesce(sum(advances_deducted), 0) from month_closes) as owed`;
    const payout = sharePayout(row.partner_share, owed);
    await tx`
      update month_closes set partner_paid_at = now(), partner_paid_by = ${user.id}, advances_deducted = ${payout.deducted}
      where month = ${`${month}-01`}::date`;
    await audit(user.id, "month.share_paid", "month", month, { amount: row.partner_share, advancesDeducted: payout.deducted, paid: payout.toPay }, tx);
    return payout;
  });
  revalidatePath("/reports");
  return result.deducted > 0 ? `Marked paid: ${formatMoney(result.toPay)} handed over, ${formatMoney(result.deducted)} taken off for advances.` : "Marked paid.";
}, "finance");

export const unmarkSharePaid = formAction(monthSchema, async ({ month }, user) => {
  const rows = await db().begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(${ADVANCES_LOCK})`;
    return tx`
      update month_closes set partner_paid_at = null, partner_paid_by = null, advances_deducted = 0
      where month = ${`${month}-01`}::date and partner_paid_at is not null returning month`;
  });
  if (!rows.length) throw new UserError("That share isn't marked paid.");
  await audit(user.id, "month.share_unpaid", "month", month);
  revalidatePath("/reports");
  return "Payment undone. Any advances it covered are owed again.";
}, "settings");

/** Money handed to the second person before payday. It comes off the next payout. */
export const addShareAdvance = formAction(z.object({
  amount: positiveMoney,
  paid_on: requiredDate,
  method: z.enum(PAYMENT_METHOD_VALUES),
  note: text(300),
}), async (input, user) => {
  const [row] = await db()<{ id: string }[]>`
    insert into share_advances (amount, paid_on, method, note, created_by)
    values (${input.amount}, ${input.paid_on}, ${input.method}, ${input.note}, ${user.id}) returning id`;
  await audit(user.id, "share_advance.added", "share_advance", row.id, input);
  revalidatePath("/reports");
  return "Advance recorded. It comes off the next payout.";
}, "finance");

export const deleteShareAdvance = formAction(z.object({ advance_id: uuid }), async ({ advance_id }, user) => {
  const removed = await db().begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(${ADVANCES_LOCK})`;
    const [row] = await tx<{ amount: number; paid_on: string }[]>`select amount, paid_on from share_advances where id = ${advance_id}`;
    if (!row) throw new UserError("Already deleted.");
    const [{ owed }] = await tx<{ owed: number }[]>`
      select (select coalesce(sum(amount), 0) from share_advances) - (select coalesce(sum(advances_deducted), 0) from month_closes) as owed`;
    if (owed < row.amount) throw new UserError("This advance was already taken off a payout. Undo that payout first.");
    await tx`delete from share_advances where id = ${advance_id}`;
    return row;
  });
  await audit(user.id, "share_advance.deleted", "share_advance", advance_id, removed);
  revalidatePath("/reports");
  return "Advance deleted.";
}, "finance");
