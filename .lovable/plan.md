# Admin Dashboard Plan

## 1. Database (one migration)

**Roles** (separate table, manual seed):
- enum `app_role` ('admin','user')
- `user_roles(user_id, role)` + `has_role(uuid, app_role)` SECURITY DEFINER fn
- After approval, you run one INSERT to grant yourself admin

**Analytics tables:**
- `search_events`: user_id (nullable), ingredients text[], time_band, dish_key, effort_key, result_count, zip_code, country, region, city, created_at
- `recipe_save_events`: user_id, meal_id, meal_name, zip_code, country, created_at
- `profiles` (mirrors auth.users for admin list): id, email, created_at, last_seen_at, disabled bool

RLS:
- Both event tables: INSERT allowed to authenticated + anon (logging); SELECT only via `has_role(auth.uid(),'admin')`
- `profiles`: user reads own row; admin reads/updates all
- `user_roles`: user reads own; only admin writes (via has_role)

Trigger: on `auth.users` insert → create profile row.

## 2. Location capture (zip-based)

MealDB has no location data; we capture the **searcher's** location:
- Lightweight prompt on first search: "Enter ZIP for local trends (optional)" → stored in `localStorage` + sent with every search event
- Server fn enriches: ZIP → country/region/city via free zip API (US zippopotam.us, fallback "unknown") cached in a small `zip_cache` table
- No IP geolocation (avoids privacy/Worker issues)

## 3. Server functions (`src/lib/admin.functions.ts`, `src/lib/analytics.functions.ts`)

Analytics (any user, including anon):
- `logSearch({ ingredients, filters, resultCount, zip })`
- `logSave({ mealId, mealName, zip })`
- `getTrendingKeywords({ scope: 'global'|'zip', zip?, range: 'day'|'week'|'month' })` — public, used by home page

Admin (require auth + `has_role` check inside handler):
- `getTrafficStats({ range })` → searches/day, unique users, top zips, top countries
- `getTopKeywords({ range, groupBy: 'global'|'zip'|'country' })`
- `getTopRecipes({ range })`
- `listUsers({ search, page })`
- `getUserActivity(userId)` → their searches + saves
- `setUserRole({ userId, role, action: 'grant'|'revoke' })`
- `setUserDisabled({ userId, disabled })` (uses `supabaseAdmin.auth.admin.updateUserById`)
- `deleteUser(userId)` (admin API)

## 4. Wiring on existing pages

- `src/routes/index.tsx` ResultsStep: call `logSearch` once per query success
- `src/routes/_authenticated/saved.tsx` save action: call `logSave`
- Home MealStep: new "Trending near you" strip — top 5 keywords for user's zip + range toggle (day/week/month), falls back to global

## 5. Home page wiring audit

Walk every Time/Dish/Effort chip in `src/lib/mealdb.ts` against MealDB:
- Document which chips return 0 with common ingredient sets
- Fix mappings (e.g. broaden Salad/Soup keyword regex, relax time bands when pool < 4)
- Document estimate disclaimer for Time bands

## 6. Admin UI

New routes under `src/routes/_authenticated/admin/` gated by client-side `has_role` check (server fns are the real gate):
- `admin/route.tsx` — sidebar layout, redirects non-admins to `/`
- `admin/index.tsx` — Overview: KPI cards (searches today/week/month, unique users, top country), line chart (searches over time), bar chart (top zips)
- `admin/keywords.tsx` — Top keywords table with range toggle + group-by (global/zip/country)
- `admin/users.tsx` — User table: search, promote/demote, disable, delete, drill-in modal showing recent searches/saves
- `admin/recipes.tsx` — Top saved recipes

Charts via existing `recharts` (already installed).

## 7. Out of scope
- IP-based geolocation
- Real-time dashboards (polling on tab focus only)
- Email notifications

## Files
- 1 migration (roles + analytics tables + profiles + trigger + RLS + grants)
- new: `src/lib/analytics.functions.ts`, `src/lib/admin.functions.ts`
- new: `src/routes/_authenticated/admin/{route,index,keywords,users,recipes}.tsx`
- new: `src/components/admin/*` (KpiCard, TrafficChart, KeywordTable, UserTable)
- new: `src/components/TrendingStrip.tsx` (home page)
- edit: `src/routes/index.tsx` (log + trending strip), `src/routes/_authenticated/saved.tsx` (log save), `src/lib/mealdb.ts` (chip-mapping fixes)

## Manual step after migration approval
You run one INSERT to promote your account — I'll provide the exact SQL with your user id.
