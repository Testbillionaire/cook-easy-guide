import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden");
}

const rangeSchema = z.object({ range: z.enum(["day", "week", "month"]).default("week") });
const sinceMs = (r: "day" | "week" | "month") => (r === "day" ? 1 : r === "week" ? 7 : 30) * 86400_000;

export const getTrafficStats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => rangeSchema.parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const since = new Date(Date.now() - sinceMs(data.range)).toISOString();
    const { data: events } = await supabaseAdmin
      .from("search_events")
      .select("created_at, user_id, country, zip_code")
      .gte("created_at", since)
      .limit(20000);
    const rows = events ?? [];
    const byDay = new Map<string, number>();
    const users = new Set<string>();
    const zips = new Map<string, number>();
    const countries = new Map<string, number>();
    for (const r of rows) {
      const d = r.created_at.slice(0, 10);
      byDay.set(d, (byDay.get(d) ?? 0) + 1);
      if (r.user_id) users.add(r.user_id);
      if (r.zip_code) zips.set(r.zip_code, (zips.get(r.zip_code) ?? 0) + 1);
      if (r.country) countries.set(r.country, (countries.get(r.country) ?? 0) + 1);
    }
    return {
      totalSearches: rows.length,
      uniqueUsers: users.size,
      series: [...byDay.entries()].sort().map(([date, count]) => ({ date, count })),
      topZips: [...zips.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([zip, count]) => ({ zip, count })),
      topCountries: [...countries.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([country, count]) => ({ country, count })),
    };
  });

const keywordsSchema = z.object({
  range: z.enum(["day", "week", "month"]).default("week"),
  groupBy: z.enum(["global", "zip", "country"]).default("global"),
});

export const getTopKeywords = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => keywordsSchema.parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const since = new Date(Date.now() - sinceMs(data.range)).toISOString();
    const { data: rows } = await supabaseAdmin
      .from("search_events")
      .select("ingredients, zip_code, country")
      .gte("created_at", since)
      .limit(20000);
    if (data.groupBy === "global") {
      const counts = new Map<string, number>();
      for (const r of rows ?? []) for (const ing of (r.ingredients as string[] | null) ?? []) {
        const k = ing.toLowerCase();
        counts.set(k, (counts.get(k) ?? 0) + 1);
      }
      return {
        groupBy: "global" as const,
        groups: [{ label: "All locations", keywords: topN(counts, 15) }],
      };
    }
    const groups = new Map<string, Map<string, number>>();
    for (const r of rows ?? []) {
      const key = (data.groupBy === "zip" ? r.zip_code : r.country) || "Unknown";
      let m = groups.get(key); if (!m) { m = new Map(); groups.set(key, m); }
      for (const ing of (r.ingredients as string[] | null) ?? []) {
        const k = ing.toLowerCase(); m.set(k, (m.get(k) ?? 0) + 1);
      }
    }
    return {
      groupBy: data.groupBy,
      groups: [...groups.entries()]
        .sort((a, b) => sum(b[1]) - sum(a[1]))
        .slice(0, 20)
        .map(([label, m]) => ({ label, keywords: topN(m, 10) })),
    };
  });

function topN(m: Map<string, number>, n: number) {
  return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([keyword, count]) => ({ keyword, count }));
}
function sum(m: Map<string, number>) { let s = 0; for (const v of m.values()) s += v; return s; }

export const getTopRecipes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => rangeSchema.parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const since = new Date(Date.now() - sinceMs(data.range)).toISOString();
    const { data: rows } = await supabaseAdmin
      .from("recipe_save_events")
      .select("meal_id, meal_name")
      .gte("created_at", since)
      .limit(20000);
    const m = new Map<string, { name: string; count: number }>();
    for (const r of rows ?? []) {
      const cur = m.get(r.meal_id);
      if (cur) cur.count += 1;
      else m.set(r.meal_id, { name: r.meal_name, count: 1 });
    }
    return [...m.entries()]
      .map(([meal_id, v]) => ({ meal_id, meal_name: v.name, count: v.count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);
  });

