-- Team access, studio settings, and customer-facing billing documents.
-- The legacy public.invoices table remains the mutable celebration/order record.
create extension if not exists pgcrypto;

do $$ begin
  if to_regclass('public.invoices') is null or to_regclass('public.invoice_items') is null or to_regclass('public.payments') is null then
    raise exception 'Mathaka legacy billing tables are missing';
  end if;
end $$;

create table if not exists public.studio_organizations (
  id uuid primary key default gen_random_uuid(), name text not null default 'Mathaka', email text, phone text, address text,
  logo_storage_path text, registration_number text, tax_identifier text, currency char(3) not null default 'LKR',
  timezone text not null default 'Asia/Colombo', created_by uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
insert into public.studio_organizations (name) select 'Mathaka' where not exists (select 1 from public.studio_organizations);

create table if not exists public.studio_members (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.studio_organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null, email text not null, display_name text,
  role text not null check (role in ('owner','manager','staff')), status text not null default 'active' check (status in ('invited','active','suspended')),
  invited_by uuid, accepted_at timestamptz, last_seen_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(organization_id,user_id)
);
create unique index if not exists studio_members_email_unique on public.studio_members(organization_id,lower(email));

create table if not exists public.studio_invitations (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.studio_organizations(id) on delete cascade,
  email text not null, display_name text, role text not null check (role in ('manager','staff')), auth_user_id uuid,
  status text not null default 'pending' check (status in ('pending','accepted','revoked','expired')), expires_at timestamptz not null,
  invited_by uuid not null, accepted_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index if not exists studio_invitations_pending_unique on public.studio_invitations(organization_id,lower(email)) where status='pending';

create table if not exists public.studio_invoice_settings (
  organization_id uuid primary key references public.studio_organizations(id) on delete cascade, number_prefix text not null default 'MTH',
  next_number bigint not null default 1 check(next_number > 0), number_padding integer not null default 5 check(number_padding between 3 and 12),
  default_due_days integer not null default 7 check(default_due_days between 0 and 365), default_terms text not null default '',
  payment_instructions text not null default '', bank_details jsonb not null default '{}', default_deposit_percent numeric(5,2) not null default 50 check(default_deposit_percent between 0 and 100),
  footer_text text not null default '', revision integer not null default 1, updated_by uuid, updated_at timestamptz not null default now()
);
insert into public.studio_invoice_settings(organization_id) select id from public.studio_organizations on conflict do nothing;

create table if not exists public.billing_documents (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.studio_organizations(id) on delete restrict,
  invoice_id integer not null references public.invoices(id) on delete restrict, document_type text not null check(document_type in ('quote','proforma','invoice','receipt','credit_note')),
  document_number text, status text not null default 'draft' check(status in ('draft','issued','partially_paid','paid','overdue','void')),
  revision integer not null default 1, currency char(3) not null default 'LKR', issue_date date, due_date date, requested_payment_amount numeric(12,2),
  subtotal numeric(12,2) not null default 0, discount numeric(12,2) not null default 0, delivery_fee numeric(12,2) not null default 0,
  tax_amount numeric(12,2) not null default 0, total numeric(12,2) not null default 0, customer_snapshot jsonb not null default '{}', business_snapshot jsonb not null default '{}',
  terms_snapshot text not null default '', payment_instructions_snapshot text not null default '', bank_details_snapshot jsonb not null default '{}',
  pdf_storage_path text, pdf_sha256 text, created_by uuid not null, issued_by uuid, voided_by uuid, void_reason text, issued_at timestamptz, voided_at timestamptz,
  approval_status text not null default 'pending' check(approval_status in ('not_requested','pending','approved','declined')), approved_at timestamptz, approval_note text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(organization_id,document_type,document_number)
);
create index if not exists billing_documents_invoice_idx on public.billing_documents(invoice_id,created_at desc);

create table if not exists public.billing_document_items (
  id uuid primary key default gen_random_uuid(), billing_document_id uuid not null references public.billing_documents(id) on delete cascade,
  sort_order integer not null default 0, description text not null, quantity numeric(9,2) not null default 1, unit_price numeric(12,2) not null default 0,
  discount numeric(12,2) not null default 0, tax_amount numeric(12,2) not null default 0, line_total numeric(12,2) not null default 0
);
create table if not exists public.billing_payment_allocations (
  id uuid primary key default gen_random_uuid(), billing_document_id uuid not null references public.billing_documents(id) on delete cascade,
  payment_id integer not null references public.payments(id) on delete restrict, amount numeric(12,2) not null check(amount>0), allocated_by uuid not null,
  allocated_at timestamptz not null default now(), unique(billing_document_id,payment_id)
);
create table if not exists public.billing_share_links (
  id uuid primary key default gen_random_uuid(), billing_document_id uuid not null references public.billing_documents(id) on delete cascade,
  token_hash text not null unique, expires_at timestamptz not null, revoked_at timestamptz, created_by uuid not null, created_at timestamptz not null default now()
);
create table if not exists public.studio_audit_events (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.studio_organizations(id) on delete cascade,
  actor_id uuid, event_type text not null, entity_type text not null, entity_id text, payload jsonb not null default '{}', created_at timestamptz not null default now()
);
create table if not exists public.studio_catalog_items (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.studio_organizations(id) on delete cascade,
 name text not null,category text not null default 'other',description text,unit_price numeric(12,2) not null default 0,cost_price numeric(12,2) not null default 0,
 active boolean not null default true,created_by uuid,created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create table if not exists public.studio_inventory_items (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.studio_organizations(id) on delete cascade,
 catalog_item_id uuid references public.studio_catalog_items(id) on delete set null,name text not null,sku text,unit text not null default 'item',
 quantity_on_hand numeric(12,2) not null default 0,reorder_level numeric(12,2) not null default 0,active boolean not null default true,
 created_by uuid,created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create unique index if not exists studio_inventory_sku_unique on public.studio_inventory_items(organization_id,lower(sku)) where sku is not null;
create table if not exists public.studio_inventory_adjustments (
 id uuid primary key default gen_random_uuid(),inventory_item_id uuid not null references public.studio_inventory_items(id) on delete cascade,
 quantity_delta numeric(12,2) not null check(quantity_delta<>0),reason text not null,reference text,created_by uuid not null,created_at timestamptz not null default now()
);
create table if not exists public.studio_task_templates (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.studio_organizations(id) on delete cascade,
 name text not null,occasion text,active boolean not null default true,steps jsonb not null default '[]',created_by uuid,created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create table if not exists public.studio_terms_templates (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.studio_organizations(id) on delete cascade,
 name text not null,body text not null,is_default boolean not null default false,active boolean not null default true,
 created_by uuid,updated_by uuid,created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create unique index if not exists studio_terms_one_default on public.studio_terms_templates(organization_id) where is_default and active;
insert into public.studio_terms_templates(organization_id,name,body,is_default,active)
select organization_id,'Default invoice terms',default_terms,true,true from public.studio_invoice_settings s
where default_terms<>'' and not exists(select 1 from public.studio_terms_templates t where t.organization_id=s.organization_id);

alter table public.payments add column if not exists received_at timestamptz, add column if not exists reference text,
  add column if not exists proof_storage_path text, add column if not exists verification_status text,
  add column if not exists recorded_by uuid, add column if not exists verified_by uuid, add column if not exists verified_at timestamptz,
  add column if not exists reversed_by uuid, add column if not exists reversed_at timestamptz, add column if not exists reversal_reason text;
update public.payments set verification_status='verified', verified_at=coalesce(verified_at,now()), received_at=coalesce(received_at,now()) where verification_status is null;
alter table public.payments alter column verification_status set default 'pending';
do $$ begin
  if not exists(select 1 from pg_constraint where conname='payments_verification_status_check') then
    alter table public.payments add constraint payments_verification_status_check check(verification_status in ('pending','verified','reversed'));
  end if;
end $$;

alter table public.studio_organizations enable row level security; alter table public.studio_members enable row level security;
alter table public.studio_invitations enable row level security; alter table public.studio_invoice_settings enable row level security;
alter table public.billing_documents enable row level security; alter table public.billing_document_items enable row level security;
alter table public.billing_payment_allocations enable row level security; alter table public.billing_share_links enable row level security;
alter table public.studio_audit_events enable row level security;
alter table public.studio_catalog_items enable row level security; alter table public.studio_inventory_items enable row level security;
alter table public.studio_inventory_adjustments enable row level security; alter table public.studio_task_templates enable row level security;
alter table public.studio_terms_templates enable row level security;
-- Intentionally no browser policies: all access remains through authenticated server routes.
