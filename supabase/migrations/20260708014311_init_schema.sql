-- =============================================================================
-- P4 test-fixture schema for @zeroin.earth/supabase-query.
-- Implements migration-plan manual steps: §8.3 (schema), §8.4 (RLS),
-- §8.5 (realtime), §8.7 (increment RPC + PostGIS geo RPC).
--
-- Apply locally:      supabase db reset
-- Regenerate types:   supabase gen types typescript --local > tests/database.types.ts
-- =============================================================================

-- Extensions ------------------------------------------------------------------
-- moddatetime backs the updated_at trigger; postgis backs the geo QueryBuilder.
create extension if not exists moddatetime schema extensions;
create extension if not exists postgis with schema extensions;

-- todos: CRUD + optimistic + realtime + increment/decrement fixture -----------
create table public.todos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  done boolean not null default false,
  -- numeric column so useIncrementColumn/useDecrementColumn have something to hit
  priority integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- keep updated_at fresh on every UPDATE (lets update tests assert the bump)
create trigger todos_set_updated_at
  before update on public.todos
  for each row execute function extensions.moddatetime (updated_at);

alter table public.todos enable row level security;

-- Table-level privileges for the PostgREST API roles. RLS (below) still gates
-- which *rows* each user sees; these grants gate access to the table at all.
grant select, insert, update, delete on public.todos to authenticated;

create policy "select own" on public.todos
  for select using (auth.uid() = user_id);
create policy "insert own" on public.todos
  for insert with check (auth.uid() = user_id);
create policy "update own" on public.todos
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "delete own" on public.todos
  for delete using (auth.uid() = user_id);

-- realtime: publish todos + include the full old row on UPDATE/DELETE payloads
alter publication supabase_realtime add table public.todos;
alter table public.todos replica identity full;

-- places: PostGIS fixture for QueryBuilder distance*/spatial methods ----------
create table public.places (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  location extensions.geography (Point, 4326) not null,
  created_at timestamptz not null default now()
);
create index places_location_gix on public.places using gist (location);

alter table public.places enable row level security;
grant select on public.places to anon, authenticated;
grant insert on public.places to authenticated;
-- Permissive for the fixture: a "places near me" search reads everyone's rows,
-- and the suite seeds rows via a normal authenticated client. Tighten per app.
create policy "places readable" on public.places
  for select using (true);
create policy "places insertable" on public.places
  for insert to authenticated with check (true);

-- RPCs ------------------------------------------------------------------------

-- Generic increment/decrement (§6.4 / §8.7). SECURITY DEFINER + dynamic SQL
-- bypasses RLS, so it trusts the caller — a typed, per-table RPC is safer in
-- production; this is fine as a test fixture. `set search_path = ''` hardens the
-- dynamic statement (table/column names stay fully qualified below).
create or replace function public.increment_column(
  p_table text, p_id uuid, p_column text, p_amount int
) returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  execute format('update public.%I set %I = %I + $1 where id = $2', p_table, p_column, p_column)
    using p_amount, p_id;
end; $$;

-- Radius search backing QueryBuilder.distanceLessThan('location', lat, lng, m).
-- STABLE + SECURITY INVOKER (the default), so RLS on places still applies. The
-- P4 db layer routes a query whose geoOps() holds a distance predicate to this
-- RPC via .rpc('places_within', …) instead of .from('places').select().
create or replace function public.places_within(
  p_lat float8, p_lng float8, p_meters float8
) returns setof public.places
  language sql
  stable
  set search_path = public, extensions
as $$
  select * from public.places
  where st_dwithin(location, st_makepoint(p_lng, p_lat)::geography, p_meters);
$$;
