DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON public.profiles;

CREATE POLICY "Users can view their own profile"
ON public.profiles
FOR SELECT
TO authenticated
USING (auth.uid() = id);

REVOKE SELECT ON public.profiles FROM anon;

CREATE OR REPLACE FUNCTION public.get_leaderboard()
RETURNS TABLE (display_name text, avatar_url text, xp integer, streak_days integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.display_name, p.avatar_url, p.xp, p.streak_days
  FROM public.profiles p
  WHERE auth.uid() IS NOT NULL
  ORDER BY p.xp DESC
  LIMIT 50;
$$;

REVOKE ALL ON FUNCTION public.get_leaderboard() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_leaderboard() TO authenticated;