-- Profit periods run from the 21st to the 20th, named by the month they end in
-- (the period keyed 2026-11-01 is 21 Oct – 20 Nov). Months before October 2026 stay
-- calendar months, so already-closed months keep exactly the same orders and costs;
-- October 2026 is the short 1–20 Oct. Keep in step with periodOf() in lib/format.ts.
--
-- Additive only: one new function, and order_totals recreated with the same columns
-- (only how `month` is worked out changes). No table data changes.

create or replace function pay_period(d date) returns date
language sql immutable as $$
  select case when d >= date '2026-10-01' and extract(day from d) > 20
              then (date_trunc('month', d) + interval '1 month')::date
              else date_trunc('month', d)::date end
$$;

-- Same as 0005, with month = pay_period(...).
create or replace view order_totals as
select
  o.id as order_id,
  coalesce(i.subtotal, 0) as items_subtotal,
  greatest(coalesce(i.subtotal, 0) + o.delivery_fee + o.markup - o.discount, 0) as total,
  coalesce(p.paid, 0) as paid,
  coalesce(p.pending, 0) as pending,
  coalesce(j.partner_costs, 0) as partner_costs,
  coalesce(j.partner_paid, 0) as partner_paid,
  coalesce(e.order_expenses, 0) as order_expenses,
  -- A cancelled order earns only what the customer paid and we kept.
  case when o.status = 'cancelled' then coalesce(p.paid, 0)
       else greatest(coalesce(i.subtotal, 0) + o.delivery_fee + o.markup - o.discount, 0) end as revenue,
  -- The period an order counts in: by its delivery date, or when it was created.
  pay_period(coalesce(o.delivery_date, (o.created_at at time zone 'Asia/Colombo')::date)) as month,
  coalesce(st.stock_costs, 0) as stock_costs
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
) e on true
left join lateral (
  select sum(cost) as stock_costs from stock_moves where order_id = o.id
) st on true;
