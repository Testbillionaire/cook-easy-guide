import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden");
}

const ID_RE = /^[A-Za-z0-9_\-]{1,64}$/;
const tagsSchema = z.object({
  time_band: z.enum(["u15", "15_30", "30_60", "60p"]).nullable().optional(),
  dish_key: z.enum(["morning", "light", "main", "side", "soup", "salad", "sweet", "drink"]).nullable().optional(),
  effort_keys: z.array(z.enum(["one_pot", "no_cook", "make_ahead", "meal_prep"])).max(4).optional(),
});

// ============ Public read (used by home search) ============
export const getOverlaysSnapshot = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const [{ data: overlays }, { data: custom }] = await Promise.all([
    supabaseAdmin.from("recipe_overlays").select("recipe_id, status, time_band, dish_key, effort_keys, featured_rank"),
    supabaseAdmin.from("custom_recipes").select("id, title, image_url, category, area, instructions, ingredients"),
  ]);
  return {
    overlays: overlays ?? [],
    custom: custom ?? [],
  };
});

// ============ List for admin table ============
const listSchema = z.object({
  tab: z.enum(["all", "featured", "hidden", "custom", "reports"]).default("all"),
  search: z.string().max(255).default(""),
  page: z.number().int().min(0).max(1000).default(0),
});

export const listManagedRecipes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => listSchema.parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const pageSize = 30;

    // Pull overlays + custom + top-saved meals (those are the recipes we "know" about)
    const [{ data: overlays }, { data: custom }, { data: saves }] = await Promise.all([
      supabaseAdmin.from("recipe_overlays").select("*"),
      supabaseAdmin.from("custom_recipes").select("*").order("created_at", { ascending: false }),
      supabaseAdmin.from("saved_recipes").select("meal_id, meal_name, meal_thumb"),
    ]);

    type Row = {
      recipe_id: string;
      title: string;
      image_url: string;
      source: "mealdb" | "custom";
      status: "active" | "featured" | "hidden";
      time_band: string | null;
      dish_key: string | null;
      effort_keys: string[];
      featured_rank: number | null;
      saveCount: number;
    };

    const overlayById = new Map((overlays ?? []).map((o) => [o.recipe_id, o]));
    const rows = new Map<string, Row>();

    // From saves (MealDB recipes that have at least one save)
    const savesCount = new Map<string, { name: string; thumb: string; count: number }>();
    for (const s of saves ?? []) {
      const cur = savesCount.get(s.meal_id);
      if (cur) cur.count += 1;
      else savesCount.set(s.meal_id, { name: s.meal_name, thumb: s.meal_thumb, count: 1 });
    }
    for (const [id, v] of savesCount) {
      const ov = overlayById.get(id);
      rows.set(id, {
        recipe_id: id,
        title: v.name,
        image_url: v.thumb,
        source: "mealdb",
        status: (ov?.status as Row["status"]) ?? "active",
        time_band: ov?.time_band ?? null,
        dish_key: ov?.dish_key ?? null,
        effort_keys: ov?.effort_keys ?? [],
        featured_rank: ov?.featured_rank ?? null,
        saveCount: v.count,
      });
    }
    // Overlay-only mealdb entries (admin curated something with no saves yet)
    for (const o of overlays ?? []) {
      if (o.source !== "mealdb" || rows.has(o.recipe_id)) continue;
      rows.set(o.recipe_id, {
        recipe_id: o.recipe_id,
        title: `MealDB #${o.recipe_id}`,
        image_url: "",
        source: "mealdb",
        status: o.status as Row["status"],
        time_band: o.time_band,
        dish_key: o.dish_key,
        effort_keys: o.effort_keys ?? [],
        featured_rank: o.featured_rank,
        saveCount: 0,
      });
    }
    // Custom recipes
    for (const c of custom ?? []) {
      const ov = overlayById.get(c.id);
      rows.set(c.id, {
        recipe_id: c.id,
        title: c.title,
        image_url: c.image_url,
        source: "custom",
        status: (ov?.status as Row["status"]) ?? "active",
        time_band: ov?.time_band ?? null,
        dish_key: ov?.dish_key ?? null,
        effort_keys: ov?.effort_keys ?? [],
        featured_rank: ov?.featured_rank ?? null,
        saveCount: savesCount.get(c.id)?.count ?? 0,
      });
    }

    let list = [...rows.values()];
    if (data.tab === "featured") list = list.filter((r) => r.status === "featured");
    else if (data.tab === "hidden") list = list.filter((r) => r.status === "hidden");
    else if (data.tab === "custom") list = list.filter((r) => r.source === "custom");

    if (data.search) {
      const q = data.search.toLowerCase();
      list = list.filter((r) => r.title.toLowerCase().includes(q) || r.recipe_id.toLowerCase().includes(q));
    }

    list.sort((a, b) => {
      if (a.status === "featured" && b.status !== "featured") return -1;
      if (b.status === "featured" && a.status !== "featured") return 1;
      return b.saveCount - a.saveCount || a.title.localeCompare(b.title);
    });

    const total = list.length;
    const start = data.page * pageSize;
    return {
      rows: list.slice(start, start + pageSize),
      total,
      pageSize,
    };
  });

