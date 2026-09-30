-- Item prices and delivery_fee are now our estimated costs (internal only);
-- markup is the profit we add on top. The customer sees one package price:
-- items + delivery + markup − discount. Additive only: existing orders get
-- markup 0, so their totals don't change.

alter table orders add column if not exists markup numeric(12, 2) not null default 0 check (markup >= 0);

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
