-- Production workflow extensions for editable AI drafts and operational celebrations.
-- Non-destructive: the legacy invoice/vendor schema remains the commercial source of truth.

create extension if not exists pgcrypto;

alter table public.ai_order_drafts
  add column if not exists revision integer not null default 1,
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewed_by uuid,
  add column if not exists confirmed_at timestamptz,
  add column if not exists discarded_at timestamptz;

alter table public.celebration_journeys
  add column if not exists revision integer not null default 1,
  add column if not exists reconciled_at timestamptz,
  add column if not exists updated_by uuid;

create table if not exists public.ai_order_draft_revisions (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null references public.ai_order_drafts(id) on delete cascade,
  revision integer not null,
  snapshot jsonb not null,
  missing_fields text[] not null default '{}',
  confidence jsonb not null default '{}',
  source_message_ids text[] not null default '{}',
  source text not null check (source in ('ai','staff','confirmation','discard')),
  actor_id uuid,
  created_at timestamptz not null default now(),
  unique(draft_id, revision)
);

create table if not exists public.celebration_updates (
  id uuid primary key default gen_random_uuid(),
  invoice_id integer not null references public.invoices(id) on delete cascade,
  conversation_id uuid references public.whatsapp_conversations(id) on delete set null,
  outbox_id uuid references public.whatsapp_outbox(id) on delete set null,
  body text not null check (char_length(body) between 1 and 4000),
  status text not null default 'draft' check (status in ('draft','queued','sent','failed','cancelled')),
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.celebration_partner_quotes (
  id uuid primary key default gen_random_uuid(),
  invoice_id integer not null references public.invoices(id) on delete cascade,
  vendor_id integer not null references public.vendors(id) on delete cascade,
  amount numeric(12,2) check (amount is null or amount >= 0),
  status text not null default 'requested' check (status in ('requested','received','accepted','declined','expired')),
  notes text,
  requested_at timestamptz not null default now(),
  responded_at timestamptz,
  unique(invoice_id, vendor_id, status)
);

create table if not exists public.vendor_profiles (
  vendor_id integer primary key references public.vendors(id) on delete cascade,
  services text[] not null default '{}',
  service_areas text[] not null default '{}',
  reliability numeric(5,2) not null default 100 check (reliability between 0 and 100),
  active boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists public.mutation_idempotency_keys (
  id uuid primary key default gen_random_uuid(),
  scope text not null,
  idempotency_key text not null,
  response jsonb,
  created_at timestamptz not null default now(),
  unique(scope, idempotency_key)
);

alter table public.integration_commands
  add column if not exists attempts integer not null default 0,
  add column if not exists max_attempts integer not null default 5,
  add column if not exists last_attempt_at timestamptz;

create index if not exists ai_order_draft_revisions_draft_idx
  on public.ai_order_draft_revisions(draft_id, revision desc);
create unique index if not exists integration_commands_active_extraction_unique
  on public.integration_commands ((payload->>'conversationId'))
  where integration = 'whatsapp' and command = 'extract_conversation' and status in ('pending','processing');
create index if not exists celebration_updates_invoice_idx
  on public.celebration_updates(invoice_id, created_at desc);
create index if not exists celebration_partner_quotes_invoice_idx
  on public.celebration_partner_quotes(invoice_id, requested_at desc);

alter table public.ai_order_draft_revisions enable row level security;
alter table public.celebration_updates enable row level security;
alter table public.celebration_partner_quotes enable row level security;
alter table public.vendor_profiles enable row level security;
alter table public.mutation_idempotency_keys enable row level security;

insert into public.ai_order_draft_revisions
  (draft_id, revision, snapshot, missing_fields, confidence, source_message_ids, source)
select id, revision, snapshot, missing_fields, confidence, source_message_ids, 'ai'
from public.ai_order_drafts
on conflict (draft_id, revision) do nothing;

-- These records are accessed only by owner-authenticated server routes and the worker.
-- Browser policies intentionally remain absent.
