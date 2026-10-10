import "server-only";
import { db } from "@/lib/db";
import { costPerOrder, monthNetProfit, splitProfit } from "@/lib/money";
import { FINISHED_STATUSES } from "@/lib/constants";
import { getSettings } from "@/lib/data/settings";
import { returningOrder } from "@/lib/data/orders";

const firstOf = (month: string) => `${month}-01`;

export async function monthReport(month: string) {
  const sql = db();
  const start = firstOf(month);
  const finished = sql(FINISHED_STATUSES);
  const [[orders], [expenses], [cash], [closed], byCategory, settings, [stock]] = await Promise.all([
    // Only finished orders (delivered, completed, cancelled) count towards profit.
    // Orders still to deliver are reported separately: their costs aren't all in yet.
    sql<{ revenue: number; partner_costs: number; order_expenses: number; stock_costs: number; orders: number; delivered: number; cancelled: number; cancelled_kept: number;
          open_orders: number; open_numbers: string[]; open_revenue: number; open_costs: number;
          new_orders: number; repeat_orders: number; new_commission: number; repeat_commission: number }[]>`
      select coalesce(sum(s.revenue) filter (where o.status in ${finished}), 0) as revenue,
        coalesce(sum(s.partner_costs) filter (where o.status in ${finished}), 0) as partner_costs,
        coalesce(sum(s.order_expenses) filter (where o.status in ${finished}), 0) as order_expenses,
        coalesce(sum(s.stock_costs) filter (where o.status in ${finished}), 0) as stock_costs,
        count(*) filter (where o.status <> 'cancelled')::int as orders,
        count(*) filter (where o.status in ('delivered', 'completed'))::int as delivered,
        count(*) filter (where o.status = 'cancelled')::int as cancelled,
        coalesce(sum(s.revenue) filter (where o.status = 'cancelled'), 0) as cancelled_kept,
        count(*) filter (where o.status not in ${finished})::int as open_orders,
        coalesce(array_agg(o.number order by o.delivery_date nulls last, o.number) filter (where o.status not in ${finished}), '{}') as open_numbers,
        coalesce(sum(s.revenue) filter (where o.status not in ${finished}), 0) as open_revenue,
        coalesce(sum(s.partner_costs + s.order_expenses + s.stock_costs) filter (where o.status not in ${finished}), 0) as open_costs,
        count(*) filter (where o.status <> 'cancelled' and not r.returning)::int as new_orders,
        count(*) filter (where o.status <> 'cancelled' and r.returning)::int as repeat_orders,
        coalesce(sum(s.profit) filter (where o.status in ${finished} and not r.returning), 0) as new_commission,
        coalesce(sum(s.profit) filter (where o.status in ${finished} and r.returning), 0) as repeat_commission
      from order_summary s join orders o on o.id = s.order_id
      cross join lateral (select ${returningOrder(sql)} as returning) r
      where o.status <> 'enquiry' and s.month = ${start}::date`,
    sql<{ business_expenses: number; ad_spend: number }[]>`
      select coalesce(sum(amount) filter (where order_id is null), 0) as business_expenses,
        coalesce(sum(amount) filter (where category = 'meta_ads'), 0) as ad_spend
      from expenses where date_trunc('month', spent_on) = ${start}::date`,
    sql<{ money_in: number; paid_partners: number; paid_expenses: number; stock_bought: number }[]>`
      select
        (select coalesce(sum(total_cost), 0) from stock_purchases where date_trunc('month', bought_on) = ${start}::date) as stock_bought,
        (select coalesce(sum(amount), 0) from customer_payments where status = 'verified' and date_trunc('month', received_on) = ${start}::date) as money_in,
        (select coalesce(sum(amount), 0) from partner_payments where voided_at is null and date_trunc('month', paid_on) = ${start}::date) as paid_partners,
        (select coalesce(sum(amount), 0) from expenses where date_trunc('month', spent_on) = ${start}::date) as paid_expenses`,
    sql<{ owner_percent: number; owner_label: string; partner_label: string; owner_share: number; partner_share: number; net_profit: number; closed_at: Date; revenue: number; partner_costs: number; order_expenses: number; business_expenses: number; stock_costs: number; stock_written_off: number; partner_paid_at: Date | null }[]>`
      select * from month_closes where month = ${start}::date`,
    sql<{ category: string; amount: number }[]>`
      select category, sum(amount) as amount from expenses where date_trunc('month', spent_on) = ${start}::date group by category order by amount desc`,
    getSettings(),
    sql<{ written_off: number; on_hand_value: number }[]>`
      select
        (select coalesce(sum(cost), 0) from stock_moves where kind = 'written_off' and date_trunc('month', moved_on) = ${start}::date) as written_off,
        (select coalesce(sum(value), 0) from stock_levels) as on_hand_value`,
  ]);

  const figures = closed
    ? { revenue: closed.revenue, partnerCosts: closed.partner_costs, orderExpenses: closed.order_expenses, businessExpenses: closed.business_expenses,
        stockCosts: closed.stock_costs, stockWrittenOff: closed.stock_written_off }
    : { revenue: orders.revenue, partnerCosts: orders.partner_costs, orderExpenses: orders.order_expenses, businessExpenses: expenses.business_expenses,
        stockCosts: orders.stock_costs, stockWrittenOff: stock.written_off };
  const netProfit = closed ? closed.net_profit : monthNetProfit(figures);
  const ownerPercent = closed ? closed.owner_percent : settings.split_owner_percent;
  const split = closed ? { owner: closed.owner_share, partner: closed.partner_share } : splitProfit(netProfit, ownerPercent);

  return {
    month,
    figures,
    netProfit,
    commission: figures.revenue - figures.partnerCosts - figures.orderExpenses - figures.stockCosts,
    split: {
      ...split,
      ownerPercent,
      ownerLabel: closed?.owner_label ?? settings.split_owner_label,
      partnerLabel: closed?.partner_label ?? settings.split_partner_label,
    },
    closedAt: closed?.closed_at ?? null,
    sharePaidAt: closed?.partner_paid_at ?? null,
    orders: orders.orders,
    delivered: orders.delivered,
    cancelled: orders.cancelled,
    /** Non-refundable advances kept from cancelled orders: already inside sales. */
    cancelledKept: orders.cancelled_kept,
    /** Orders this month that aren't delivered or cancelled yet: not in profit. */
    open: { orders: orders.open_orders, numbers: orders.open_numbers, revenue: orders.open_revenue, costsSoFar: orders.open_costs },
    adSpend: expenses.ad_spend,
    /**
     * New vs repeat customers. Ad spend is a business cost, never taken off one order,
     * so a repeat order keeps its full commission. Ads only win new customers, so the
     * true ad cost is spend ÷ new-customer orders.
     */
    customers: {
      newOrders: orders.new_orders,
      repeatOrders: orders.repeat_orders,
      newCommission: orders.new_commission,
      repeatCommission: orders.repeat_commission,
      adCostPerNewOrder: costPerOrder(expenses.ad_spend, orders.new_orders),
    },
    cash: { in: cash.money_in, out: cash.paid_partners + cash.paid_expenses + cash.stock_bought, paidPartners: cash.paid_partners, paidExpenses: cash.paid_expenses, stockBought: cash.stock_bought },
    stockOnHand: stock.on_hand_value,
    byCategory,
  };
}

