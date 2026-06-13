
-- 1. Profiles: restrict which columns users can update (prevents bypassing 'disabled' suspension)
REVOKE UPDATE ON public.profiles FROM authenticated, anon;
GRANT UPDATE (last_seen_at) ON public.profiles TO authenticated;

-- 2. recipe_save_events: tighten INSERT WITH CHECK
DROP POLICY IF EXISTS "anyone can log save" ON public.recipe_save_events;
CREATE POLICY "log save with own or null user"
  ON public.recipe_save_events
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (user_id IS NULL OR user_id = auth.uid());

-- 3. search_events: tighten INSERT WITH CHECK
DROP POLICY IF EXISTS "anyone can log search" ON public.search_events;
CREATE POLICY "log search with own or null user"
  ON public.search_events
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (user_id IS NULL OR user_id = auth.uid());

-- 4. Restrict has_role EXECUTE: revoke from public/anon, keep for authenticated (needed by RLS policies) and service_role
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;
