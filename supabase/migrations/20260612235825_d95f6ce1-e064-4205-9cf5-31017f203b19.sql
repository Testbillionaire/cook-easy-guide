
-- recipe_overlays
CREATE TABLE public.recipe_overlays (
  recipe_id text PRIMARY KEY,
  source text NOT NULL DEFAULT 'mealdb',
  status text NOT NULL DEFAULT 'active',
  time_band text,
  dish_key text,
  effort_keys text[] NOT NULL DEFAULT '{}',
  featured_rank int,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT recipe_overlays_status_chk CHECK (status IN ('active','featured','hidden')),
  CONSTRAINT recipe_overlays_source_chk CHECK (source IN ('mealdb','custom'))
);
GRANT SELECT ON public.recipe_overlays TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.recipe_overlays TO authenticated;
GRANT ALL ON public.recipe_overlays TO service_role;
ALTER TABLE public.recipe_overlays ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anyone reads overlays" ON public.recipe_overlays FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "admins insert overlays" ON public.recipe_overlays FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admins update overlays" ON public.recipe_overlays FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admins delete overlays" ON public.recipe_overlays FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- custom_recipes
CREATE TABLE public.custom_recipes (
  id text PRIMARY KEY,
  title text NOT NULL,
  image_url text NOT NULL DEFAULT '',
  instructions text NOT NULL DEFAULT '',
  category text NOT NULL DEFAULT '',
  area text NOT NULL DEFAULT '',
  ingredients jsonb NOT NULL DEFAULT '[]'::jsonb,
  source_mealdb_id text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.custom_recipes TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.custom_recipes TO authenticated;
GRANT ALL ON public.custom_recipes TO service_role;
ALTER TABLE public.custom_recipes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anyone reads custom recipes" ON public.custom_recipes FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "admins insert custom recipes" ON public.custom_recipes FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admins update custom recipes" ON public.custom_recipes FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admins delete custom recipes" ON public.custom_recipes FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- recipe_reports
CREATE TABLE public.recipe_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id text NOT NULL,
  recipe_name text NOT NULL DEFAULT '',
  reason text NOT NULL,
  note text,
  reporter_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'open',
  resolved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT recipe_reports_status_chk CHECK (status IN ('open','resolved','dismissed')),
  CONSTRAINT recipe_reports_reason_chk CHECK (reason IN ('wrong_info','broken_image','inappropriate','other'))
);
GRANT INSERT ON public.recipe_reports TO authenticated;
GRANT SELECT, UPDATE ON public.recipe_reports TO authenticated;
GRANT ALL ON public.recipe_reports TO service_role;
ALTER TABLE public.recipe_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated submit reports" ON public.recipe_reports FOR INSERT TO authenticated WITH CHECK (auth.uid() = reporter_id OR reporter_id IS NULL);
CREATE POLICY "admins read reports" ON public.recipe_reports FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admins update reports" ON public.recipe_reports FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER recipe_overlays_set_updated_at BEFORE UPDATE ON public.recipe_overlays
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER custom_recipes_set_updated_at BEFORE UPDATE ON public.custom_recipes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX recipe_overlays_status_idx ON public.recipe_overlays (status);
CREATE INDEX recipe_overlays_featured_rank_idx ON public.recipe_overlays (featured_rank) WHERE featured_rank IS NOT NULL;
CREATE INDEX recipe_reports_status_idx ON public.recipe_reports (status, created_at DESC);
CREATE INDEX custom_recipes_category_idx ON public.custom_recipes (category);