const listSchema = z.object({
  search: z.string().max(255).optional().default(""),
  page: z.number().int().min(0).max(1000).default(0),
});

export const listUsers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => listSchema.parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const pageSize = 25;
    let q = supabaseAdmin
      .from("profiles")
      .select("id, email, created_at, last_seen_at, disabled", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(data.page * pageSize, data.page * pageSize + pageSize - 1);
    if (data.search) q = q.ilike("email", `%${data.search}%`);
    const { data: rows, count } = await q;
    const ids = (rows ?? []).map((r) => r.id);
    const [{ data: roles }, { data: saves }, { data: searches }] = await Promise.all([
      supabaseAdmin.from("user_roles").select("user_id, role").in("user_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]),
      supabaseAdmin.from("saved_recipes").select("user_id").in("user_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]),
      supabaseAdmin.from("search_events").select("user_id").in("user_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]),
    ]);
    const adminSet = new Set((roles ?? []).filter((r) => r.role === "admin").map((r) => r.user_id));
    const saveCount = new Map<string, number>();
    for (const s of saves ?? []) saveCount.set(s.user_id!, (saveCount.get(s.user_id!) ?? 0) + 1);
    const searchCount = new Map<string, number>();
    for (const s of searches ?? []) if (s.user_id) searchCount.set(s.user_id, (searchCount.get(s.user_id) ?? 0) + 1);
    return {
      total: count ?? 0,
      pageSize,
      users: (rows ?? []).map((r) => ({
        ...r,
        isAdmin: adminSet.has(r.id),
        saveCount: saveCount.get(r.id) ?? 0,
        searchCount: searchCount.get(r.id) ?? 0,
      })),
    };
  });

const userIdSchema = z.object({ userId: z.string().uuid() });

export const getUserActivity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => userIdSchema.parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: searches }, { data: saves }] = await Promise.all([
      supabaseAdmin.from("search_events").select("ingredients, time_band, dish_key, effort_key, result_count, zip_code, created_at").eq("user_id", data.userId).order("created_at", { ascending: false }).limit(50),
      supabaseAdmin.from("saved_recipes").select("meal_id, meal_name, meal_thumb, created_at").eq("user_id", data.userId).order("created_at", { ascending: false }).limit(50),
    ]);
    return { searches: searches ?? [], saves: saves ?? [] };
  });

const setRoleSchema = z.object({
  userId: z.string().uuid(),
  action: z.enum(["grant", "revoke"]),
});

export const setAdminRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => setRoleSchema.parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    if (data.userId === context.userId && data.action === "revoke") {
      throw new Error("You cannot revoke your own admin role.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (data.action === "grant") {
      await supabaseAdmin.from("user_roles").upsert({ user_id: data.userId, role: "admin" }, { onConflict: "user_id,role" });
    } else {
      await supabaseAdmin.from("user_roles").delete().eq("user_id", data.userId).eq("role", "admin");
    }
    return { ok: true };
  });

const setDisabledSchema = z.object({ userId: z.string().uuid(), disabled: z.boolean() });

export const setUserDisabled = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => setDisabledSchema.parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    if (data.userId === context.userId) throw new Error("You cannot disable your own account.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // ban via auth admin (24 hours * 365 ~ effectively disabled)
    await supabaseAdmin.auth.admin.updateUserById(data.userId, {
      ban_duration: data.disabled ? "8760h" : "none",
    });
    await supabaseAdmin.from("profiles").update({ disabled: data.disabled }).eq("id", data.userId);
    return { ok: true };
  });

export const deleteUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => userIdSchema.parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    if (data.userId === context.userId) throw new Error("You cannot delete your own account.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.auth.admin.deleteUser(data.userId);
    return { ok: true };
  });

export const checkAmAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    return { isAdmin: !!data };
  });
