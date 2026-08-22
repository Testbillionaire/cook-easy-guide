-- Tracks people who tried to sign in with a non-Google email while email
-- sign-in is still disabled (Supabase's built-in email service can't send
-- branded 6-digit codes and is rate-limited to a few sends per hour).
-- Used to measure whether standing up custom SMTP is worth it, and to give
-- us a list to notify once it is.

CREATE TABLE public.email_interest (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  attempts integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_attempt_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX email_interest_created_at_idx ON public.email_interest (created_at DESC);

GRANT ALL ON public.email_interest TO service_role;
ALTER TABLE public.email_interest ENABLE ROW LEVEL SECURITY;

-- No anon/authenticated grants: writes go through the record_email_interest
-- RPC below (service_role only), reads through the admin dashboard's
-- service-role client. RLS policy kept for defense in depth.
CREATE POLICY "admins read email interest" ON public.email_interest
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Upsert helper: one row per address, with an attempt counter so repeated
-- tries by the same person don't inflate the "how many people want this" number.
CREATE OR REPLACE FUNCTION public.record_email_interest(_email text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.email_interest (email)
  VALUES (lower(trim(_email)))
  ON CONFLICT (email) DO UPDATE
    SET attempts = public.email_interest.attempts + 1,
        last_attempt_at = now();
END;
$$;

REVOKE EXECUTE ON FUNCTION public.record_email_interest(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_email_interest(text) TO service_role;
