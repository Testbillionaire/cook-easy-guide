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

const COOKING_PREFIXES = [
  "cooked", "roast", "roasted", "stale", "boiled", "sauteed", "sautéed",
  "caramelised", "caramelized", "leftover", "day-old", "mashed", "fried",
  "grilled", "baked", "steamed", "raw", "ground",
];

export function toMealdbCandidates(rawKey: string): string[] {
  let k = rawKey.toLowerCase().trim();
  if (k.startsWith("lo-")) k = k.slice(3);
  for (const p of COOKING_PREFIXES) {
    const pref = `${p}-`;
    if (k.startsWith(pref)) {
      k = k.slice(pref.length);
      break;
    }
  }
  k = k.replace(/[()]/g, " ").replace(/\s+/g, " ").replace(/-/g, " ").trim();
  if (!k) return [];

  const words = k.split(" ").filter(Boolean);
  const candidates: string[] = [];
  candidates.push(words.join(" "));
  for (let n = words.length - 1; n >= 1; n--) {
    candidates.push(words.slice(0, n).join(" "));
  }
  if (words.length > 1) candidates.push(words[words.length - 1]);
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

async function searchByName(name: string): Promise<MealDetail[]> {
  const r = await fetch(`${BASE}/search.php?s=${encodeURIComponent(name)}`);
  const j = (await r.json()) as { meals: Record<string, string>[] | null };
  return (j.meals ?? []).map(toDetail);
}

function toDetail(m: Record<string, string>): MealDetail {
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

export async function lookupMeal(id: string): Promise<MealDetail | null> {
  const r = await fetch(`${BASE}/lookup.php?i=${encodeURIComponent(id)}`);
  const j = (await r.json()) as { meals: Record<string, string>[] | null };
  const m = j.meals?.[0];
  if (!m) return null;
  return toDetail(m);
}

// ============== Filter types ==============
export type TimeBand = "u15" | "15_30" | "30_60" | "60p";
export type DishKey =
  | "morning" | "light" | "main" | "side" | "soup" | "salad" | "sweet" | "drink";
export type EffortKey = "one_pot" | "no_cook" | "make_ahead" | "meal_prep";

const DISH_CATEGORIES: Record<DishKey, string[]> = {
  morning: ["Breakfast"],
  light: ["Starter", "Side"],
  main: ["Beef", "Chicken", "Lamb", "Pork", "Goat", "Pasta", "Seafood"],
  side: ["Side"],
  soup: [],
  salad: [],
  sweet: ["Dessert"],
  drink: [],
};
const DISH_NAME_RE: Partial<Record<DishKey, RegExp>> = {
  soup: /\b(soup|stew|chowder|broth|bisque)\b/i,
  salad: /\bsalad\b/i,
};

// ----- heuristics -----
export function estimateMinutes(d: MealDetail): number {
  const ing = d.ingredients.length;
  const len = d.strInstructions?.length ?? 0;
  return Math.round(5 + 2 * ing + len / 220);
}
function inTimeBand(mins: number, b: TimeBand): boolean {
  if (b === "u15") return mins < 15;
  if (b === "15_30") return mins >= 15 && mins <= 30;
  if (b === "30_60") return mins > 30 && mins <= 60;
  return mins > 60;
}
function matchEffort(d: MealDetail, e: EffortKey): boolean {
  const t = (d.strInstructions || "").toLowerCase();
  if (e === "no_cook") {
    return !/\b(cook|bake|baked|baking|fry|fried|boil|boiled|simmer|simmered|roast|roasted|grill|grilled|saut|broil|steam)\b/.test(t);
  }
  if (e === "one_pot") {
    const hasVessel = /\b(pot|skillet|pan|wok|dutch oven|saucepan)\b/.test(t);
    const multi = (t.match(/\b(pot|skillet|pan|wok|saucepan)\b/g) || []).length;
    return hasVessel && multi <= 4 && !/\b(separate pan|another pan|second pan|in a separate)\b/.test(t);
  }
  if (e === "make_ahead") {
    return /\b(refrigerate|overnight|chill|marinate|marinade|rest for|let it rest|set aside for)\b/.test(t);
  }
  // meal_prep
  return /\b(batch|portion|portions|freeze|freezer|store in|airtight)\b/.test(t) ||
    /\b(serves|serving)s?\s*(4|5|6|8|10|12)\b/.test(t);
}

// ----- main finder -----
export type FindOpts = {
  ingredients: string[];
  time?: TimeBand;
  dish?: DishKey;
  effort?: EffortKey;
};

export async function findRecipes(opts: FindOpts): Promise<MealSummary[]> {
  const keys = opts.ingredients.filter(Boolean);

  // 1) ingredient pool
  const ingredientLists = await Promise.all(
    keys.map((k) => filterByIngredientWithFallback(k)),
  );
  const ranked = new Map<string, { meal: MealSummary; hits: number }>();
  for (const list of ingredientLists) {
    const seen = new Set<string>();
    for (const m of list) {
      if (seen.has(m.idMeal)) continue;
      seen.add(m.idMeal);
      const cur = ranked.get(m.idMeal);
      if (cur) cur.hits += 1;
      else ranked.set(m.idMeal, { meal: m, hits: 1 });
    }
  }
  let pool = [...ranked.values()];

  // 2) dish — category intersect or name fallback
  if (opts.dish) {
    const cats = DISH_CATEGORIES[opts.dish];
    const nameRe = DISH_NAME_RE[opts.dish];
    let dishPool: MealSummary[] = [];
    if (cats.length) {
      const lists = await Promise.all(cats.map((c) => filterByCategory(c)));
      const ids = new Set<string>();
      for (const l of lists) for (const m of l) if (!ids.has(m.idMeal)) { ids.add(m.idMeal); dishPool.push(m); }
    }
    if (nameRe && dishPool.length === 0) {
      // search by likely keyword(s)
      const words = opts.dish === "soup"
        ? ["soup", "stew", "chowder", "broth"]
        : ["salad"];
      const lists = await Promise.all(words.map((w) => searchByName(w)));
      const ids = new Set<string>();
      for (const l of lists) for (const m of l) if (!ids.has(m.idMeal)) { ids.add(m.idMeal); dishPool.push(m); }
    }
    if (opts.dish === "drink") {
      return []; // unsupported
    }

    if (pool.length === 0) {
      pool = dishPool.map((meal) => ({ meal, hits: 0 }));
    } else if (dishPool.length) {
      const dishIds = new Set(dishPool.map((m) => m.idMeal));
      const filtered = pool.filter((p) => dishIds.has(p.meal.idMeal));
      if (nameRe) {
        // also keep items whose name matches even if not in dishPool
        const extra = pool.filter((p) => nameRe.test(p.meal.strMeal) && !dishIds.has(p.meal.idMeal));
        if (filtered.length + extra.length) pool = [...filtered, ...extra];
      } else if (filtered.length) {
        pool = filtered;
      }
    }
  }

  pool.sort((a, b) => b.hits - a.hits || a.meal.strMeal.localeCompare(b.meal.strMeal));

  // 3) time / effort require details — only when needed
  if (opts.time || opts.effort) {
    const head = pool.slice(0, 30);
    const details = await Promise.all(head.map((p) => lookupMeal(p.meal.idMeal)));
    const filtered: typeof head = [];
    head.forEach((p, i) => {
      const d = details[i];
      if (!d) return;
      if (opts.time && !inTimeBand(estimateMinutes(d), opts.time)) return;
      if (opts.effort && !matchEffort(d, opts.effort)) return;
      filtered.push(p);
    });
    if (filtered.length >= 3 || pool.length === 0) {
      pool = filtered;
    } else {
      // relax: keep best-effort partial matches first, then rest
      const keptIds = new Set(filtered.map((p) => p.meal.idMeal));
      pool = [...filtered, ...pool.filter((p) => !keptIds.has(p.meal.idMeal))];
    }
  }

  return pool.slice(0, 24).map((p) => p.meal);
}

export function amazonSearchUrl(q: string) {
  return `https://www.amazon.com/s?k=${encodeURIComponent(q)}`;
}
export function instacartSearchUrl(q: string) {
  return `https://www.instacart.com/store/search/${encodeURIComponent(q)}`;
}
