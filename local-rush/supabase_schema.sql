-- Local Rush - Supabase schema for multi-source place search cache.
-- Run this file in the Supabase SQL editor.

create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

create table if not exists public.search_cache (
  id uuid primary key default gen_random_uuid(),
  cache_key text unique not null,
  category text not null,
  city text not null,
  radius integer,
  lat double precision,
  lng double precision,
  result_count integer default 0,
  expires_at timestamptz not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  cache_id uuid references public.search_cache(id) on delete set null,
  name text not null,
  category text,
  address text,
  city text,
  district text,
  lat double precision,
  lng double precision,
  phone text,
  website text,
  instagram text,
  score integer default 0,
  saved boolean default false,
  source text,
  external_id text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  expires_at timestamptz,
  user_id uuid null,
  raw_data jsonb default '{}'::jsonb
);

create table if not exists public.lead_sources (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references public.leads(id) on delete cascade,
  source text not null,
  external_id text,
  raw_data jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

create index if not exists idx_search_cache_cache_key on public.search_cache(cache_key);
create index if not exists idx_search_cache_expires_at on public.search_cache(expires_at);
create index if not exists idx_search_cache_category_city on public.search_cache(category, city);
create index if not exists idx_search_cache_lat_lng on public.search_cache(lat, lng);

create index if not exists idx_leads_cache_id on public.leads(cache_id);
create index if not exists idx_leads_category_city on public.leads(category, city);
create index if not exists idx_leads_lat_lng on public.leads(lat, lng);
create index if not exists idx_leads_saved on public.leads(saved);
create index if not exists idx_leads_expires_unsaved on public.leads(expires_at) where saved = false;
create index if not exists idx_leads_user_saved on public.leads(user_id, saved);
create index if not exists idx_leads_name_trgm on public.leads using gin (name gin_trgm_ops);
create index if not exists idx_leads_phone on public.leads(phone) where phone is not null;
create index if not exists idx_leads_website on public.leads(lower(website)) where website is not null;
create unique index if not exists idx_leads_source_external_unique
  on public.leads(source, external_id)
  where source is not null and external_id is not null;

create index if not exists idx_lead_sources_lead_id on public.lead_sources(lead_id);
create unique index if not exists idx_lead_sources_unique
  on public.lead_sources(lead_id, source, external_id)
  where external_id is not null;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_search_cache_updated_at on public.search_cache;
create trigger trg_search_cache_updated_at
before update on public.search_cache
for each row execute function public.set_updated_at();

drop trigger if exists trg_leads_updated_at on public.leads;
create trigger trg_leads_updated_at
before update on public.leads
for each row execute function public.set_updated_at();

create or replace function public.replace_search_cache(
  p_cache_key text,
  p_category text,
  p_city text,
  p_radius integer,
  p_lat double precision,
  p_lng double precision,
  p_expires_at timestamptz,
  p_leads jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cache_id uuid;
  v_item jsonb;
  v_lead_id uuid;
  v_inserted integer := 0;
  v_source text;
  v_external_id text;
begin
  insert into public.search_cache (
    cache_key,
    category,
    city,
    radius,
    lat,
    lng,
    result_count,
    expires_at
  )
  values (
    p_cache_key,
    p_category,
    p_city,
    p_radius,
    p_lat,
    p_lng,
    coalesce(jsonb_array_length(p_leads), 0),
    p_expires_at
  )
  on conflict (cache_key)
  do update set
    category = excluded.category,
    city = excluded.city,
    radius = excluded.radius,
    lat = excluded.lat,
    lng = excluded.lng,
    result_count = excluded.result_count,
    expires_at = excluded.expires_at
  returning id into v_cache_id;

  update public.leads
  set cache_id = null, expires_at = null
  where cache_id = v_cache_id and saved = true;

  delete from public.leads
  where cache_id = v_cache_id and saved = false and user_id is null;

  for v_item in select value from jsonb_array_elements(coalesce(p_leads, '[]'::jsonb))
  loop
    v_source := nullif(v_item->>'source', '');
    v_external_id := nullif(v_item->>'external_id', '');
    v_lead_id := null;

    if v_source is not null and v_external_id is not null then
      select id into v_lead_id
      from public.leads
      where source = v_source and external_id = v_external_id
      limit 1;
    end if;

    if v_lead_id is null then
      insert into public.leads (
        cache_id,
        name,
        category,
        address,
        city,
        district,
        lat,
        lng,
        phone,
        website,
        instagram,
        score,
        saved,
        source,
        external_id,
        expires_at,
        raw_data
      )
      values (
        v_cache_id,
        coalesce(nullif(v_item->>'name', ''), 'Sem nome'),
        nullif(v_item->>'category', ''),
        nullif(v_item->>'address', ''),
        nullif(v_item->>'city', ''),
        nullif(v_item->>'district', ''),
        nullif(v_item->>'lat', '')::double precision,
        nullif(v_item->>'lng', '')::double precision,
        nullif(v_item->>'phone', ''),
        nullif(v_item->>'website', ''),
        nullif(v_item->>'instagram', ''),
        coalesce(nullif(v_item->>'score', '')::integer, 0),
        false,
        v_source,
        v_external_id,
        p_expires_at,
        coalesce(v_item->'raw_data', '{}'::jsonb)
      )
      returning id into v_lead_id;
    else
      update public.leads
      set
        cache_id = case when saved = true then cache_id else v_cache_id end,
        name = coalesce(nullif(v_item->>'name', ''), name),
        category = coalesce(nullif(v_item->>'category', ''), category),
        address = coalesce(nullif(v_item->>'address', ''), address),
        city = coalesce(nullif(v_item->>'city', ''), city),
        district = coalesce(nullif(v_item->>'district', ''), district),
        lat = coalesce(nullif(v_item->>'lat', '')::double precision, lat),
        lng = coalesce(nullif(v_item->>'lng', '')::double precision, lng),
        phone = coalesce(nullif(v_item->>'phone', ''), phone),
        website = coalesce(nullif(v_item->>'website', ''), website),
        instagram = coalesce(nullif(v_item->>'instagram', ''), instagram),
        score = greatest(score, coalesce(nullif(v_item->>'score', '')::integer, 0)),
        expires_at = case when saved = true then expires_at else p_expires_at end,
        raw_data = coalesce(v_item->'raw_data', raw_data)
      where id = v_lead_id;
    end if;

    if v_source is not null then
      insert into public.lead_sources (lead_id, source, external_id, raw_data)
      values (
        v_lead_id,
        v_source,
        v_external_id,
        coalesce(v_item->'raw_data', '{}'::jsonb)
      )
      on conflict do nothing;
    end if;

    v_inserted := v_inserted + 1;
  end loop;

  update public.search_cache
  set result_count = v_inserted
  where id = v_cache_id;

  return jsonb_build_object('cache_id', v_cache_id, 'lead_count', v_inserted);
end;
$$;

create or replace function public.mark_lead_saved(
  p_lead_id uuid,
  p_user_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.leads
  set
    saved = true,
    user_id = coalesce(p_user_id, user_id),
    expires_at = null
  where id = p_lead_id;

  if not found then
    return jsonb_build_object('saved', false, 'reason', 'not_found');
  end if;

  return jsonb_build_object('saved', true, 'lead_id', p_lead_id);
end;
$$;

create or replace function public.cleanup_expired_cache()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted_leads integer := 0;
  v_deleted_cache integer := 0;
begin
  delete from public.leads
  where saved = false
    and user_id is null
    and expires_at is not null
    and expires_at < now();
  get diagnostics v_deleted_leads = row_count;

  delete from public.search_cache
  where expires_at < now();
  get diagnostics v_deleted_cache = row_count;

  return jsonb_build_object(
    'deleted_leads', v_deleted_leads,
    'deleted_cache', v_deleted_cache
  );
end;
$$;

alter table public.search_cache enable row level security;
alter table public.leads enable row level security;
alter table public.lead_sources enable row level security;

drop policy if exists "authenticated users can read own saved leads" on public.leads;
create policy "authenticated users can read own saved leads"
on public.leads
for select
to authenticated
using (saved = true and user_id = auth.uid());

drop policy if exists "authenticated users can update own saved leads" on public.leads;
create policy "authenticated users can update own saved leads"
on public.leads
for update
to authenticated
using (saved = true and user_id = auth.uid())
with check (saved = true and user_id = auth.uid());

drop policy if exists "authenticated users can read own lead sources" on public.lead_sources;
create policy "authenticated users can read own lead sources"
on public.lead_sources
for select
to authenticated
using (
  exists (
    select 1
    from public.leads
    where leads.id = lead_sources.lead_id
      and leads.saved = true
      and leads.user_id = auth.uid()
  )
);

-- Backend queries use SUPABASE_SERVICE_ROLE_KEY and bypass RLS.
-- Keep search_cache without public policies; cache reads/writes should go through the backend.

grant execute on function public.replace_search_cache(
  text,
  text,
  text,
  integer,
  double precision,
  double precision,
  timestamptz,
  jsonb
) to service_role;
grant execute on function public.mark_lead_saved(uuid, uuid) to service_role;
grant execute on function public.cleanup_expired_cache() to service_role;

-- Optional pg_cron schedule. Enable the pg_cron extension in Supabase first.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    begin
      perform cron.unschedule('local-rush-cleanup-expired-cache');
    exception
      when others then
        null;
    end;

    perform cron.schedule(
      'local-rush-cleanup-expired-cache',
      '0 4 * * *',
      'select public.cleanup_expired_cache();'
    );
  end if;
end $$;
