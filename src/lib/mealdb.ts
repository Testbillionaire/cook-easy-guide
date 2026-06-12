// TheMealDB free API helpers (no key required)
const BASE = "https://www.themealdb.com/api/json/v1/1";

export type MealSummary = {
  idMeal: string;
  strMeal: string;
  strMealThumb: string;
};

export type MealDetail = MealSummary & {
  strCategory: string;
  strArea: string;
  strInstructions: string;
  strYoutube?: string;
  strSource?: string;
  ingredients: { name: string; measure: string }[];
};

const slug = (s: string) => s.trim().toLowerCase().replace(/\s+/g, "_");

// Strip our internal prefixes / cooking adjectives so a key like
// "lo-cooked-chicken-breast" or "chicken-breast" becomes a sequence of
// candidate MealDB ingredient names to try (most specific first).
const COOKING_PREFIXES = [
  "cooked", "roast", "roasted", "stale", "boiled", "sauteed", "sautéed",
  "caramelised", "caramelized", "leftover", "day-old", "mashed", "fried",
  "grilled", "baked", "steamed", "raw", "ground",
];

export function toMealdbCandidates(rawKey: string): string[] {
  let k = rawKey.toLowerCase().trim();
  if (k.startsWith("lo-")) k = k.slice(3);
  // remove a leading cooking prefix if present (e.g. "cooked-chicken-breast")
  for (const p of COOKING_PREFIXES) {
    const pref = `${p}-`;
    if (k.startsWith(pref)) {
      k = k.slice(pref.length);
      break;
    }
  }
  // normalise separators / parentheticals
  k = k.replace(/[()]/g, " ").replace(/\s+/g, " ").replace(/-/g, " ").trim();
  if (!k) return [];

  const words = k.split(" ").filter(Boolean);
  const candidates: string[] = [];
  // full name
  candidates.push(words.join(" "));
  // drop a parenthetical-style modifier we already removed; also try
  // progressively shorter suffixes ("beef steak sirloin" -> "beef steak" -> "beef")
  for (let n = words.length - 1; n >= 1; n--) {
    candidates.push(words.slice(0, n).join(" "));
  }
  // also try the LAST word ("ground beef" -> "beef") — MealDB often only knows the noun
  if (words.length > 1) candidates.push(words[words.length - 1]);
  // dedupe, preserve order
  return Array.from(new Set(candidates));
}

export async function filterByIngredient(ingredient: string): Promise<MealSummary[]> {
  const r = await fetch(`${BASE}/filter.php?i=${encodeURIComponent(slug(ingredient))}`);
  const j = (await r.json()) as { meals: MealSummary[] | null };
  return j.meals ?? [];
}

async function filterByIngredientWithFallback(rawKey: string): Promise<MealSummary[]> {
  for (const name of toMealdbCandidates(rawKey)) {
    const list = await filterByIngredient(name);
    if (list.length) return list;
  }
  return [];
}

export async function filterByCategory(category: string): Promise<MealSummary[]> {
  const r = await fetch(`${BASE}/filter.php?c=${encodeURIComponent(category)}`);
  const j = (await r.json()) as { meals: MealSummary[] | null };
  return j.meals ?? [];
}

export async function lookupMeal(id: string): Promise<MealDetail | null> {
  const r = await fetch(`${BASE}/lookup.php?i=${encodeURIComponent(id)}`);
  const j = (await r.json()) as { meals: Record<string, string>[] | null };
  const m = j.meals?.[0];
  if (!m) return null;
  const ingredients: { name: string; measure: string }[] = [];
  for (let i = 1; i <= 20; i++) {
    const name = (m[`strIngredient${i}`] ?? "").trim();
    const measure = (m[`strMeasure${i}`] ?? "").trim();
    if (name) ingredients.push({ name, measure });
  }
  return {
    idMeal: m.idMeal,
    strMeal: m.strMeal,
    strMealThumb: m.strMealThumb,
    strCategory: m.strCategory,
    strArea: m.strArea,
    strInstructions: m.strInstructions,
    strYoutube: m.strYoutube || undefined,
    strSource: m.strSource || undefined,
    ingredients,
  };
}

export async function findRecipes(opts: {
  ingredients: string[];
  category?: string;
}): Promise<MealSummary[]> {
  const keys = opts.ingredients.filter(Boolean);

  // Fire ingredient queries in parallel; each falls back to broader candidates.
  const ingredientLists = await Promise.all(
    keys.map((k) => filterByIngredientWithFallback(k)),
  );

  // Union + rank by how many of the user's ingredients each meal matched.
  const ranked = new Map<string, { meal: MealSummary; hits: number }>();
  for (const list of ingredientLists) {
    const seenInList = new Set<string>();
    for (const m of list) {
      if (seenInList.has(m.idMeal)) continue;
      seenInList.add(m.idMeal);
      const cur = ranked.get(m.idMeal);
      if (cur) cur.hits += 1;
      else ranked.set(m.idMeal, { meal: m, hits: 1 });
    }
  }

  let pool = [...ranked.values()];

  // Category filter — only apply if it actually narrows to something.
  if (opts.category) {
    const catList = await filterByCategory(opts.category);
    const catIds = new Set(catList.map((m) => m.idMeal));
    if (pool.length === 0 && catList.length) {
      // No ingredients selected, or none matched — fall back to category list.
      return catList.slice(0, 24);
    }
    const filtered = pool.filter((p) => catIds.has(p.meal.idMeal));
    if (filtered.length) pool = filtered;
    // else: ignore category rather than returning 0.
  }

  // Sort: most ingredient matches first, then alphabetic for stability.
  pool.sort((a, b) => b.hits - a.hits || a.meal.strMeal.localeCompare(b.meal.strMeal));
  return pool.slice(0, 24).map((p) => p.meal);
}

export function amazonSearchUrl(q: string) {
  return `https://www.amazon.com/s?k=${encodeURIComponent(q)}`;
}
export function instacartSearchUrl(q: string) {
  return `https://www.instacart.com/store/search/${encodeURIComponent(q)}`;
}

