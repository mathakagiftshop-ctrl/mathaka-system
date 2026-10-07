-- Profit share payouts. Each closed month's second-person share (Sister, 20%) is
-- paid on the 20th of the next month; a cron closes the month on that day.
-- These columns record when that share was actually handed over.
--
-- Additive only: two new nullable columns. No existing data changes.

alter table month_closes add column if not exists partner_paid_at timestamptz;
alter table month_closes add column if not exists partner_paid_by uuid references users (id) on delete set null;
