-- AI drafts can exist before a legacy invoice/order is confirmed.
create table if not exists public.ai_order_drafts (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null unique references public.whatsapp_conversations(id) on delete cascade,
  invoice_id integer references public.invoices(id) on delete set null,
  snapshot jsonb not null default '{}',
  missing_fields text[] not null default '{}',
  confidence jsonb not null default '{}',
  source_message_ids text[] not null default '{}',
  status text not null default 'draft' check (status in ('draft','reviewed','confirmed','discarded')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists whatsapp_connections_worker_id_unique
  on public.whatsapp_connections(worker_id)
  where worker_id is not null;

alter table public.ai_order_drafts enable row level security;
