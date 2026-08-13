-- Зал вместе · схема Supabase
-- Выполните целиком в Supabase → SQL Editor → Run

create table if not exists public.workout_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  person text not null check (person in ('him', 'her')),
  workout_day text not null check (workout_day in ('A', 'B')),
  log_data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  unique (user_id, person, workout_day)
);

create table if not exists public.user_prefs (
  user_id uuid not null references auth.users (id) on delete cascade,
  person text not null check (person in ('him', 'her')),
  phase int not null default 0 check (phase >= 0 and phase <= 2),
  active_day text not null default 'A' check (active_day in ('A', 'B')),
  updated_at timestamptz not null default now(),
  primary key (user_id, person)
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists workout_sessions_updated_at on public.workout_sessions;
create trigger workout_sessions_updated_at
  before update on public.workout_sessions
  for each row execute function public.set_updated_at();

drop trigger if exists user_prefs_updated_at on public.user_prefs;
create trigger user_prefs_updated_at
  before update on public.user_prefs
  for each row execute function public.set_updated_at();

alter table public.workout_sessions enable row level security;
alter table public.user_prefs enable row level security;

drop policy if exists "workout_sessions_own" on public.workout_sessions;
create policy "workout_sessions_own"
  on public.workout_sessions
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "user_prefs_own" on public.user_prefs;
create policy "user_prefs_own"
  on public.user_prefs
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
