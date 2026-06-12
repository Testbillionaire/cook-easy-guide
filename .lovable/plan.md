## Why no recipes appear

The search hits TheMealDB's free API (`filter.php?i=…` and `filter.php?c=…`) and then **intersects every result list**. Three things break that for "general" picks:

### 1. Meal type sends categories TheMealDB doesn't have
`src/routes/index.tsx` `MEALS`:
- `Dinner`, `Lunch`, `All Type`, `10-min`, `30-min` → no `category` (fine, skipped)
- `Snack` → `Starter` (not a real MealDB category — returns 0)
- `Special day` → `Dessert` (real, but intersected with e.g. "chicken" → 0)
- Only `Breakfast` is a valid MealDB category.

So picking **Dinner + chicken** works, but **Snack + chicken** or **Special day + chicken** always returns 0.

### 2. Our ingredient keys aren't MealDB ingredient names
`findRecipes` does `slug(ingredient) = key.toLowerCase().replace(/\s+/g,'_')` and passes the raw key. MealDB expects names like `chicken_breast`, `olive_oil`. Our keys are things like:
- `lo-cooked-chicken-breast`, `lo-roast-chicken`, `lo-stale-bread` (leftover module — all prefixed `lo-…`)
- custom ingredient keys with dashes/emojis

MealDB returns `{meals: null}` for any unknown ingredient → that list is `[]` → intersection with `[]` = `[]` → "0 recipes".

### 3. Intersecting every selected ingredient is too strict
Even with valid names, picking 2 generic ingredients (e.g. chicken + rice) requires a recipe to contain **both**, which is rare on MealDB's small dataset.

## Plan to fix

1. **Map our keys to MealDB ingredient names** — add a `mealdbName?: string` field (or a lookup table) for ingredients and leftovers. For leftovers, strip the `lo-` and "cooked/roast/stale" prefix (e.g. `lo-cooked-chicken-breast` → `chicken breast`, `lo-stale-bread` → `bread`). Skip items with no mapping rather than querying garbage.

2. **Fix meal → category mapping in `MEALS`**:
   - `Lunch`, `Dinner`, `All Type`, `10-min`, `30-min` → no category (already correct)
   - `Snack` → drop category (`Starter` doesn't exist); or map to `Side` if we want one
   - `Breakfast` → `Breakfast` (keep)
   - `Special day` → `Dessert` (keep, but see step 3)

3. **Loosen matching in `findRecipes`** (`src/lib/mealdb.ts`):
   - Query each ingredient, then **union** results and rank by how many selected ingredients each meal appears in (intersection only when all lists are non-empty AND user explicitly asks for strict mode — for now union+rank is friendlier).
   - When a category is present, intersect the final ranked list with the category list only if the category list is non-empty; otherwise ignore category and surface a small notice ("no exact match for this meal type — showing closest").

4. **Empty-state copy** — when 0 results, show which filters were applied and a "Remove meal type" / "Remove last ingredient" chip so the user can recover without starting over.

### Files touched
- `src/lib/mealdb.ts` — rewrite `findRecipes` (union+rank, smarter category handling).
- `src/lib/ingredients.ts` + `src/lib/leftovers.ts` — add `mealdbName` per item (or central map).
- `src/routes/index.tsx` — adjust `MEALS` categories; pass mapped names into `findRecipes`; improve empty state.

No backend or schema changes.
