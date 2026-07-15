
-- 1. Lock down profile self-updates: users cannot modify their own row via Data API.
--    App uses service_role (supabaseAdmin) to touch last_seen_at, so this is safe.
DROP POLICY IF EXISTS "users update own profile" ON public.profiles;
REVOKE UPDATE ON public.profiles FROM authenticated, anon;

-- 2. Revoke EXECUTE from anon/public on SECURITY DEFINER email-queue helpers.
--    These are called by service_role only (webhook + cron processor).
REVOKE EXECUTE ON FUNCTION public.delete_email(text, bigint) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enqueue_email(text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.read_email_batch(text, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.email_queue_dispatch() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.email_queue_wake() FROM PUBLIC, anon, authenticated;

-- 3. Set immutable search_path on email-queue helpers that lacked it.
ALTER FUNCTION public.delete_email(text, bigint) SET search_path = '';
ALTER FUNCTION public.enqueue_email(text, jsonb) SET search_path = '';
ALTER FUNCTION public.move_to_dlq(text, text, bigint, jsonb) SET search_path = '';
ALTER FUNCTION public.read_email_batch(text, integer, integer) SET search_path = '';
