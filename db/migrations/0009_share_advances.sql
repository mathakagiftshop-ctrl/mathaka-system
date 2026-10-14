-- Advances on the profit share. Sister sometimes takes money before the 20th;
-- it comes off her next payout. What's still owed back is
-- sum(share_advances.amount) − sum(month_closes.advances_deducted).
-- Advances are not a business cost: like the share itself, they don't touch profit.
--
-- Additive only: one new table and one new column (defaults to 0). No existing data changes.

create table if not exists share_advances (
  id uuid primary key default gen_random_uuid(),
  amount numeric(12, 2) not null check (amount > 0),
  paid_on date not null default current_date,
  method text not null default 'cash',
  note text not null default '',
  created_by uuid references users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists share_advances_paid_on_idx on share_advances (paid_on desc);

-- How much of the outstanding advances was taken off this month's payout when it was marked paid.
alter table month_closes add column if not exists advances_deducted numeric(12, 2) not null default 0;
