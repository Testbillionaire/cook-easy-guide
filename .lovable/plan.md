## Why the links break

Both URLs in `src/lib/mealdb.ts` use stale search formats:

- **Amazon**: `https://www.amazon.com/s?k=<q>&i=grocery` — `i=grocery` scopes results to Amazon Fresh / Whole Foods, which is only available in supported zip codes. For most visitors it returns an empty page or "this store doesn't deliver to your address."
- **Instacart**: `https://www.instacart.com/store/s?k=<q>` — this is Instacart's old storefront search path. It now 404s or redirects to the home page. The current public search route is `https://www.instacart.com/store/search/<q>`.

The ingredient names themselves are fine (we already pass the human-readable label, e.g. "chicken breast"). The bug is in the URL templates, not the data.

## Fix

Update `src/lib/mealdb.ts`:

- `amazonSearchUrl(q)` → `https://www.amazon.com/s?k=<encoded q>` (drop `&i=grocery` so results work everywhere; Amazon shows grocery items inline when relevant).
- `instacartSearchUrl(q)` → `https://www.instacart.com/store/search/<encoded q>` (current working public search endpoint).

No call-site changes needed — `src/routes/index.tsx` already imports and calls the helpers.

### Files touched
- `src/lib/mealdb.ts` (2 one-line edits)
