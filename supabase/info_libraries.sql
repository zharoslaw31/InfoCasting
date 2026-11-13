-- InfoCasting: бібліотека (відкладене, збережене в Obsidian, прочитане) у хмарі.
-- Акаунти спільні з MovieCasting (той самий проєкт Supabase), дані InfoCasting — в окремій таблиці.
-- Виконайте один раз: Supabase → SQL Editor → New query → вставити → Run.

create table if not exists public.info_libraries (
  user_id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.info_libraries enable row level security;

drop policy if exists "own info library: select" on public.info_libraries;
drop policy if exists "own info library: insert" on public.info_libraries;
drop policy if exists "own info library: update" on public.info_libraries;
drop policy if exists "own info library: delete" on public.info_libraries;

create policy "own info library: select" on public.info_libraries for select using (auth.uid() = user_id);
create policy "own info library: insert" on public.info_libraries for insert with check (auth.uid() = user_id);
create policy "own info library: update" on public.info_libraries for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own info library: delete" on public.info_libraries for delete using (auth.uid() = user_id);
