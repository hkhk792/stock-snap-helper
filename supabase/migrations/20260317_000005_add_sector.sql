-- RealValue: add sector/tag for holdings grouping

alter table public.portfolio_holdings
  add column if not exists sector text not null default '';

