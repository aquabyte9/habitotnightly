-- Public, read-only leaderboard rows backed by profiles, exposing only safe columns.
CREATE TABLE IF NOT EXISTS public.leaderboard (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text,
  avatar_url text,
  xp integer NOT NULL DEFAULT 0,
  streak_days integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.leaderboard TO anon;
GRANT SELECT ON public.leaderboard TO authenticated;
GRANT ALL ON public.leaderboard TO service_role;

ALTER TABLE public.leaderboard ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Leaderboard is publicly readable" ON public.leaderboard;
CREATE POLICY "Leaderboard is publicly readable"
  ON public.leaderboard FOR SELECT
  TO anon, authenticated
  USING (true);
-- No INSERT/UPDATE/DELETE policies: writes happen only via the security-definer sync below.

-- Keep the leaderboard in sync with profiles.
CREATE OR REPLACE FUNCTION public.sync_leaderboard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.leaderboard (id, display_name, avatar_url, xp, streak_days, updated_at)
  VALUES (NEW.id, NEW.display_name, NEW.avatar_url, NEW.xp, NEW.streak_days, now())
  ON CONFLICT (id) DO UPDATE
    SET display_name = EXCLUDED.display_name,
        avatar_url = EXCLUDED.avatar_url,
        xp = EXCLUDED.xp,
        streak_days = EXCLUDED.streak_days,
        updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_leaderboard_on_profiles ON public.profiles;
CREATE TRIGGER sync_leaderboard_on_profiles
AFTER INSERT OR UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.sync_leaderboard();

-- Backfill existing profiles.
INSERT INTO public.leaderboard (id, display_name, avatar_url, xp, streak_days)
SELECT p.id, p.display_name, p.avatar_url, p.xp, p.streak_days FROM public.profiles p
ON CONFLICT (id) DO UPDATE
  SET display_name = EXCLUDED.display_name,
      avatar_url = EXCLUDED.avatar_url,
      xp = EXCLUDED.xp,
      streak_days = EXCLUDED.streak_days;

-- Leaderboard reads no longer require a session.
CREATE OR REPLACE FUNCTION public.get_leaderboard()
RETURNS TABLE(display_name text, avatar_url text, xp integer, streak_days integer)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT l.display_name, l.avatar_url, l.xp, l.streak_days
  FROM public.leaderboard l
  ORDER BY l.xp DESC
  LIMIT 50;
$$;

GRANT EXECUTE ON FUNCTION public.get_leaderboard() TO anon, authenticated;