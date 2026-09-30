"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { formAction, UserError } from "@/lib/actions";
import { db } from "@/lib/db";
import { monthReport } from "@/lib/data/reports";
import { currentMonth } from "@/lib/format";

const monthSchema = z.object({ month: z.string().regex(/^\d{4}-\d{2}$/, "is not valid") });

/** Freezes a month's profit and split so later edits or ratio changes don't alter it. */
export const closeMonth = formAction(monthSchema, async ({ month }, user) => {
  if (month >= currentMonth()) throw new UserError("You can only close a month after it has ended.");
  const report = await monthReport(month);
  if (report.closedAt) throw new UserError("That month is already closed.");
  await db()`
    insert into month_closes (month, revenue, partner_costs, order_expenses, business_expenses, net_profit,
      owner_label, partner_label, owner_percent, owner_share, partner_share, closed_by, stock_costs, stock_written_off)
    values (${`${month}-01`}, ${report.figures.revenue}, ${report.figures.partnerCosts}, ${report.figures.orderExpenses},
      ${report.figures.businessExpenses}, ${report.netProfit}, ${report.split.ownerLabel}, ${report.split.partnerLabel},
      ${report.split.ownerPercent}, ${report.split.owner}, ${report.split.partner}, ${user.id},
      ${report.figures.stockCosts}, ${report.figures.stockWrittenOff})`;
  await audit(user.id, "month.closed", "month", month, { netProfit: report.netProfit });
  revalidatePath("/reports");
  return "Month closed. Its numbers and split are now fixed.";
}, "finance");

export const reopenMonth = formAction(monthSchema, async ({ month }, user) => {
  const rows = await db()`delete from month_closes where month = ${`${month}-01`}::date returning month`;
  if (!rows.length) throw new UserError("That month isn't closed.");
  await audit(user.id, "month.reopened", "month", month);
  revalidatePath("/reports");
  return "Month reopened.";
}, "settings");
