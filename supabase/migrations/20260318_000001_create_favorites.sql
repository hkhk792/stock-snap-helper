-- Create favorites table for fund watchlist
create table if not exists public.favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  fund_code text not null,
  fund_name text not null,
  created_at timestamptz not null default now()
);

create index if not exists favorites_user_id_idx on public.favorites (user_id);
create unique index if not exists favorites_user_code_idx on public.favorites (user_id, fund_code);

-- RLS policies
alter table public.favorites enable row level security;

create policy "Users can view their own favorites" on public.favorites
  for select
  using (auth.uid() = user_id);

create policy "Users can insert their own favorites" on public.favorites
  for insert
  with check (auth.uid() = user_id);

create policy "Users can delete their own favorites" on public.favorites
  for delete
  using (auth.uid() = user_id);
