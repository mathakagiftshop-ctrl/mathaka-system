-- Meta ads spend, synced day by day from the Meta Marketing API.
-- Each campaign we've seen is remembered with a decision: counted (its spend is
-- a Mathaka cost), ignored (another business), or null = not decided yet.
-- Campaigns named "Mataka…/Mathaka…" are counted as soon as they're seen.
-- Synced spend lands in expenses as one meta_ads row per campaign per day.
--
-- Days we chose not to count (e.g. testing) are remembered in meta_skipped_days
-- so the sync never adds them back.
--
-- Additive only: two new tables, new nullable columns. No existing data changes.

create table if not exists meta_campaigns (
  id text primary key,
  name text not null,
  counted boolean,
  first_seen_on date not null,
  decided_by uuid references users (id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists meta_skipped_days (
  campaign_id text not null references meta_campaigns (id) on delete restrict,
  day date not null,
  amount numeric(12, 2) not null,
  skipped_by uuid references users (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (campaign_id, day)
);

alter table expenses add column if not exists meta_campaign_id text references meta_campaigns (id) on delete restrict;
alter table expenses add column if not exists meta_day date;
create unique index if not exists expenses_meta_day_idx on expenses (meta_campaign_id, meta_day) where meta_campaign_id is not null;

alter table settings add column if not exists meta_synced_at timestamptz;
alter table settings add column if not exists meta_sync_error text;
