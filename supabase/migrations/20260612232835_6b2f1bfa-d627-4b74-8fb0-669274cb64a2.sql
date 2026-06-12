
-- =========================================================
-- 1. Roles
-- =========================================================
CREATE TYPE public.app_role AS ENUM ('admin', 'user');

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE POLICY "users read own roles" ON public.user_roles
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "admins read all roles" ON public.user_roles
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- =========================================================
-- 2. Profiles
-- =========================================================
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz,
  disabled boolean NOT NULL DEFAULT false
);

GRANT SELECT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users read own profile" ON public.profiles
  FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "users update own profile" ON public.profiles
  FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE POLICY "admins read all profiles" ON public.profiles
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admins update all profiles" ON public.profiles
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- backfill existing users
INSERT INTO public.profiles (id, email, created_at)
SELECT id, email, created_at FROM auth.users
ON CONFLICT (id) DO NOTHING;

-- trigger to auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email) VALUES (NEW.id, NEW.email)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =========================================================
-- 3. Search events
-- =========================================================
CREATE TABLE public.search_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ingredients text[] NOT NULL DEFAULT '{}',
  time_band text,
  dish_key text,
  effort_key text,
  result_count integer NOT NULL DEFAULT 0,
  zip_code text,
  country text,
  region text,
  city text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX search_events_created_at_idx ON public.search_events (created_at DESC);
CREATE INDEX search_events_zip_idx ON public.search_events (zip_code);
CREATE INDEX search_events_country_idx ON public.search_events (country);

GRANT INSERT ON public.search_events TO anon, authenticated;
GRANT SELECT ON public.search_events TO authenticated;
GRANT ALL ON public.search_events TO service_role;
ALTER TABLE public.search_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anyone can log search" ON public.search_events
  FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "admins read all search events" ON public.search_events
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- =========================================================
-- 4. Recipe save events
-- =========================================================
CREATE TABLE public.recipe_save_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  meal_id text NOT NULL,
  meal_name text NOT NULL,
  zip_code text,
  country text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX recipe_save_events_created_at_idx ON public.recipe_save_events (created_at DESC);
CREATE INDEX recipe_save_events_meal_idx ON public.recipe_save_events (meal_id);

GRANT INSERT ON public.recipe_save_events TO anon, authenticated;
GRANT SELECT ON public.recipe_save_events TO authenticated;
GRANT ALL ON public.recipe_save_events TO service_role;
ALTER TABLE public.recipe_save_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anyone can log save" ON public.recipe_save_events
  FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "admins read all save events" ON public.recipe_save_events
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- =========================================================
-- 5. ZIP cache
-- =========================================================
CREATE TABLE public.zip_cache (
  zip_code text PRIMARY KEY,
  country text,
  region text,
  city text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.zip_cache TO anon, authenticated;
GRANT ALL ON public.zip_cache TO service_role;
ALTER TABLE public.zip_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anyone can read zip cache" ON public.zip_cache
  FOR SELECT TO anon, authenticated USING (true);
