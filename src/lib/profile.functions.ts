import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getMyProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [{ data: authUser }, profileRes, rolesRes, savedRes, searchRes] = await Promise.all([
      supabaseAdmin.auth.admin.getUserById(userId),
      supabase.from("profiles").select("email, created_at, last_seen_at, disabled").eq("id", userId).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", userId),
      supabaseAdmin.from("saved_recipes").select("id", { count: "exact", head: true }).eq("user_id", userId),
      supabaseAdmin.from("search_events").select("id", { count: "exact", head: true }).eq("user_id", userId),
    ]);

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
    };
  });
