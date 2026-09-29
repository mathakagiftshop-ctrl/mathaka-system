import "server-only";
import { db } from "@/lib/db";
import { costPerOrder, monthNetProfit, splitProfit } from "@/lib/money";
import { getSettings } from "@/lib/data/settings";

const firstOf = (month: string) => `${month}-01`;

export async function monthReport(month: string) {
  const sql = db();
  const start = firstOf(month);
  const [[orders], [expenses], [cash], [closed], byCategory, settings] = await Promise.all([
    sql<{ revenue: number; partner_costs: number; order_expenses: number; orders: number; delivered: number; cancelled: number }[]>`
      select coalesce(sum(s.revenue), 0) as revenue, coalesce(sum(s.partner_costs), 0) as partner_costs,
        coalesce(sum(s.order_expenses), 0) as order_expenses,
        count(*) filter (where o.status <> 'cancelled')::int as orders,
        count(*) filter (where o.status in ('delivered', 'completed'))::int as delivered,
        count(*) filter (where o.status = 'cancelled')::int as cancelled
      from order_summary s join orders o on o.id = s.order_id
      where o.status <> 'enquiry' and s.month = ${start}::date`,
    sql<{ business_expenses: number; ad_spend: number }[]>`
      select coalesce(sum(amount) filter (where order_id is null), 0) as business_expenses,
        coalesce(sum(amount) filter (where category = 'meta_ads'), 0) as ad_spend
      from expenses where date_trunc('month', spent_on) = ${start}::date`,
    sql<{ money_in: number; paid_partners: number; paid_expenses: number }[]>`
      select
        (select coalesce(sum(amount), 0) from customer_payments where status = 'verified' and date_trunc('month', received_on) = ${start}::date) as money_in,
        (select coalesce(sum(amount), 0) from partner_payments where voided_at is null and date_trunc('month', paid_on) = ${start}::date) as paid_partners,
        (select coalesce(sum(amount), 0) from expenses where date_trunc('month', spent_on) = ${start}::date) as paid_expenses`,
    sql<{ owner_percent: number; owner_label: string; partner_label: string; owner_share: number; partner_share: number; net_profit: number; closed_at: Date; revenue: number; partner_costs: number; order_expenses: number; business_expenses: number }[]>`
      select * from month_closes where month = ${start}::date`,
    sql<{ category: string; amount: number }[]>`
      select category, sum(amount) as amount from expenses where date_trunc('month', spent_on) = ${start}::date group by category order by amount desc`,
    getSettings(),
  ]);

  const figures = closed
    ? { revenue: closed.revenue, partnerCosts: closed.partner_costs, orderExpenses: closed.order_expenses, businessExpenses: closed.business_expenses }
    : { revenue: orders.revenue, partnerCosts: orders.partner_costs, orderExpenses: orders.order_expenses, businessExpenses: expenses.business_expenses };
  const netProfit = closed ? closed.net_profit : monthNetProfit(figures);
  const ownerPercent = closed ? closed.owner_percent : settings.split_owner_percent;
  const split = closed ? { owner: closed.owner_share, partner: closed.partner_share } : splitProfit(netProfit, ownerPercent);

  return {
    month,
    figures,
    netProfit,
    commission: figures.revenue - figures.partnerCosts - figures.orderExpenses,
    split: {
      ...split,
      ownerPercent,
      ownerLabel: closed?.owner_label ?? settings.split_owner_label,
      partnerLabel: closed?.partner_label ?? settings.split_partner_label,
    },
    closedAt: closed?.closed_at ?? null,
    orders: orders.orders,
    delivered: orders.delivered,
    cancelled: orders.cancelled,
    adSpend: expenses.ad_spend,
    costPerOrder: costPerOrder(expenses.ad_spend, orders.orders),
    cash: { in: cash.money_in, out: cash.paid_partners + cash.paid_expenses, paidPartners: cash.paid_partners, paidExpenses: cash.paid_expenses },
    byCategory,
  };
}

export async function monthlyTrend(months = 12) {
  return db()<{ month: string; revenue: number; commission: number; business_expenses: number; ad_spend: number; orders: number }[]>`
    with m as (
      select generate_series(date_trunc('month', now() at time zone 'Asia/Colombo') - make_interval(months => ${months - 1}),
                             date_trunc('month', now() at time zone 'Asia/Colombo'), interval '1 month')::date as month
    )
    select to_char(m.month, 'YYYY-MM') as month,
      coalesce(o.revenue, 0) as revenue, coalesce(o.commission, 0) as commission,
      coalesce(e.business_expenses, 0) as business_expenses, coalesce(e.ad_spend, 0) as ad_spend, coalesce(o.orders, 0) as orders
    from m
    left join (
      select s.month, sum(s.revenue) as revenue, sum(s.profit) as commission, count(*) filter (where o.status <> 'cancelled')::int as orders
      from order_summary s join orders o on o.id = s.order_id where o.status <> 'enquiry' group by s.month
    ) o on o.month = m.month
    left join (
      select date_trunc('month', spent_on)::date as month, sum(amount) filter (where order_id is null) as business_expenses,
        sum(amount) filter (where category = 'meta_ads') as ad_spend
      from expenses group by 1
    ) e on e.month = m.month
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
