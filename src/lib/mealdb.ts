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
  // Custom / imported recipes live in our DB
  if (id.startsWith("cust_") || id.startsWith("mealdb_")) {
    const { supabase } = await import("@/integrations/supabase/client");
    const { data } = await supabase
      .from("custom_recipes")
      .select("id, title, image_url, instructions, category, area, ingredients, source_mealdb_id")
      .eq("id", id)
      .maybeSingle();
    if (!data) return null;
    return {
      idMeal: data.id,
      strMeal: data.title,
      strMealThumb: data.image_url,
      strCategory: data.category,
      strArea: data.area,
      strInstructions: data.instructions,
      strSource: data.source_mealdb_id ? `https://www.themealdb.com/meal/${data.source_mealdb_id}` : undefined,
      ingredients: Array.isArray(data.ingredients) ? (data.ingredients as { name: string; measure: string }[]) : [],
    };
  }
  const r = await fetch(`${BASE}/lookup.php?i=${encodeURIComponent(id)}`);
  const j = (await r.json()) as { meals: Record<string, string>[] | null };
  const m = j.meals?.[0];
  if (!m) return null;
  return toDetail(m);
}

// ============== Overlay-aware result post-processing ==============
export type OverlayRow = {
  recipe_id: string;
  status: "active" | "featured" | "hidden";
  time_band: string | null;
  dish_key: string | null;
  effort_keys: string[];
  featured_rank: number | null;
};
export type CustomRow = {
  id: string;
  title: string;
  image_url: string;
  category: string;
  area: string;
  instructions: string;
  ingredients: { name: string; measure: string }[];
};
export type OverlaySnapshot = { overlays: OverlayRow[]; custom: CustomRow[] };

export function applyOverlays(
  base: MealSummary[],
  snapshot: OverlaySnapshot | undefined,
  opts: FindOpts,
): MealSummary[] {
  if (!snapshot) return base;
  const byId = new Map(snapshot.overlays.map((o) => [o.recipe_id, o]));
  // Drop hidden
  let result = base.filter((m) => byId.get(m.idMeal)?.status !== "hidden");

  // Merge custom recipes matching filters
  const ingLower = opts.ingredients.map((i) => i.toLowerCase());
  const wanted = (c: CustomRow) => {
    const ov = byId.get(c.id);
    if (ov?.status === "hidden") return false;
    if (opts.time && ov?.time_band && ov.time_band !== opts.time) return false;
    if (opts.dish && ov?.dish_key && ov.dish_key !== opts.dish) return false;
    if (opts.effort && ov?.effort_keys?.length && !ov.effort_keys.includes(opts.effort)) return false;
    if (ingLower.length) {
      const hay = (c.ingredients ?? []).map((i) => i.name.toLowerCase()).join(" ");
      const any = ingLower.some((k) => hay.includes(k));
      if (!any) return false;
    }
    return true;
  };
  const seen = new Set(result.map((m) => m.idMeal));
  for (const c of snapshot.custom) {
    if (seen.has(c.id) || !wanted(c)) continue;
    result.push({ idMeal: c.id, strMeal: c.title, strMealThumb: c.image_url });
  }

  // Sort featured first
  result.sort((a, b) => {
    const fa = byId.get(a.idMeal)?.featured_rank;
    const fb = byId.get(b.idMeal)?.featured_rank;
    if (fa != null && fb == null) return -1;
    if (fb != null && fa == null) return 1;
    if (fa != null && fb != null) return fa - fb;
    return 0;
  });
  return result;
}

export function isFeatured(id: string, snapshot: OverlaySnapshot | undefined): boolean {
  if (!snapshot) return false;
  return snapshot.overlays.some((o) => o.recipe_id === id && o.status === "featured");
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
export function inTimeBand(mins: number, b: TimeBand): boolean {
  if (b === "u15") return mins < 15;
  if (b === "15_30") return mins >= 15 && mins <= 30;
  if (b === "30_60") return mins > 30 && mins <= 60;
  return mins > 60;
}
export function matchEffort(d: MealDetail, e: EffortKey): boolean {
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

// Renders a scaled quantity as a friendly fraction ("1¼") rather than a raw
// decimal. Shared by recipe-detail scaling and anywhere else that previews
// a scaled amount (e.g. the portion-profile summary panel).
export function formatQty(n: number): string {
  if (!isFinite(n) || n <= 0) return "";
  const whole = Math.floor(n);
  const frac = n - whole;
  const fracMap: [number, string][] = [
    [0, ""], [0.125, "⅛"], [0.25, "¼"], [0.333, "⅓"], [0.5, "½"],
    [0.666, "⅔"], [0.75, "¾"], [0.875, "⅞"], [1, ""],
  ];
  let best = fracMap[0];
  for (const f of fracMap) if (Math.abs(frac - f[0]) < Math.abs(frac - best[0])) best = f;
  if (best[0] === 1) return `${whole + 1}`;
  if (whole === 0) return best[1] || n.toFixed(2).replace(/\.?0+$/, "");
  return best[1] ? `${whole} ${best[1]}` : `${whole}`;
}

export const AMAZON_AFFILIATE_TAG = "w2c0a-20";
export function amazonSearchUrl(q: string) {
  return `https://www.amazon.com/s?k=${encodeURIComponent(q)}&tag=${AMAZON_AFFILIATE_TAG}`;
}
export function instacartSearchUrl(q: string) {
  return `https://www.instacart.com/store/search/${encodeURIComponent(q)}`;
}
