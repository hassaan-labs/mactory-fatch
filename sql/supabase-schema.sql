-- Run in Supabase SQL Editor before deploying to Vercel.
-- Keep service-role key private; never use it in browser code.
create extension if not exists pgcrypto;
create table if not exists public.manufacturer_submissions (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  legal_name text not null,
  registration_number text not null,
  registration_fingerprint text,
  status text not null default 'pending' check (status in ('pending','needs_more_info','approved','rejected')),
  public_listing_consent boolean not null default false,
  payload jsonb not null,
  screening jsonb not null,
  admin_note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  reviewed_at timestamptz
);
create index if not exists manufacturer_submissions_status_created_idx on public.manufacturer_submissions(status, created_at desc);
create index if not exists manufacturer_submissions_registration_idx on public.manufacturer_submissions(registration_number);
alter table public.manufacturer_submissions enable row level security;
-- Intentionally create no public policies. Access is server-side only via service-role key.

-- Fingerprint is a keyed HMAC, not the raw registration identifier. The application
-- clears it for rejected records and retains it for approved records to prevent duplicates.
alter table public.manufacturer_submissions
  add column if not exists registration_fingerprint text;
create unique index if not exists manufacturer_submissions_registration_fingerprint_uidx
  on public.manufacturer_submissions (registration_fingerprint)
  where registration_fingerprint is not null and registration_fingerprint <> '';


-- Private contact channel is retained only when a factory explicitly opts in to RFQ notifications.
alter table public.manufacturer_submissions add column if not exists rfq_contact_consent boolean not null default false;
alter table public.manufacturer_submissions add column if not exists factory_contact_email text not null default '';

create table if not exists public.factory_rfqs (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  factory_id uuid not null references public.manufacturer_submissions(id) on delete cascade,
  buyer_name text not null,
  buyer_email text not null,
  product text not null,
  quantity bigint not null check (quantity > 0),
  material text not null,
  budget text not null default '',
  delivery_date date,
  specifications text not null,
  notes text not null default '',
  status text not null default 'submitted' check (status in ('submitted','notified','response_received','closed','notification_failed')),
  supplier_response text not null default '',
  notification_status text not null default 'pending' check (notification_status in ('pending','sent','failed')),
  notification_error text not null default '',
  buyer_access_hash text not null,
  response_access_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  responded_at timestamptz
);
create index if not exists factory_rfqs_factory_created_idx on public.factory_rfqs(factory_id, created_at desc);
create index if not exists factory_rfqs_buyer_created_idx on public.factory_rfqs(buyer_email, created_at desc);
alter table public.factory_rfqs enable row level security;
-- No public policies. The API accesses this table only with the server-side service-role key.

-- Shared serverless rate limits. Keys are HMACs of client identifiers; raw IPs are not stored.
create table if not exists public.api_rate_limits (
  bucket_key text not null,
  window_start timestamptz not null,
  hits integer not null default 0,
  primary key (bucket_key, window_start)
);
alter table public.api_rate_limits enable row level security;
-- No public policies; only the server-side service role may call the rate-limit RPC.
create or replace function public.consume_rate_limit(
  p_bucket_key text,
  p_window_start timestamptz,
  p_limit integer,
  p_window_seconds integer
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  current_hits integer;
begin
  if p_limit < 1 or p_window_seconds < 1 then
    raise exception 'Invalid rate limit parameters';
  end if;
  insert into public.api_rate_limits as existing(bucket_key, window_start, hits)
  values (p_bucket_key, p_window_start, 1)
  on conflict (bucket_key, window_start)
  do update set hits = existing.hits + 1
  returning hits into current_hits;
  return current_hits <= p_limit;
end;
$$;
revoke all on function public.consume_rate_limit(text, timestamptz, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_rate_limit(text, timestamptz, integer, integer) to service_role;
