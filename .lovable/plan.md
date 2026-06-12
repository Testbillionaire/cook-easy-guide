## Goal

Replace the flat `MEALS` list with three filter groups — **Time**, **Dish Type**, **Effort** — and make each option actually filter the recipe results.

## Filter groups

**TIME** (single-select, estimated from ingredient count + instruction length, since MealDB has no time field):
- Under 15 min · 15–30 min · 30–60 min · 1 hr+

**DISH TYPE** (single-select, mapped to MealDB categories):
- Morning Dish → `Breakfast`
- Light dish → `Starter`, `Side`
- Main dish → `Beef`, `Chicken`, `Lamb`, `Pork`, `Goat`, `Pasta`, `Seafood`
- Side → `Side`
- Soup/stew → keyword match on meal name (`soup`, `stew`, `chowder`, `broth`)
- Salad → keyword match (`salad`)
- Sweet treat → `Dessert`
- Drink → not supported by MealDB; hide or show "coming soon" empty state

**EFFORT** (single-select, all heuristic on `MealDetail`):
- 1-pot → instructions contain `pot`, `skillet`, `pan` and no second cooking vessel mentioned
- No-cook → instructions don't mention `cook`, `bake`, `fry`, `boil`, `simmer`, `roast`, `grill`
- Make-ahead → instructions mention `refrigerate`, `overnight`, `chill`, `rest`, `marinate`
- Meal prep → `≥ 4` servings hint OR instructions mention `batch`, `portion`, `freeze`

## Plan

### 1. UI in `src/routes/index.tsx`
- Replace `MealType` + `MEALS` with `Filters = { time?, dish?, effort? }`.
- New `meal` step renders three sections (Time / Dish Type / Effort), each a wrap-grid of chips. Each group allows one selection at a time; tapping again clears it. All three are optional; user can hit Next with none.
- Stepper label stays "Meal" (or rename to "Filters").
- Chips show emoji + label. Selected chip uses `bg-primary text-primary-foreground`.

### 2. Backend in `src/lib/mealdb.ts`
Change `findRecipes` signature:
```ts
findRecipes({ ingredients, time?, dish?, effort? })
```
- Resolve `dish` to either a category list, a name-keyword regex, or both.
- Union categories in parallel → allowed-id set, then intersect with the ingredient pool (or fall back to category list when ingredients yielded nothing).
- For `time` / `effort` and name-keyword dishes, the summary endpoint isn't enough → call `lookupMeal` in parallel for the candidate pool (cap at ~30), then apply heuristics:
  - `estMinutes = 5 + 2*ingredients.length + 0.05*instructions.length` → bucket into the four time bands.
  - effort flags derived from instruction text as above.
- If a filter empties the pool, relax it (return the unfiltered pool) and surface a soft note in the UI.

### 3. Results UX
- Empty state: "No matches for {filters}. Showing closest results." with a Clear-filters button.
- Query key becomes `["recipes", ingredients, time, dish, effort]` so cache splits cleanly.
- Small "Estimated" hint under Time filter (since MealDB has no real timing).

### 4. Out of scope
- No DB or auth changes.
- Drink dishes stay as "coming soon" rather than wiring a second data source.

## Files
- edit `src/lib/mealdb.ts` — new signature, time/effort heuristics, dish mapping
- edit `src/routes/index.tsx` — three-group filter UI, updated query call, empty-state copy
