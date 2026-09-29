-- Money summaries used by every list and report, so the numbers are computed
-- one way everywhere. Rules match lib/money.ts.

create view order_totals as
select
  o.id as order_id,
  coalesce(i.subtotal, 0) as items_subtotal,
  greatest(coalesce(i.subtotal, 0) + o.delivery_fee - o.discount, 0) as total,
  coalesce(p.paid, 0) as paid,
  coalesce(p.pending, 0) as pending,
  coalesce(j.partner_costs, 0) as partner_costs,
  coalesce(j.partner_paid, 0) as partner_paid,
  coalesce(e.order_expenses, 0) as order_expenses,
  -- A cancelled order earns only what the customer paid and we kept.
  case when o.status = 'cancelled' then coalesce(p.paid, 0)
       else greatest(coalesce(i.subtotal, 0) + o.delivery_fee - o.discount, 0) end as revenue,
  -- The month an order counts in: its delivery date, or when it was created.
  date_trunc('month', coalesce(o.delivery_date, (o.created_at at time zone 'Asia/Colombo')::date))::date as month
from orders o
left join lateral (
  select round(sum(quantity * unit_price), 2) as subtotal from order_items where order_id = o.id
) i on true
left join lateral (
  select sum(amount) filter (where status = 'verified') as paid,
         sum(amount) filter (where status = 'pending') as pending
  from customer_payments where order_id = o.id
) p on true
left join lateral (
  select sum(pj.agreed_amount) filter (where pj.status <> 'cancelled') as partner_costs,
         (select sum(pp.amount) from partner_payments pp
            join partner_jobs x on x.id = pp.job_id
           where x.order_id = o.id and pp.voided_at is null) as partner_paid
  from partner_jobs pj where pj.order_id = o.id
) j on true
left join lateral (
  select sum(amount) as order_expenses from expenses where order_id = o.id
) e on true;

create view order_summary as
select
  t.*,
  t.total - t.paid as balance,
  t.revenue - t.partner_costs - t.order_expenses as profit
from order_totals t;

create view partner_balances as
select
  p.id as partner_id,
  coalesce(j.agreed, 0) as agreed,
  coalesce(pay.paid, 0) as paid,
  coalesce(j.agreed, 0) - coalesce(pay.paid, 0) as balance,
  coalesce(j.open_jobs, 0) as open_jobs,
  coalesce(j.done_jobs, 0) as done_jobs
from partners p
left join lateral (
  select sum(agreed_amount) filter (where status <> 'cancelled') as agreed,
         count(*) filter (where status in ('assigned', 'accepted', 'ready')) as open_jobs,
         count(*) filter (where status = 'delivered') as done_jobs
  from partner_jobs where partner_id = p.id
) j on true
left join lateral (
  select sum(amount) as paid from partner_payments where partner_id = p.id and voided_at is null
) pay on true;