// ============ Upsert overlay (feature/hide/retag) ============
const upsertSchema = z.object({
  recipe_id: z.string().regex(ID_RE),
  source: z.enum(["mealdb", "custom"]).default("mealdb"),
  status: z.enum(["active", "featured", "hidden"]).default("active"),
  featured_rank: z.number().int().min(0).max(10000).nullable().optional(),
}).and(tagsSchema);

export const upsertOverlay = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => upsertSchema.parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const payload = {
      recipe_id: data.recipe_id,
      source: data.source,
      status: data.status,
      time_band: data.time_band ?? null,
      dish_key: data.dish_key ?? null,
      effort_keys: data.effort_keys ?? [],
      featured_rank: data.status === "featured" ? (data.featured_rank ?? 100) : null,
    };
    const { error } = await supabaseAdmin.from("recipe_overlays").upsert(payload, { onConflict: "recipe_id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ============ Bulk actions ============
const bulkStatusSchema = z.object({
  recipe_ids: z.array(z.string().regex(ID_RE)).min(1).max(200),
  sources: z.array(z.enum(["mealdb", "custom"])).min(1).max(200),
  status: z.enum(["active", "featured", "hidden"]),
});

export const bulkSetStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => bulkStatusSchema.parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const rows = data.recipe_ids.map((id, i) => ({
      recipe_id: id,
      source: data.sources[i] ?? "mealdb",
      status: data.status,
      featured_rank: data.status === "featured" ? 100 : null,
    }));
    const { error } = await supabaseAdmin.from("recipe_overlays").upsert(rows, { onConflict: "recipe_id" });
    if (error) throw new Error(error.message);
    return { ok: true, count: rows.length };
  });

const bulkRetagSchema = z.object({
  recipe_ids: z.array(z.string().regex(ID_RE)).min(1).max(200),
  sources: z.array(z.enum(["mealdb", "custom"])).min(1).max(200),
}).and(tagsSchema);

export const bulkRetag = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => bulkRetagSchema.parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const rows = data.recipe_ids.map((id, i) => ({
      recipe_id: id,
      source: data.sources[i] ?? "mealdb",
      status: "active" as const,
      time_band: data.time_band ?? null,
      dish_key: data.dish_key ?? null,
      effort_keys: data.effort_keys ?? [],
    }));
    // upsert tag fields only (don't clobber status if present)
    for (const r of rows) {
      const { data: existing } = await supabaseAdmin
        .from("recipe_overlays").select("status, featured_rank")
        .eq("recipe_id", r.recipe_id).maybeSingle();
      const { error } = await supabaseAdmin.from("recipe_overlays").upsert({
        ...r,
        status: existing?.status ?? r.status,
        featured_rank: existing?.featured_rank ?? null,
      }, { onConflict: "recipe_id" });
      if (error) throw new Error(error.message);
    }
    return { ok: true, count: rows.length };
  });

