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

export async function filterByIngredient(ingredient: string): Promise<MealSummary[]> {
  const r = await fetch(`${BASE}/filter.php?i=${encodeURIComponent(slug(ingredient))}`);
  const j = (await r.json()) as { meals: MealSummary[] | null };
  return j.meals ?? [];
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
  const lists: MealSummary[][] = [];
  for (const ing of opts.ingredients.filter(Boolean)) {
    lists.push(await filterByIngredient(ing));
  }
  if (opts.category) {
    lists.push(await filterByCategory(opts.category));
  }
  if (lists.length === 0) return [];
  // intersect by idMeal
  const [first, ...rest] = lists;
  const map = new Map(first.map((m) => [m.idMeal, m]));
  for (const list of rest) {
    const ids = new Set(list.map((m) => m.idMeal));
    for (const id of [...map.keys()]) if (!ids.has(id)) map.delete(id);
  }
  return [...map.values()].slice(0, 24);
}

export function amazonSearchUrl(q: string) {
  return `https://www.amazon.com/s?k=${encodeURIComponent(q)}&i=grocery`;
}
export function instacartSearchUrl(q: string) {
  return `https://www.instacart.com/store/s?k=${encodeURIComponent(q)}`;
}
