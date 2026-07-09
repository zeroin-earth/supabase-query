-- =============================================================================
-- @zeroin.earth/supabase-query — push device-tokens schema-of-record (v1).
--
-- The library OWNS this schema (migration plan §6.6 / §8.12), exactly like the
-- teams schema. The `push/` hooks hard-code these columns, the `onConflict`
-- target, and the platform/provider checks, and the `send-push` Edge Function
-- reads the same columns — so neither the platform nor the consumer owns the
-- shape; the library must ship it. Install into a project with:
--
--     npx @zeroin.earth/supabase-query add push    # stamps a migration
--     supabase db reset                            # (or db push) applies it
--     supabase gen types typescript --local > ...  # regenerate Database types
--
-- ⚠️ This SQL is only part of the push install. push also ships the `send-push`
-- Edge Function (deploy separately) + provider secrets (FCM_SERVICE_ACCOUNT,
-- optional EXPO_ACCESS_TOKEN). See migration plan §8.12.
--
-- The `sq-push:N` table comment is a version marker the installer reads to skip
-- an already-applied version (and to detect drift across projects).
-- =============================================================================

create table public.device_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  token text not null,
  platform text not null check (platform in ('ios', 'android', 'web')),
  provider text not null check (provider in ('expo', 'fcm')),
  created_at timestamptz not null default now(),
  unique (user_id, token)
);
comment on table public.device_tokens is 'sq-push:1'; -- version marker (installer/hooks read this)

create index on public.device_tokens (user_id);

-- RLS: a user manages only their own tokens.
alter table public.device_tokens enable row level security;

create policy "own tokens" on public.device_tokens
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- `authenticated` manages own tokens via RLS; the `send-push` Edge Function
-- reads tokens with the SERVICE ROLE and 403s "permission denied for table"
-- without an explicit GRANT (the P4/P9 gotcha: a missing table privilege is a
-- distinct failure from an RLS denial).
grant select, insert, update, delete on public.device_tokens to authenticated, service_role;
