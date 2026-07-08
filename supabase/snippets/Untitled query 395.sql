alter table public.todos enable row level security;

create policy "select own" on public.todos
  for select using (auth.uid() = user_id);
create policy "insert own" on public.todos
  for insert with check (auth.uid() = user_id);
create policy "update own" on public.todos
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "delete own" on public.todos
  for delete using (auth.uid() = user_id);