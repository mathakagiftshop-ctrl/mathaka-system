import "server-only";
import { audit } from "@/lib/audit";
import { UserError } from "@/lib/actions";
import { db } from "@/lib/db";
import { monthReport } from "@/lib/data/reports";
import { currentMonth } from "@/lib/format";

/**
 * Freezes a month's profit and split so later edits or ratio changes don't alter it.
 * `userId` is null when the payout cron closes it. Throws UserError when it can't close yet.
 */
export async function closeMonthNow(month: string, userId: string | null) {
  if (month >= currentMonth()) throw new UserError("You can only close a month after it has ended.");
  const report = await monthReport(month);
  if (report.closedAt) throw new UserError("That month is already closed.");
  if (report.open.orders > 0) {
    throw new UserError(`${report.open.numbers.join(", ")} ${report.open.orders === 1 ? "isn't" : "aren't"} delivered yet. Mark ${report.open.orders === 1 ? "it" : "them"} delivered or cancelled (or move the delivery date) before closing.`);
  }
  await db()`
    insert into month_closes (month, revenue, partner_costs, order_expenses, business_expenses, net_profit,
      owner_label, partner_label, owner_percent, owner_share, partner_share, closed_by, stock_costs, stock_written_off)
    values (${`${month}-01`}, ${report.figures.revenue}, ${report.figures.partnerCosts}, ${report.figures.orderExpenses},
      ${report.figures.businessExpenses}, ${report.netProfit}, ${report.split.ownerLabel}, ${report.split.partnerLabel},
      ${report.split.ownerPercent}, ${report.split.owner}, ${report.split.partner}, ${userId},
      ${report.figures.stockCosts}, ${report.figures.stockWrittenOff})
    on conflict (month) do nothing`;
  await audit(userId, "month.closed", "month", month, { netProfit: report.netProfit, automatic: userId === null });
  return { netProfit: report.netProfit, partnerLabel: report.split.partnerLabel, partnerShare: report.split.partner };
}
