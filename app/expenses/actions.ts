"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { formAction, positiveMoney, requiredDate, requiredText, UserError, uuid } from "@/lib/actions";
import { EXPENSE_CATEGORY_VALUES } from "@/lib/constants";
import { db } from "@/lib/db";
import { syncMetaAds } from "@/lib/meta-ads";

export const addExpense = formAction(z.object({
  category: z.enum(EXPENSE_CATEGORY_VALUES),
  description: requiredText(300),
  amount: positiveMoney,
  spent_on: requiredDate,
}), async (input, user) => {
  await db()`insert into expenses (category, description, amount, spent_on, created_by)
             values (${input.category}, ${input.description}, ${input.amount}, ${input.spent_on}, ${user.id})`;
  await audit(user.id, "expense.added", "expense", null, input);
  revalidatePath("/expenses");
  revalidatePath("/reports");
  return "Expense added.";
}, "finance");

export const deleteExpense = formAction(z.object({ expense_id: uuid }), async ({ expense_id }, user) => {
  const sql = db();
  const [row] = await sql<{ order_id: string | null; spent_on: string; meta_campaign_id: string | null; amount: number }[]>`select order_id, spent_on, meta_campaign_id, amount from expenses where id = ${expense_id}`;
  if (!row) throw new UserError("Already deleted.");
  const [closed] = await sql`select 1 from month_closes where month = date_trunc('month', ${row.spent_on}::date)::date`;
  if (closed) throw new UserError("That month is closed. Reopen it in Reports first.");
  await sql.begin(async (tx) => {
    // A synced Meta day is remembered as skipped, so the next sync doesn't bring it back.
    if (row.meta_campaign_id) {
      await tx`insert into meta_skipped_days (campaign_id, day, amount, skipped_by)
               values (${row.meta_campaign_id}, ${row.spent_on}, ${row.amount}, ${user.id}) on conflict do nothing`;
    }
    await tx`delete from expenses where id = ${expense_id}`;
  });
  await audit(user.id, row.meta_campaign_id ? "meta_ads.day_skipped" : "expense.deleted", "expense", expense_id, row.meta_campaign_id ? { day: row.spent_on, amount: row.amount } : {});
  revalidatePath("/expenses");
  revalidatePath("/reports");
  if (row.order_id) revalidatePath(`/orders/${row.order_id}`);
  return "Expense deleted.";
}, "finance");

export const syncMetaAdsNow = formAction(z.object({}), async (_input, user) => {
  const { days, added } = await syncMetaAds();
  await audit(user.id, "meta_ads.synced", "expense", null, { days, added });
  revalidatePath("/expenses");
  revalidatePath("/reports");
  return `Synced ${days} day${days === 1 ? "" : "s"} of Meta ads.${added.length ? ` New campaign${added.length === 1 ? "" : "s"}: ${added.join(", ")}.` : ""}`;
}, "finance");

/** Count a Meta campaign's spend as ours, or ignore it (another business). */
export const decideMetaCampaign = formAction(z.object({
  campaign_id: z.string().regex(/^\d+$/, "is not valid"),
  counted: z.enum(["yes", "no"]),
}), async ({ campaign_id, counted }, user) => {
  const sql = db();
  const [campaign] = await sql<{ name: string }[]>`
    update meta_campaigns set counted = ${counted === "yes"}, decided_by = ${user.id}, decided_at = now()
    where id = ${campaign_id} returning name`;
  if (!campaign) throw new UserError("That campaign isn't known yet. Sync first.");
  await audit(user.id, "meta_campaign.decided", "meta_campaign", campaign_id, { counted: counted === "yes", name: campaign.name });
  // Re-sync adds its past days (counted) or removes them from open months (ignored).
  await syncMetaAds();
  revalidatePath("/expenses");
  revalidatePath("/reports");
  return counted === "yes" ? `Counting ${campaign.name}.` : `Ignoring ${campaign.name}.`;
}, "finance");

/** Count a skipped Meta day again. */
export const unskipMetaDay = formAction(z.object({
  campaign_id: z.string().regex(/^\d+$/, "is not valid"),
  day: requiredDate,
}), async ({ campaign_id, day }, user) => {
  const sql = db();
  const [closed] = await sql`select 1 from month_closes where month = date_trunc('month', ${day}::date)::date`;
  if (closed) throw new UserError("That month is closed. Reopen it in Reports first.");
  const rows = await sql`delete from meta_skipped_days where campaign_id = ${campaign_id} and day = ${day} returning day`;
  if (!rows.length) throw new UserError("That day isn't skipped.");
  await audit(user.id, "meta_ads.day_unskipped", "meta_campaign", campaign_id, { day });
  await syncMetaAds();
  revalidatePath("/expenses");
  revalidatePath("/reports");
  return "Day counted again.";
}, "finance");
