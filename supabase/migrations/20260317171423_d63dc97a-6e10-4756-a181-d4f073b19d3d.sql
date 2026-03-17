
create extension if not exists "pgcrypto";

create table if not exists public.portfolios (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  base_nav numeric not null default 1,
  owner_name text not null default '',
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
  alias text not null default '',
  buy_amount numeric not null default 0,
  buy_price numeric not null default 0,
  shares numeric not null default 0,
  sector text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists portfolio_holdings_portfolio_id_idx on public.portfolio_holdings (portfolio_id);

create table if not exists public.ocr_imports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  portfolio_id uuid references public.portfolios (id) on delete set null,
  filename text not null default '',
  parsed_json jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists ocr_imports_user_id_idx on public.ocr_imports (user_id);
create index if not exists ocr_imports_portfolio_id_idx on public.ocr_imports (portfolio_id);

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
alter table public.ocr_imports enable row level security;

-- Portfolios policies
create policy portfolios_select_own on public.portfolios for select using (auth.uid() = user_id);
create policy portfolios_insert_own on public.portfolios for insert with check (auth.uid() = user_id);
create policy portfolios_update_own on public.portfolios for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy portfolios_delete_own on public.portfolios for delete using (auth.uid() = user_id);

-- Holdings policies
create policy holdings_select_own on public.portfolio_holdings for select using (exists (select 1 from public.portfolios p where p.id = portfolio_holdings.portfolio_id and p.user_id = auth.uid()));
create policy holdings_insert_own on public.portfolio_holdings for insert with check (exists (select 1 from public.portfolios p where p.id = portfolio_holdings.portfolio_id and p.user_id = auth.uid()));
create policy holdings_update_own on public.portfolio_holdings for update using (exists (select 1 from public.portfolios p where p.id = portfolio_holdings.portfolio_id and p.user_id = auth.uid())) with check (exists (select 1 from public.portfolios p where p.id = portfolio_holdings.portfolio_id and p.user_id = auth.uid()));
create policy holdings_delete_own on public.portfolio_holdings for delete using (exists (select 1 from public.portfolios p where p.id = portfolio_holdings.portfolio_id and p.user_id = auth.uid()));

-- OCR imports policies
create policy ocr_imports_select_own on public.ocr_imports for select using (auth.uid() = user_id);
create policy ocr_imports_insert_own on public.ocr_imports for insert with check (auth.uid() = user_id);
