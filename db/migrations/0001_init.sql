-- Mathaka Celebration Studio — baseline schema.
-- Money is stored as numeric(12,2) in the business currency (LKR by default).

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Team & sessions
-- ---------------------------------------------------------------------------

create table users (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  name text not null,
  role text not null check (role in ('owner', 'manager', 'staff')),
  password_hash text not null,
  active boolean not null default true,
  must_change_password boolean not null default false,
  last_login_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index users_email_unique on users (lower(email));

create table sessions (
  token_hash text primary key,
  user_id uuid not null references users (id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index sessions_user_idx on sessions (user_id);

create table login_attempts (
  id bigserial primary key,
  email text not null,
  succeeded boolean not null,
  attempted_at timestamptz not null default now()
);
create index login_attempts_email_idx on login_attempts (lower(email), attempted_at desc);

-- ---------------------------------------------------------------------------
-- Business settings (single row)
-- ---------------------------------------------------------------------------

create table settings (
  id integer primary key default 1 check (id = 1),
  business_name text not null default 'Mathaka',
  tagline text not null default 'Celebration studio',
  phone text not null default '',
  email text not null default '',
  address text not null default '',
  website text not null default '',
  logo_key text,
  currency char(3) not null default 'LKR',
  invoice_prefix text not null default 'INV',
  receipt_prefix text not null default 'RCT',
  quote_prefix text not null default 'QUO',
  number_padding integer not null default 4 check (number_padding between 3 and 8),
  next_invoice_number integer not null default 1 check (next_invoice_number > 0),
  next_receipt_number integer not null default 1 check (next_receipt_number > 0),
  next_quote_number integer not null default 1 check (next_quote_number > 0),
  default_due_days integer not null default 3 check (default_due_days between 0 and 90),
  default_advance_percent numeric(5, 2) not null default 50 check (default_advance_percent between 0 and 100),
  payment_instructions text not null default '',
  bank_details text not null default '',
  invoice_footer text not null default 'Thank you for celebrating with us.',
  split_owner_label text not null default 'Sachin',
  split_partner_label text not null default 'Sister',
  split_owner_percent numeric(5, 2) not null default 80 check (split_owner_percent between 0 and 100),
  updated_at timestamptz not null default now()
);
insert into settings (id) values (1);

create table terms (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  is_default boolean not null default true,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
insert into terms (title, body, sort_order) values
  ('Advance payment', 'A 50% advance confirms your order. The balance is due before delivery.', 1),
  ('Delivery', 'Delivery times are approximate and may vary with traffic and weather.', 2),
  ('Cancellations', 'Advances are non-refundable once the cake or gifts have been prepared.', 3);

-- ---------------------------------------------------------------------------
-- Customers & partners
-- ---------------------------------------------------------------------------

create table customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text not null default '',
  country text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now()
);
create index customers_phone_idx on customers (regexp_replace(phone, '\D', '', 'g'));

create table partners (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  business_name text not null default '',
  phone text not null default '',
  city text not null,
  address text not null default '',
  services text[] not null default '{}',
  service_radius_km integer not null default 10 check (service_radius_km between 0 and 300),
  extra_cities text[] not null default '{}',
  rating integer check (rating between 1 and 5),
  bank_details text not null default '',
  notes text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index partners_city_idx on partners (lower(city));

-- ---------------------------------------------------------------------------
-- Orders
-- ---------------------------------------------------------------------------

create sequence order_number_seq;

create table orders (
  id uuid primary key default gen_random_uuid(),
  number text not null unique default ('ORD-' || lpad(nextval('order_number_seq')::text, 4, '0')),
  customer_id uuid not null references customers (id) on delete restrict,
  recipient_name text not null,
  recipient_phone text not null default '',
  delivery_address text not null default '',
  city text not null,
  occasion text not null default '',
  delivery_date date,
  delivery_time text not null default '',
  status text not null default 'confirmed'
    check (status in ('enquiry', 'confirmed', 'in_progress', 'out_for_delivery', 'delivered', 'completed', 'cancelled')),
  source text not null default 'facebook_ad' check (source in ('facebook_ad', 'repeat', 'referral', 'other')),
  special_request text not null default '',
  internal_notes text not null default '',
  discount numeric(12, 2) not null default 0 check (discount >= 0),
  delivery_fee numeric(12, 2) not null default 0 check (delivery_fee >= 0),
  gallery_token_hash text unique,
  created_by uuid references users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  delivered_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz
);
create index orders_status_idx on orders (status, delivery_date);
create index orders_customer_idx on orders (customer_id);
create index orders_city_idx on orders (lower(city));

create table order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders (id) on delete cascade,
  description text not null,
  quantity numeric(10, 2) not null default 1 check (quantity > 0),
  unit_price numeric(12, 2) not null default 0 check (unit_price >= 0),
  sort_order integer not null default 0
);
create index order_items_order_idx on order_items (order_id, sort_order);

-- A partner doing (part of) an order. agreed_amount is what we owe them.
create table partner_jobs (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders (id) on delete restrict,
  partner_id uuid not null references partners (id) on delete restrict,
  description text not null,
  agreed_amount numeric(12, 2) not null default 0 check (agreed_amount >= 0),
  status text not null default 'assigned' check (status in ('assigned', 'accepted', 'ready', 'delivered', 'cancelled')),
  share_token_hash text unique,
  share_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index partner_jobs_order_idx on partner_jobs (order_id);
create index partner_jobs_partner_idx on partner_jobs (partner_id, status);

-- Money we pay partners. job_id is optional so general advances are possible.
create table partner_payments (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references partners (id) on delete restrict,
  job_id uuid references partner_jobs (id) on delete set null,
  amount numeric(12, 2) not null check (amount > 0),
  kind text not null default 'advance' check (kind in ('advance', 'final', 'other')),
  method text not null default 'bank_transfer',
  reference text not null default '',
  paid_on date not null default current_date,
  notes text not null default '',
  created_by uuid references users (id) on delete set null,
  created_at timestamptz not null default now(),
  voided_at timestamptz,
  void_reason text
);
create index partner_payments_partner_idx on partner_payments (partner_id, paid_on desc);

-- Money customers pay us.
create table customer_payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders (id) on delete restrict,
  amount numeric(12, 2) not null check (amount > 0),
  method text not null default 'bank_transfer',
  reference text not null default '',
  received_on date not null default current_date,
  proof_key text,
  status text not null default 'verified' check (status in ('pending', 'verified', 'reversed')),
  notes text not null default '',
  recorded_by uuid references users (id) on delete set null,
  verified_by uuid references users (id) on delete set null,
  verified_at timestamptz,
  reversed_at timestamptz,
  reversal_reason text,
  created_at timestamptz not null default now()
);
create index customer_payments_order_idx on customer_payments (order_id);
create index customer_payments_received_idx on customer_payments (received_on);

create table expenses (
  id uuid primary key default gen_random_uuid(),
  spent_on date not null default current_date,
  category text not null check (category in ('meta_ads', 'packaging', 'delivery', 'transport', 'phone_internet', 'bank_fees', 'software', 'other')),
  description text not null,
  amount numeric(12, 2) not null check (amount > 0),
  order_id uuid references orders (id) on delete set null,
  receipt_key text,
  created_by uuid references users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index expenses_spent_idx on expenses (spent_on desc);
create index expenses_order_idx on expenses (order_id);

create table order_media (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders (id) on delete cascade,
  kind text not null check (kind in ('photo', 'video')),
  storage_key text not null,
  content_type text not null,
  caption text not null default '',
  uploaded_by text not null,
  created_at timestamptz not null default now()
);
create index order_media_order_idx on order_media (order_id, created_at);

-- ---------------------------------------------------------------------------
-- Customer documents: quotes, invoices, receipts
-- Drafts read live order data; issuing freezes everything into `snapshot`.
-- ---------------------------------------------------------------------------

create table documents (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders (id) on delete restrict,
  kind text not null check (kind in ('quote', 'invoice', 'receipt')),
  number text unique,
  status text not null default 'draft' check (status in ('draft', 'issued', 'void')),
  payment_id uuid references customer_payments (id) on delete restrict,
  amount_requested numeric(12, 2) check (amount_requested is null or amount_requested > 0),
  due_date date,
  term_ids uuid[] not null default '{}',
  extra_terms text not null default '',
  notes text not null default '',
  snapshot jsonb,
  share_token_hash text unique,
  share_expires_at timestamptz,
  created_by uuid references users (id) on delete set null,
  issued_by uuid references users (id) on delete set null,
  created_at timestamptz not null default now(),
  issued_at timestamptz,
  voided_at timestamptz,
  void_reason text,
  check (kind <> 'receipt' or payment_id is not null)
);
create index documents_order_idx on documents (order_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Profit split history. Closing a month freezes its numbers and split.
-- ---------------------------------------------------------------------------

create table month_closes (
  month date primary key check (extract(day from month) = 1),
  revenue numeric(12, 2) not null,
  partner_costs numeric(12, 2) not null,
  order_expenses numeric(12, 2) not null,
  business_expenses numeric(12, 2) not null,
  net_profit numeric(12, 2) not null,
  owner_label text not null,
  partner_label text not null,
  owner_percent numeric(5, 2) not null,
  owner_share numeric(12, 2) not null,
  partner_share numeric(12, 2) not null,
  closed_by uuid references users (id) on delete set null,
  closed_at timestamptz not null default now()
);

create table audit_log (
  id bigserial primary key,
  user_id uuid references users (id) on delete set null,
  action text not null,
  entity text not null,
  entity_id text,
  details jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index audit_log_entity_idx on audit_log (entity, entity_id, created_at desc);
