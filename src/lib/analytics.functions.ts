import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const zipSchema = z.string().trim().min(2).max(12).regex(/^[A-Za-z0-9 -]+$/).optional().or(z.literal(""));

const searchSchema = z.object({
  ingredients: z.array(z.string().min(1).max(64)).max(20).default([]),
  timeBand: z.string().max(16).optional().nullable(),
  dishKey: z.string().max(16).optional().nullable(),
  effortKey: z.string().max(16).optional().nullable(),
  resultCount: z.number().int().min(0).max(10000),
  zip: zipSchema,
});

const saveSchema = z.object({
  mealId: z.string().min(1).max(64),
  mealName: z.string().min(1).max(255),
  zip: zipSchema,
});

const trendingSchema = z.object({
  scope: z.enum(["global", "zip"]).default("global"),
  zip: zipSchema,
  range: z.enum(["day", "week", "month"]).default("week"),
});

async function enrichZip(zip: string | undefined | null) {
  const z = (zip || "").trim();
  if (!z) return { zip_code: null, country: null, region: null, city: null };
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: cached } = await supabaseAdmin
    .from("zip_cache").select("*").eq("zip_code", z).maybeSingle();
  if (cached) return { zip_code: z, country: cached.country, region: cached.region, city: cached.city };
  let country: string | null = null, region: string | null = null, city: string | null = null;
  // try US (zippopotam) for 5-digit ZIPs
  if (/^\d{5}$/.test(z)) {
    try {
      const r = await fetch(`https://api.zippopotam.us/us/${z}`);
      if (r.ok) {
        const j = await r.json() as { country?: string; places?: { "place name"?: string; state?: string }[] };
        country = j.country ?? "United States";
        region = j.places?.[0]?.state ?? null;
        city = j.places?.[0]?.["place name"] ?? null;
      }
    } catch { /* ignore */ }
  }
  await supabaseAdmin.from("zip_cache").upsert({ zip_code: z, country, region, city });
  return { zip_code: z, country, region, city };
}

export const logSearch = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => searchSchema.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const loc = await enrichZip(data.zip);
    // best-effort user_id from bearer (optional)
    let user_id: string | null = null;
    try {
      const { getRequestHeader } = await import("@tanstack/react-start/server");
      const auth = getRequestHeader("authorization");
      if (auth?.startsWith("Bearer ")) {
        const token = auth.slice(7);
        const { data: claims } = await supabaseAdmin.auth.getClaims(token);
        user_id = claims?.claims?.sub ?? null;
        if (user_id) {
          await supabaseAdmin.from("profiles").update({ last_seen_at: new Date().toISOString() }).eq("id", user_id);
        }
      }
    } catch { /* anonymous */ }
    await supabaseAdmin.from("search_events").insert({
      user_id,
      ingredients: data.ingredients,
      time_band: data.timeBand || null,
      dish_key: data.dishKey || null,
      effort_key: data.effortKey || null,
      result_count: data.resultCount,
      ...loc,
    });
    return { ok: true };
  });

export const logSave = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => saveSchema.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const loc = await enrichZip(data.zip);
    let user_id: string | null = null;
    try {
      const { getRequestHeader } = await import("@tanstack/react-start/server");
      const auth = getRequestHeader("authorization");
      if (auth?.startsWith("Bearer ")) {
        const { data: claims } = await supabaseAdmin.auth.getClaims(auth.slice(7));
        user_id = claims?.claims?.sub ?? null;
      }
    } catch { /* anonymous */ }
    await supabaseAdmin.from("recipe_save_events").insert({
      user_id,
      meal_id: data.mealId,
      meal_name: data.mealName,
      zip_code: loc.zip_code,
      country: loc.country,
    });
    return { ok: true };
  });

export const getTrendingKeywords = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => trendingSchema.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const days = data.range === "day" ? 1 : data.range === "week" ? 7 : 30;
    const since = new Date(Date.now() - days * 86400_000).toISOString();
    let q = supabaseAdmin.from("search_events").select("ingredients, zip_code").gte("created_at", since).limit(5000);
    if (data.scope === "zip" && data.zip) q = q.eq("zip_code", data.zip.trim());
    const { data: rows } = await q;
    const counts = new Map<string, number>();
    for (const r of rows ?? []) {
      for (const ing of (r.ingredients as string[] | null) ?? []) {
        const k = ing.toLowerCase();
        counts.set(k, (counts.get(k) ?? 0) + 1);
      }
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([keyword, count]) => ({ keyword, count }));
  });
