-- Daily streak reset: any user who earned no XP yesterday goes back to 0.
-- Paste this once into your Supabase SQL editor (needs the pg_cron extension).

create extension if not exists pg_cron;

create or replace function public.reset_inactive_streaks()
returns void
language sql
security definer
set search_path = public
as $$
  update public.profiles
  set streak_days = 0
  where streak_days > 0
    and (
      last_active_on is null
      or last_active_on < (current_date - 1)::text
    );
$$;

-- Run once a day at 00:05 UTC.
select cron.schedule(
  'reset-inactive-streaks',
  '5 0 * * *',
  $$select public.reset_inactive_streaks()$$
);
