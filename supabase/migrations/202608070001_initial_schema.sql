-- Mathaka Celebration Studio domain schema
create extension if not exists pgcrypto;

create type public.order_status as enum ('draft','confirmed','preparing','delivery','memories','reconciled','cancelled');
create type public.fulfilment_mode as enum ('self','partner','hybrid');
create type public.ledger_kind as enum ('revenue','expense','partner_payment','refund','adjustment');

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  name text not null, phone text not null, country text,
  created_at timestamptz not null default now()
);
create table public.recipients (
  id uuid primary key default gen_random_uuid(),
  name text not null, phone text, address text, district text,
  created_at timestamptz not null default now()
);
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.customers on delete restrict,
  recipient_id uuid references public.recipients on delete restrict,
  occasion text not null, delivery_at timestamptz, status public.order_status not null default 'draft',
  fulfilment public.fulfilment_mode not null default 'self', agreed_amount_lkr numeric(12,2),
  original_amount numeric(12,2), original_currency char(3), special_request text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.order_items (
  id uuid primary key default gen_random_uuid(), order_id uuid not null references public.orders on delete cascade,
  category text not null, description text not null, quantity numeric(9,2) default 1,
  estimated_cost_lkr numeric(12,2), actual_cost_lkr numeric(12,2)
);
create table public.order_tasks (
  id uuid primary key default gen_random_uuid(), order_id uuid not null references public.orders on delete cascade,
  title text not null, kind text, assignee_name text, due_at timestamptz, completed_at timestamptz,
  sort_order integer not null default 0
);
create table public.partners (
  id uuid primary key default gen_random_uuid(), name text not null, phone text not null,
  reliability numeric(5,2), notes text, active boolean not null default true
);
create table public.partner_service_areas (
  id uuid primary key default gen_random_uuid(), partner_id uuid not null references public.partners on delete cascade,
  district text not null, services text[] not null default '{}'
);
create table public.partner_quotes (
  id uuid primary key default gen_random_uuid(), order_id uuid not null references public.orders on delete cascade,
  partner_id uuid not null references public.partners on delete cascade, amount_lkr numeric(12,2),
  status text not null default 'requested', response_message_id text, expires_at timestamptz, created_at timestamptz default now()
);
create table public.partner_assignments (
  id uuid primary key default gen_random_uuid(), order_id uuid not null references public.orders on delete cascade,
  partner_id uuid not null references public.partners on delete restrict, agreed_cost_lkr numeric(12,2) not null,
  assigned_at timestamptz not null default now(), unique(order_id, partner_id)
);
create table public.ledger_entries (
  id uuid primary key default gen_random_uuid(), order_id uuid not null references public.orders on delete cascade,
  partner_id uuid references public.partners on delete set null, kind public.ledger_kind not null,
  label text not null, amount_lkr numeric(12,2) not null check(amount_lkr >= 0), is_estimate boolean not null default false,
  original_amount numeric(12,2), original_currency char(3), exchange_rate numeric(18,6),
  receipt_storage_path text, verified_at timestamptz, occurred_at timestamptz not null default now()
);
create table public.conversations (
  id uuid primary key default gen_random_uuid(), external_chat_id text not null unique,
  customer_id uuid references public.customers on delete set null, partner_id uuid references public.partners on delete set null,
  created_at timestamptz not null default now()
);
create table public.messages (
  id uuid primary key default gen_random_uuid(), conversation_id uuid not null references public.conversations on delete cascade,
  external_message_id text not null unique, direction text not null, body text, media_storage_path text,
  sent_at timestamptz not null, raw_payload jsonb not null default '{}'
);
create table public.extracted_facts (
  id uuid primary key default gen_random_uuid(), order_id uuid not null references public.orders on delete cascade,
  field_path text not null, value jsonb not null, confidence numeric(5,4), confirmed_at timestamptz,
  source_message_ids text[] not null default '{}', superseded_at timestamptz, created_at timestamptz not null default now()
);
create table public.media_requirements (
  id uuid primary key default gen_random_uuid(), order_id uuid not null references public.orders on delete cascade unique,
  minimum_photos integer not null default 3, minimum_videos integer not null default 1
);
create table public.media_assets (
  id uuid primary key default gen_random_uuid(), order_id uuid not null references public.orders on delete cascade,
  kind text not null check(kind in ('photo','video')), storage_path text not null, uploaded_by text,
  created_at timestamptz not null default now()
);
create table public.share_links (
  id uuid primary key default gen_random_uuid(), order_id uuid not null references public.orders on delete cascade,
  token_hash text not null unique, purpose text not null check(purpose in ('partner','gallery')),
  expires_at timestamptz not null, revoked_at timestamptz, created_at timestamptz not null default now()
);
create table public.activity_events (
  id uuid primary key default gen_random_uuid(), order_id uuid references public.orders on delete cascade,
  actor_id uuid, event_type text not null, payload jsonb not null default '{}', created_at timestamptz not null default now()
);
create table public.whatsapp_outbox (
  id uuid primary key default gen_random_uuid(), chat_id text not null, payload jsonb not null,
  status text not null default 'pending', attempts integer not null default 0, available_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.customers enable row level security;
alter table public.recipients enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.order_tasks enable row level security;
alter table public.partners enable row level security;
alter table public.ledger_entries enable row level security;
alter table public.media_assets enable row level security;
alter table public.share_links enable row level security;
-- Production policies should scope authenticated staff through an organization_members table.
-- Never expose the service role key in the browser. Partner/gallery token exchange must happen server-side:
-- hash the presented random token, check purpose/expiry/revocation, then issue a narrowly-scoped signed URL.
