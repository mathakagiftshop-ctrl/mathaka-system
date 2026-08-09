-- Non-destructive additions for the existing Mathaka database.
-- The legacy system uses invoices as orders, vendors as partners, and integer IDs.

create extension if not exists pgcrypto;

create table if not exists public.celebration_journeys (
  id uuid primary key default gen_random_uuid(),
  invoice_id integer not null unique references public.invoices(id) on delete cascade,
  delivery_at timestamptz,
  fulfilment_mode text not null default 'self' check (fulfilment_mode in ('self','partner','hybrid')),
  journey_status text not null default 'details' check (journey_status in ('details','confirmed','preparing','delivery','memories','reconciled','cancelled')),
  special_request text,
  customer_update_cadence text not null default 'milestone',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.celebration_tasks (
  id uuid primary key default gen_random_uuid(),
  invoice_id integer not null references public.invoices(id) on delete cascade,
  title text not null,
  kind text not null default 'other',
  assignee_name text,
  due_at timestamptz,
  completed_at timestamptz,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.celebration_media_requirements (
  invoice_id integer primary key references public.invoices(id) on delete cascade,
  minimum_photos integer not null default 3 check (minimum_photos >= 0),
  minimum_videos integer not null default 1 check (minimum_videos >= 0)
);

create table if not exists public.celebration_media (
  id uuid primary key default gen_random_uuid(),
  invoice_id integer not null references public.invoices(id) on delete cascade,
  kind text not null check (kind in ('photo','video')),
  storage_path text not null,
  caption text,
  uploaded_by text,
  created_at timestamptz not null default now()
);

create table if not exists public.celebration_share_links (
  id uuid primary key default gen_random_uuid(),
  invoice_id integer not null references public.invoices(id) on delete cascade,
  token_hash text not null unique,
  purpose text not null check (purpose in ('partner','gallery')),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.whatsapp_connections (
  id uuid primary key default gen_random_uuid(),
  label text not null default 'Mathaka Business',
  phone_number text,
  status text not null default 'disconnected' check (status in ('disconnected','pairing','connected','reconnecting','error')),
  worker_id text,
  encrypted_auth_state jsonb,
  pairing_payload jsonb,
  pairing_expires_at timestamptz,
  last_connected_at timestamptz,
  last_heartbeat_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.whatsapp_conversations (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.whatsapp_connections(id) on delete cascade,
  external_chat_id text not null,
  customer_id integer references public.customers(id) on delete set null,
  vendor_id integer references public.vendors(id) on delete set null,
  contact_kind text not null default 'unknown' check (contact_kind in ('customer','recipient','vendor','unknown')),
  created_at timestamptz not null default now(),
  unique(connection_id, external_chat_id)
);

create table if not exists public.whatsapp_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.whatsapp_conversations(id) on delete cascade,
  invoice_id integer references public.invoices(id) on delete set null,
  external_message_id text not null unique,
  direction text not null check (direction in ('inbound','outbound')),
  body text,
  media_storage_path text,
  media_mime_type text,
  sent_at timestamptz not null,
  raw_payload jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists public.ai_extracted_facts (
  id uuid primary key default gen_random_uuid(),
  invoice_id integer not null references public.invoices(id) on delete cascade,
  field_path text not null,
  value jsonb not null,
  confidence numeric(5,4),
  source_message_ids text[] not null default '{}',
  confirmed_at timestamptz,
  superseded_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.whatsapp_outbox (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid references public.whatsapp_connections(id) on delete cascade,
  invoice_id integer references public.invoices(id) on delete set null,
  chat_id text not null,
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending','processing','sent','failed','cancelled')),
  idempotency_key text unique,
  attempts integer not null default 0,
  available_at timestamptz not null default now(),
  sent_at timestamptz,
  last_error text,
  created_at timestamptz not null default now()
);

create table if not exists public.integration_commands (
  id uuid primary key default gen_random_uuid(),
  integration text not null,
  command text not null,
  payload jsonb not null default '{}',
  status text not null default 'pending' check (status in ('pending','processing','completed','failed','cancelled')),
  requested_by uuid,
  available_at timestamptz not null default now(),
  completed_at timestamptz,
  last_error text,
  created_at timestamptz not null default now()
);

create index if not exists celebration_tasks_invoice_idx on public.celebration_tasks(invoice_id, sort_order);
create index if not exists celebration_media_invoice_idx on public.celebration_media(invoice_id, kind);
create index if not exists whatsapp_messages_conversation_idx on public.whatsapp_messages(conversation_id, sent_at desc);
create index if not exists whatsapp_messages_invoice_idx on public.whatsapp_messages(invoice_id, sent_at desc);
create index if not exists whatsapp_outbox_pending_idx on public.whatsapp_outbox(status, available_at) where status = 'pending';
create index if not exists integration_commands_pending_idx on public.integration_commands(integration, status, available_at) where status = 'pending';

alter table public.celebration_journeys enable row level security;
alter table public.celebration_tasks enable row level security;
alter table public.celebration_media_requirements enable row level security;
alter table public.celebration_media enable row level security;
alter table public.celebration_share_links enable row level security;
alter table public.whatsapp_connections enable row level security;
alter table public.whatsapp_conversations enable row level security;
alter table public.whatsapp_messages enable row level security;
alter table public.ai_extracted_facts enable row level security;
alter table public.whatsapp_outbox enable row level security;
alter table public.integration_commands enable row level security;

-- Intentionally no browser policies yet. These tables are accessed server-side until
-- staff membership and authenticated RLS policies are introduced.
