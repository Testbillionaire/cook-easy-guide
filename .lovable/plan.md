## Goal
Let signed-in users save recipes to their account and view them on a dedicated `/saved` page.

## Steps

### 1. Enable Lovable Cloud + auth
- Enable Cloud (provisions database + auth).
- Add email/password + Google sign-in on a new `/auth` route.
- Wire the integration-managed `_authenticated` layout.

### 2. Database
- `saved_recipes` table (`id`, `user_id`, `meal_id`, `meal_name`, `meal_thumb`, `created_at`).
  - Unique on (`user_id`, `meal_id`) so saving twice is idempotent.
  - RLS: users read/insert/delete only their own rows.

### 3. Server functions (`src/lib/saved-recipes.functions.ts`)
- `saveRecipe({ mealId, mealName, mealThumb })` — upsert.
- `unsaveRecipe({ mealId })` — delete.
- `listSavedRecipes()` — list current user's saves.
- `isRecipeSaved({ mealId })` — for the detail page heart state.
- All use `requireSupabaseAuth`.

### 4. UI
- **Recipe detail page**: heart icon next to title. Filled when saved. Toggles save/unsave. If logged out, shows "Sign in to save" inline (no redirect).
- **Recipe cards in search results**: small heart button in the corner. Same behavior.
- **New `/saved` route** (under `_authenticated/`): grid of saved recipes, click to open detail. Empty state when nothing saved.
- Header: small "Saved" link + sign-in/sign-out button.

### 5. Cache
- TanStack Query keyed on `["saved-recipes"]` and `["saved-recipe", mealId]`; invalidate after save/unsave so the heart and `/saved` list update instantly.

## Files touched
- new: `src/lib/saved-recipes.functions.ts`, `src/routes/auth.tsx`, `src/routes/_authenticated/saved.tsx`, migration for `saved_recipes` table
- edited: `src/routes/index.tsx` (heart buttons + header link)