// ============ Custom recipe CRUD ============
const ingredientItem = z.object({ name: z.string().min(1).max(100), measure: z.string().max(100).default("") });
const customSchema = z.object({
  id: z.string().regex(ID_RE).optional(),
  title: z.string().min(1).max(200),
  image_url: z.string().url().max(500).or(z.literal("")).default(""),
  instructions: z.string().max(20000).default(""),
  category: z.string().max(100).default(""),
  area: z.string().max(100).default(""),
  ingredients: z.array(ingredientItem).max(40).default([]),
});

export const upsertCustomRecipe = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => customSchema.parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const id = data.id ?? `cust_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
    const { error } = await supabaseAdmin.from("custom_recipes").upsert({
      id,
      title: data.title,
      image_url: data.image_url,
      instructions: data.instructions,
      category: data.category,
      area: data.area,
      ingredients: data.ingredients,
      created_by: context.userId,
    }, { onConflict: "id" });
    if (error) throw new Error(error.message);
    return { id };
  });

export const deleteCustomRecipe = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().regex(ID_RE) }).parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("recipe_overlays").delete().eq("recipe_id", data.id);
    const { error } = await supabaseAdmin.from("custom_recipes").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getCustomRecipe = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().regex(ID_RE) }).parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin.from("custom_recipes").select("*").eq("id", data.id).maybeSingle();
    return row;
  });

// ============ Import from MealDB ============
export const importMealDbRecipe = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ mealdb_id: z.string().regex(/^\d{1,12}$/) }).parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const res = await fetch(`https://www.themealdb.com/api/json/v1/1/lookup.php?i=${data.mealdb_id}`);
    const j = (await res.json()) as { meals: Record<string, string>[] | null };
    const m = j.meals?.[0];
    if (!m) throw new Error("Recipe not found in MealDB");
    const ingredients: { name: string; measure: string }[] = [];
    for (let i = 1; i <= 20; i++) {
      const name = (m[`strIngredient${i}`] ?? "").trim();
      const measure = (m[`strMeasure${i}`] ?? "").trim();
      if (name) ingredients.push({ name, measure });
    }
    const id = `mealdb_${data.mealdb_id}`;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("custom_recipes").upsert({
      id,
      title: m.strMeal ?? "Untitled",
      image_url: m.strMealThumb ?? "",
      instructions: m.strInstructions ?? "",
      category: m.strCategory ?? "",
      area: m.strArea ?? "",
      ingredients,
      source_mealdb_id: data.mealdb_id,
      created_by: context.userId,
    }, { onConflict: "id" });
    if (error) throw new Error(error.message);
    return { id };
  });

// ============ Reports ============
export const listReports = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ status: z.enum(["open", "resolved", "dismissed", "all"]).default("open") }).parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let q = supabaseAdmin.from("recipe_reports").select("*").order("created_at", { ascending: false }).limit(200);
    if (data.status !== "all") q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const resolveReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({
    id: z.string().uuid(),
    action: z.enum(["resolve", "dismiss", "hide_recipe"]),
  }).parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (data.action === "hide_recipe") {
      const { data: rep } = await supabaseAdmin.from("recipe_reports").select("recipe_id").eq("id", data.id).single();
      if (rep) {
        await supabaseAdmin.from("recipe_overlays").upsert({
          recipe_id: rep.recipe_id,
          source: rep.recipe_id.startsWith("cust_") || rep.recipe_id.startsWith("mealdb_") ? "custom" : "mealdb",
          status: "hidden",
        }, { onConflict: "recipe_id" });
      }
    }
    await supabaseAdmin.from("recipe_reports").update({
      status: data.action === "dismiss" ? "dismissed" : "resolved",
      resolved_by: context.userId,
      resolved_at: new Date().toISOString(),
    }).eq("id", data.id);
    return { ok: true };
  });

export const getOpenReportCount = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { count } = await supabaseAdmin.from("recipe_reports").select("id", { count: "exact", head: true }).eq("status", "open");
    return { count: count ?? 0 };
  });
