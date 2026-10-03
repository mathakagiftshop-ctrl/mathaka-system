-- Partner ratings: after an order is delivered we rate each partner who worked
-- on it (1–5 stars + an optional note). One rating per partner job; re-rating
-- replaces it. A partner's score is the average of their job ratings — the
-- old manual partners.rating stays as a fallback until they have any.
--
-- Additive only: one new table and one new view. No existing data changes.

create table if not exists partner_ratings (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null unique references partner_jobs (id) on delete restrict,
  partner_id uuid not null references partners (id) on delete restrict,
  order_id uuid not null references orders (id) on delete restrict,
  stars integer not null check (stars between 1 and 5),
  comment text not null default '',
  rated_by uuid references users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists partner_ratings_partner_idx on partner_ratings (partner_id, created_at desc);

create or replace view partner_scores as
select
  p.id as partner_id,
  round(avg(r.stars), 1) as avg_stars,
  count(r.id)::int as ratings
from partners p
left join partner_ratings r on r.partner_id = p.id
group by p.id;
