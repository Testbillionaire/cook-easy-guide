-- search_events had indexes on created_at / zip_code / country, but nothing on
-- user_id — so every per-user lookup did a full table scan. Two places already
-- do exactly that:
--   * admin Users -> click a person -> "Recent searches" (getUserActivity)
--   * profile page -> your keywords, last 30 days (getMyProfile)
--
-- Composite (user_id, created_at DESC) covers both the filter and the ordering
-- in one index. Invisible at a few hundred rows, essential past a few thousand.

CREATE INDEX IF NOT EXISTS search_events_user_created_idx
  ON public.search_events (user_id, created_at DESC);