/** True once a month's numbers are fixed (closed by hand or by the payout cron). */
export async function isMonthClosed(month: string) {
  const [row] = await db()`select 1 from month_closes where month = ${firstOf(month)}::date`;
  return Boolean(row);
}

export async function monthlyTrend(months = 12) {
  const sql = db();
  return sql<{ month: string; revenue: number; commission: number; business_expenses: number; ad_spend: number; orders: number }[]>`
    with m as (
      select generate_series(date_trunc('month', now() at time zone 'Asia/Colombo') - make_interval(months => ${months - 1}),
                             date_trunc('month', now() at time zone 'Asia/Colombo'), interval '1 month')::date as month
    )
    select to_char(m.month, 'YYYY-MM') as month,
      coalesce(o.revenue, 0) as revenue, coalesce(o.commission, 0) as commission,
      coalesce(e.business_expenses, 0) + coalesce(w.written_off, 0) as business_expenses, coalesce(e.ad_spend, 0) as ad_spend, coalesce(o.orders, 0) as orders
    from m
    left join (
      select s.month, sum(s.revenue) filter (where o.status in ${sql(FINISHED_STATUSES)}) as revenue,
        sum(s.profit) filter (where o.status in ${sql(FINISHED_STATUSES)}) as commission, count(*) filter (where o.status <> 'cancelled')::int as orders
      from order_summary s join orders o on o.id = s.order_id where o.status <> 'enquiry' group by s.month
    ) o on o.month = m.month
    left join (
      select date_trunc('month', spent_on)::date as month, sum(amount) filter (where order_id is null) as business_expenses,
        sum(amount) filter (where category = 'meta_ads') as ad_spend
      from expenses group by 1
    ) e on e.month = m.month
    left join (
      select date_trunc('month', moved_on)::date as month, sum(cost) as written_off
      from stock_moves where kind = 'written_off' group by 1
    ) w on w.month = m.month
    order by m.month
  `;
}

export type CityStat = { city: string; orders: number; completed: number; revenue: number; partners: number };

/** Orders and partners per town, for the map. `since` limits orders to a start date. */
export async function cityStats(since?: string | null) {
  const sql = db();
  return sql<CityStat[]>`
    with o as (
      select initcap(trim(o.city)) as city, count(*)::int as orders,
        count(*) filter (where o.status in ('delivered', 'completed'))::int as completed,
        coalesce(sum(s.revenue), 0) as revenue
      from orders o join order_summary s on s.order_id = o.id
      where o.status not in ('enquiry', 'cancelled') ${since ? sql`and coalesce(o.delivery_date, o.created_at::date) >= ${since}` : sql``}
      group by 1
    ), p as (
      select initcap(trim(city)) as city, count(*)::int as partners from partners where active group by 1
    )
    select coalesce(o.city, p.city) as city, coalesce(o.orders, 0) as orders, coalesce(o.completed, 0) as completed,
      coalesce(o.revenue, 0) as revenue, coalesce(p.partners, 0) as partners
    from o full join p on p.city = o.city
    order by orders desc, partners desc, city
  `;
}

export async function partnerLeaderboard(since?: string | null) {
  const sql = db();
  return sql<{ id: string; name: string; city: string; jobs: number; delivered: number; agreed: number; cancelled: number }[]>`
    select p.id, p.name, p.city, count(j.*)::int as jobs,
      count(j.*) filter (where j.status = 'delivered')::int as delivered,
      count(j.*) filter (where j.status = 'cancelled')::int as cancelled,
      coalesce(sum(j.agreed_amount) filter (where j.status <> 'cancelled'), 0) as agreed
    from partners p
    join partner_jobs j on j.partner_id = p.id
    join orders o on o.id = j.order_id
    where true ${since ? sql`and coalesce(o.delivery_date, o.created_at::date) >= ${since}` : sql``}
    group by p.id order by jobs desc limit 10
  `;
}
