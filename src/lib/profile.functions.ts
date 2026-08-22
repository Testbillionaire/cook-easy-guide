import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getMyProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Personal search keywords, last 30 days. Only searches made while signed
    // in are attributable, so this is a subset of someone's real activity.
    const since = new Date(Date.now() - 30 * 86400_000).toISOString();

    const [{ data: authUser }, profileRes, rolesRes, savedRes, searchRes, recentRes, savedPreviewRes] =
      await Promise.all([
        supabaseAdmin.auth.admin.getUserById(userId),
        supabase.from("profiles").select("email, created_at, last_seen_at, disabled").eq("id", userId).maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", userId),
        supabaseAdmin.from("saved_recipes").select("id", { count: "exact", head: true }).eq("user_id", userId),
        supabaseAdmin.from("search_events").select("id", { count: "exact", head: true }).eq("user_id", userId),
        supabaseAdmin
          .from("search_events")
          .select("ingredients")
          .eq("user_id", userId)
          .gte("created_at", since)
          .limit(2000),
        // A few most-recent saves to preview on the profile card.
        supabaseAdmin
          .from("saved_recipes")
          .select("meal_id, meal_name, meal_thumb")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(4),
      ]);

    const counts = new Map<string, number>();
    let searchesLast30 = 0;
    for (const row of recentRes.data ?? []) {
      searchesLast30 += 1;
      for (const ing of (row.ingredients as string[] | null) ?? []) {
        const k = ing.toLowerCase().trim();
        if (k) counts.set(k, (counts.get(k) ?? 0) + 1);
      }
    }
    const topKeywords = [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 8)
      .map(([keyword, count]) => ({ keyword, count }));

    // touch last_seen_at
    await supabaseAdmin.from("profiles").update({ last_seen_at: new Date().toISOString() }).eq("id", userId);

    const email = profileRes.data?.email ?? authUser?.user?.email ?? null;
    return {
      id: userId,
      email,
      created_at: profileRes.data?.created_at ?? authUser?.user?.created_at ?? null,
      last_seen_at: profileRes.data?.last_seen_at ?? null,
      disabled: profileRes.data?.disabled ?? false,
      roles: (rolesRes.data ?? []).map((r) => r.role as string),
      isAdmin: (rolesRes.data ?? []).some((r) => r.role === "admin"),
      savedCount: savedRes.count ?? 0,
      searchCount: searchRes.count ?? 0,
      searchesLast30,
      topKeywords,
      recentSaved: savedPreviewRes.data ?? [],
    };
  });

// Logs a wanted-but-unsupported dietary restriction from the portion-profile
// page — see supabase/migrations/20260821090000_diet_requests.sql for why.
// Upsert on (user_id, label) so repeated toggling doesn't inflate demand.
const dietRequestSchema = z.object({
  label: z.string().trim().min(1).max(80),
  source: z.enum(["custom", "preset"]).default("custom"),
});

export const recordDietRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => dietRequestSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("diet_requests")
      .upsert(
        { user_id: context.userId, label: data.label, source: data.source },
        { onConflict: "user_id,label" },
      );
    if (error) console.error("Failed to record diet request", { error });
    return { ok: true };
  });
