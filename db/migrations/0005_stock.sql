-- Stock: things we buy in bulk (e.g. 5 photo frames from Pettah) and use on
-- orders one at a time. Buying is cash out on the day we pay; the cost only
-- counts against profit when a piece is used on an order (at the average cost
-- of what's on hand) or written off (broken/unsellable → business cost).
--
-- Additive only: new tables, new columns with defaults, and views replaced
-- with the same columns plus new ones at the end. No existing data changes,
-- and every existing order's profit stays the same (stock_costs = 0).

create table if not exists stock_items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  unit text not null default 'pcs',
  low_stock_at numeric(10, 2) not null default 2 check (low_stock_at >= 0),
  notes text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index if not exists stock_items_name_idx on stock_items (lower(name));

create table if not exists stock_purchases (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references stock_items (id) on delete restrict,
  quantity numeric(10, 2) not null check (quantity > 0),
  total_cost numeric(12, 2) not null check (total_cost >= 0),
  bought_on date not null default current_date,
  supplier text not null default '',
  method text not null default 'cash',
  notes text not null default '',
  created_by uuid references users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists stock_purchases_item_idx on stock_purchases (item_id, bought_on);
create index if not exists stock_purchases_bought_idx on stock_purchases (bought_on);

-- Stock going out: used on an order, or written off. cost is fixed when the
-- move is recorded (average cost of what was on hand × quantity).
create table if not exists stock_moves (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references stock_items (id) on delete restrict,
  kind text not null check (kind in ('used', 'written_off')),
  order_id uuid references orders (id) on delete restrict,
  quantity numeric(10, 2) not null check (quantity > 0),
  cost numeric(12, 2) not null check (cost >= 0),
  moved_on date not null default current_date,
  notes text not null default '',
  created_by uuid references users (id) on delete set null,
  created_at timestamptz not null default now(),
  check ((kind = 'used') = (order_id is not null))
);
create index if not exists stock_moves_item_idx on stock_moves (item_id, moved_on);
create index if not exists stock_moves_order_idx on stock_moves (order_id);
create index if not exists stock_moves_moved_idx on stock_moves (moved_on);

create or replace view stock_levels as
select
  i.id as item_id,
  coalesce(b.quantity, 0) - coalesce(m.quantity, 0) as on_hand,
  coalesce(b.cost, 0) - coalesce(m.cost, 0) as value,
  coalesce(b.quantity, 0) as bought,
  coalesce(m.used, 0) as used,
  coalesce(m.written_off, 0) as written_off
from stock_items i
left join lateral (
  select sum(quantity) as quantity, sum(total_cost) as cost from stock_purchases where item_id = i.id
) b on true
left join lateral (
  select sum(quantity) as quantity, sum(cost) as cost,
         sum(quantity) filter (where kind = 'used') as used,
         sum(quantity) filter (where kind = 'written_off') as written_off
  from stock_moves where item_id = i.id
) m on true;

-- Closed months keep their stock figures too (0 for months closed before stock existed).
alter table month_closes add column if not exists stock_costs numeric(12, 2) not null default 0;
alter table month_closes add column if not exists stock_written_off numeric(12, 2) not null default 0;

-- Same columns as 0004, plus stock_costs at the end.
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
  date_trunc('month', coalesce(o.delivery_date, (o.created_at at time zone 'Asia/Colombo')::date))::date as month,
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

-- Same columns in the same order as before (order_summary was created with
-- t.* when order_totals ended at month), so they're listed explicitly;
-- stock_costs is added at the end and now comes off profit.
create or replace view order_summary as
select
  t.order_id, t.items_subtotal, t.total, t.paid, t.pending, t.partner_costs, t.partner_paid,
  t.order_expenses, t.revenue, t.month,
  t.total - t.paid as balance,
  t.revenue - t.partner_costs - t.order_expenses - t.stock_costs as profit,
  t.stock_costs
from order_totals t;
