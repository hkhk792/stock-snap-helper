-- RealValue: store OCR imports for debugging/audit

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

alter table public.ocr_imports enable row level security;

drop policy if exists ocr_imports_select_own on public.ocr_imports;
create policy ocr_imports_select_own
on public.ocr_imports
for select
using (auth.uid() = user_id);

drop policy if exists ocr_imports_insert_own on public.ocr_imports;
create policy ocr_imports_insert_own
on public.ocr_imports
for insert
with check (auth.uid() = user_id);

