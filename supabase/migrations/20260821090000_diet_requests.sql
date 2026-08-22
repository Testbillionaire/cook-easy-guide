-- Dietary restrictions people want that we don't properly support yet.
--
-- Two sources feed this, both from the portion-profile page:
--   'preset' — they ticked one of our listed-but-not-yet-working chips
--              (everything below the divider: gluten-free, halal, keto, …)
--   'custom' — they typed something that isn't on our list at all
--
-- Only Vegetarian and Vegan are genuinely filterable today (real MealDB
-- categories), so everything else is demand signal for deciding what to
-- build next.
--
-- UNIQUE (user_id, label) means the count reads as "how many distinct people
-- want this", not "how many times someone clicked" — the honest metric for
-- prioritising work.

CREATE TABLE public.diet_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  label text NOT NULL,
  source text NOT NULL DEFAULT 'custom' CHECK (source IN ('custom', 'preset')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, label)
);

CREATE INDEX diet_requests_created_at_idx ON public.diet_requests (created_at DESC);
CREATE INDEX diet_requests_label_idx ON public.diet_requests (lower(label));

GRANT ALL ON public.diet_requests TO service_role;
ALTER TABLE public.diet_requests ENABLE ROW LEVEL SECURITY;

-- Writes go through the recordDietRequest server function (service role), so
-- no anon/authenticated INSERT grant is needed. Read policy kept for defence
-- in depth alongside the admin dashboard's service-role client.
CREATE POLICY "admins read diet requests" ON public.diet_requests
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
