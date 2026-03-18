-- RealValue: portfolios + holdings persistence
-- This migration is intended for Supabase Postgres.

create extension if not exists "pgcrypto";

create table if not exists public.portfolios (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  base_nav numeric not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists portfolios_user_id_idx on public.portfolios (user_id);

create table if not exists public.portfolio_holdings (
  id uuid primary key default gen_random_uuid(),
  portfolio_id uuid not null references public.portfolios (id) on delete cascade,
  name text not null default '',
  code text not null default '',
  weight numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists portfolio_holdings_portfolio_id_idx on public.portfolio_holdings (portfolio_id);

-- updated_at trigger helper
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_updated_at_portfolios on public.portfolios;
create trigger set_updated_at_portfolios
before update on public.portfolios
for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at_portfolio_holdings on public.portfolio_holdings;
create trigger set_updated_at_portfolio_holdings
before update on public.portfolio_holdings
for each row execute function public.set_updated_at();

-- RLS
alter table public.portfolios enable row level security;
alter table public.portfolio_holdings enable row level security;

-- Portfolios policies
drop policy if exists portfolios_select_own on public.portfolios;
create policy portfolios_select_own
on public.portfolios
for select
using (auth.uid() = user_id);

drop policy if exists portfolios_insert_own on public.portfolios;
create policy portfolios_insert_own
on public.portfolios
for insert
with check (auth.uid() = user_id);

drop policy if exists portfolios_update_own on public.portfolios;
create policy portfolios_update_own
on public.portfolios
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists portfolios_delete_own on public.portfolios;
create policy portfolios_delete_own
on public.portfolios
for delete
using (auth.uid() = user_id);

-- Holdings policies (via parent portfolio ownership)
drop policy if exists holdings_select_own on public.portfolio_holdings;
create policy holdings_select_own
on public.portfolio_holdings
for select
using (
  exists (
    select 1
    from public.portfolios p
    where p.id = portfolio_holdings.portfolio_id
      and p.user_id = auth.uid()
  )
);

drop policy if exists holdings_insert_own on public.portfolio_holdings;
create policy holdings_insert_own
on public.portfolio_holdings
for insert
with check (
  exists (
    select 1
    from public.portfolios p
    where p.id = portfolio_holdings.portfolio_id
      and p.user_id = auth.uid()
  )
);

drop policy if exists holdings_update_own on public.portfolio_holdings;
create policy holdings_update_own
on public.portfolio_holdings
for update
using (
  exists (
    select 1
    from public.portfolios p
    where p.id = portfolio_holdings.portfolio_id
      and p.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.portfolios p
    where p.id = portfolio_holdings.portfolio_id
      and p.user_id = auth.uid()
  )
);

drop policy if exists holdings_delete_own on public.portfolio_holdings;
create policy holdings_delete_own
on public.portfolio_holdings
for delete
using (
  exists (
    select 1
    from public.portfolios p
    where p.id = portfolio_holdings.portfolio_id
      and p.user_id = auth.uid()
  )
);

