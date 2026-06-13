# Admin Recipe Management Panel

A unified panel for the admin to curate recipes from MealDB, author custom recipes, fix tags, hide bad entries, and resolve user-submitted reports. Featured recipes are boosted to the top of normal search results.

## What you'll be able to do

- **Search** across all known recipes (MealDB shown in your DB, custom, imported) in one table.
- **Feature** any recipe — it floats to the top of search results when it matches.
- **Hide** any recipe — never appears in search, trending, or anywhere user-facing.
- **Re-tag** any recipe — fix wrong Time / Dish / Effort so filters return it correctly. Supports bulk select.
- **Author custom recipes** (title, image, ingredients, steps, time/dish/effort) shown alongside MealDB results.
- **Import from MealDB** by ID, with one click; the recipe becomes editable in your DB while still linking back to its source.
- **Review reports** users file against bad recipes (wrong info, broken image, offensive). Resolve, dismiss, or hide the recipe from the report row.

## Panel layout

Searchable table on a route under `/admin/recipes` (replaces the current Top Recipes leaderboard, which moves into a tab here). Row click opens a side drawer for editing.

```text
/admin/recipes
┌─ Tabs: All · Featured · Hidden · Custom · Reports(3) ──────────┐
│ [search ▢] [filter: time/dish/effort] [+ New custom] [Import]  │
├────────────────────────────────────────────────────────────────┤
│ ☐ img  Title              Source  Tags        Saves  Status  ⋯ │
│ ☐ 🖼  Spicy Pasta         MealDB  30m·Main    142    Featured │
│ ☐ 🖼  My Granola          Custom  15m·Morn    8      Active   │
│ ☐ 🖼  Burned Toast        MealDB  —           0      Hidden   │
│ ...                                                            │
│ [bulk: Feature | Hide | Re-tag…] (when any ☐ checked)          │
└────────────────────────────────────────────────────────────────┘
            ▶ Click row → Drawer: edit tags, image, steps,
              feature/hide toggles, view save count + reports
```

## Home page surfacing

Featured recipes get boosted (not a separate strip). When `searchByIngredients` runs, results are reordered so featured matches come first; hidden recipes are filtered out entirely. Custom recipes are merged into results that match their tags.

## Reports flow (new for users)

- Each recipe detail dialog gains a small "Report" link → modal with reason (wrong info, broken image, inappropriate, other) + optional note.
- New `recipe_reports` table feeds the admin "Reports" tab.
- Resolve actions: dismiss, hide recipe, or open in drawer to fix tags/content.

---

## Technical details

### Database (1 migration)

- `recipe_overlays` — admin curation layer over any recipe (MealDB or custom).
  - `recipe_id text PK` (MealDB id like `52772`, or generated id for custom)
  - `source text` (`'mealdb' | 'custom'`)
  - `status text` (`'active' | 'featured' | 'hidden'`, default `'active'`)
  - `time_band text`, `dish_key text`, `effort_keys text[]` (override MealDB-derived tags)
  - `featured_rank int` (lower = higher priority; null for non-featured)
  - timestamps
- `custom_recipes` — admin-authored or imported-then-edited recipes.
  - `id text PK` (e.g. `cust_<uuid>` or `mealdb_<id>` for imports)
  - `title text`, `image_url text`, `instructions text`, `category text`, `area text`
  - `ingredients jsonb` (`[{name, measure}]`)
  - `source_mealdb_id text null` (set when imported), `created_by uuid`, timestamps
- `recipe_reports` — user-filed reports.
  - `id uuid PK`, `recipe_id text`, `recipe_name text`, `reason text`, `note text`, `reporter_id uuid null`, `status text` (`'open' | 'resolved' | 'dismissed'`), timestamps

Grants: `authenticated` SELECT/INSERT on `recipe_reports` (insert own), `service_role` all on all three; `anon` SELECT on `recipe_overlays` + `custom_recipes` (so SSR/home search can read them without auth). Admin-only writes via `has_role(auth.uid(), 'admin')` policies on overlays/custom; admin-only SELECT/UPDATE on reports.

### Server functions

New `src/lib/recipes-admin.functions.ts` (all assert admin):
- `listManagedRecipes({ tab, search, page })` — joins MealDB top-saved + overlays + custom, returns unified rows with status/tags/saveCount.
- `upsertOverlay({ recipeId, source, status, tags, featuredRank })`
- `bulkSetStatus({ recipeIds, status })`, `bulkRetag({ recipeIds, time_band, dish_key, effort_keys })`
- `createCustomRecipe(payload)` / `updateCustomRecipe(payload)` / `deleteCustomRecipe(id)`
- `importMealDbRecipe({ mealdbId })` — fetches from MealDB API server-side, inserts into `custom_recipes` with `source_mealdb_id`, creates overlay row.
- `listReports({ status })`, `resolveReport({ id, action })`

New `src/lib/recipe-reports.functions.ts` (user-facing): `submitReport({ recipeId, recipeName, reason, note })`.

Public read used by home search: `getOverlays()` cached briefly — returns `{ featured: Set<id>, hidden: Set<id>, overrides: Map<id, tags>, custom: Recipe[] }`.

### Search integration (`src/lib/mealdb.ts`)

`searchByIngredients` becomes overlay-aware:
1. Fetch MealDB results as today.
2. Fetch overlays + matching custom recipes (single cached server call).
3. Drop any result whose id is in `hidden`.
4. Apply tag overrides where present.
5. Merge custom recipes that match the active filters.
6. Sort: `featured_rank` first, then existing score.

Trending and Top Recipes admin tab use the same overlay filter so hidden recipes never appear.

### Admin panel UI

- `src/routes/_authenticated/admin/recipes.tsx` — replace existing leaderboard with the new tabbed table (Top Saved becomes the default tab content). Side drawer via existing `Dialog` or new `Sheet` component.
- `src/components/admin/RecipeDrawer.tsx` — edit form: tags, status toggles, custom-recipe fields, report history for that recipe.
- `src/components/admin/RecipeReportsTable.tsx` — for Reports tab.

### User-facing additions

- "Report recipe" button inside the recipe detail dialog in `src/routes/index.tsx`, opening a small modal that calls `submitReport`.
- A subtle "Featured" badge on recipe cards when `featured_rank` is set.

### Files

- new: migration, `recipes-admin.functions.ts`, `recipe-reports.functions.ts`, `RecipeDrawer.tsx`, `RecipeReportsTable.tsx`
- edited: `admin/recipes.tsx`, `admin/route.tsx` (nav badge for open reports), `lib/mealdb.ts`, `routes/index.tsx` (report button + featured badge), `integrations/supabase/types.ts` (auto-regenerated)

### Out of scope

- Recipe versioning/history.
- Image uploads (image fields take URLs for now — storage bucket can be added later if you want uploads).
- Public-facing "Browse all featured" page.
