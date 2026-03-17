-- RealValue: add cost fields for holdings

alter table public.portfolio_holdings
  add column if not exists buy_price numeric not null default 0,
  add column if not exists shares numeric not null default 0;

