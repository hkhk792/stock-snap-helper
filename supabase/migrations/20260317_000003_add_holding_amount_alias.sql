-- RealValue: enhance holdings fields (alias + buy amount)

alter table public.portfolio_holdings
  add column if not exists alias text not null default '',
  add column if not exists buy_amount numeric not null default 0;

-- optional: store portfolio owner display name
alter table public.portfolios
  add column if not exists owner_name text not null default '';

