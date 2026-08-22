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
  // "auto" resolves the visitor's own location and narrows as far as the data
  // supports: state -> country -> global.
  scope: z.enum(["auto", "global", "zip", "region", "country"]).default("global"),
  zip: zipSchema,
  region: z.string().trim().max(16).optional().nullable(),
  country: z.string().trim().max(4).optional().nullable(),
  range: z.enum(["day", "week", "month"]).default("week"),
  limit: z.number().int().min(1).max(12).default(10),
});

type Loc = {
  zip_code: string | null;
  country: string | null; // ISO-3166-1 alpha-2, e.g. "US", "GB"
  region: string | null;  // subdivision code, e.g. "CA", "NY", "ENG"
  city: string | null;
};

// Vercel's edge injects these on every request — worldwide coverage, no user
// input required. country/region are ISO codes; city arrives URL-encoded.
async function ipGeo(): Promise<Omit<Loc, "zip_code">> {
  try {
    const { getRequestHeader } = await import("@tanstack/react-start/server");
    const dec = (v: string | undefined | null) => {
      if (!v) return null;
      try { return decodeURIComponent(v) || null; } catch { return v || null; }
    };
    return {
      country: getRequestHeader("x-vercel-ip-country") || null,
      region: getRequestHeader("x-vercel-ip-country-region") || null,
      city: dec(getRequestHeader("x-vercel-ip-city")),
    };
  } catch {
    return { country: null, region: null, city: null };
  }
}

// A bare postal code is ambiguous worldwide ("1000" is valid in several
// countries), so ZIP is only used to *refine* US locations. IP geo is the
// baseline everywhere else.
async function resolveLocation(zip: string | undefined | null): Promise<Loc> {
  const geo = await ipGeo();
  const z = (zip || "").trim();
  if (!z) return { zip_code: null, ...geo };

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: cached } = await supabaseAdmin
    .from("zip_cache").select("*").eq("zip_code", z).maybeSingle();
  if (cached) {
    return {
      zip_code: z,
      country: cached.country ?? geo.country,
      region: cached.region ?? geo.region,
      city: cached.city ?? geo.city,
    };
  }

  let country: string | null = null, region: string | null = null, city: string | null = null;
  if (/^\d{5}$/.test(z)) {
    try {
      const r = await fetch(`https://api.zippopotam.us/us/${z}`);
      if (r.ok) {
        const j = (await r.json()) as {
          "country abbreviation"?: string;
          places?: { "place name"?: string; "state abbreviation"?: string }[];
        };
        // Use the abbreviations so ZIP- and IP-derived values are comparable.
        country = j["country abbreviation"] ?? "US";
        region = j.places?.[0]?.["state abbreviation"] ?? null;
        city = j.places?.[0]?.["place name"] ?? null;
      }
    } catch { /* ignore — fall back to IP geo */ }
  }
  await supabaseAdmin.from("zip_cache").upsert({ zip_code: z, country, region, city });
  return {
    zip_code: z,
    country: country ?? geo.country,
    region: region ?? geo.region,
    city: city ?? geo.city,
  };
}

export const logSearch = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => searchSchema.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const loc = await resolveLocation(data.zip);
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
    const loc = await resolveLocation(data.zip);
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

// Email sign-in is disabled until custom SMTP is set up. Record who wanted it
// so we can size the demand and notify them once it works.
const emailInterestSchema = z.object({
  email: z.string().trim().email().max(255),
});

export const recordEmailInterest = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => emailInterestSchema.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.rpc("record_email_interest", { _email: data.email });
    if (error) console.error("Failed to record email interest", { error });
    return { ok: true };
  });

// A narrower scope is only worth showing if it has enough distinct keywords to
// look intentional — otherwise fall back to a wider one.
const MIN_KEYWORDS_FOR_SCOPE = 3;

type TrendScope = "region" | "country" | "global" | "zip";

export const getTrendingKeywords = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => trendingSchema.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const days = data.range === "day" ? 1 : data.range === "week" ? 7 : 30;
    const since = new Date(Date.now() - days * 86400_000).toISOString();

    const tally = async (
      apply: (q: any) => any,
    ): Promise<{ keyword: string; count: number }[]> => {
      let q = supabaseAdmin
        .from("search_events")
        .select("ingredients")
        .gte("created_at", since)
        .limit(5000);
      q = apply(q);
      const { data: rows } = await q;
      const counts = new Map<string, number>();
      for (const r of rows ?? []) {
        for (const ing of (r.ingredients as string[] | null) ?? []) {
          const k = ing.toLowerCase().trim();
          if (k) counts.set(k, (counts.get(k) ?? 0) + 1);
        }
      }
      return [...counts.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, data.limit)
        .map(([keyword, count]) => ({ keyword, count }));
    };

    // Explicit scopes: caller knows exactly what it wants.
    if (data.scope === "zip" && data.zip) {
      const zip = data.zip.trim();
      return {
        scope: "zip" as TrendScope,
        country: null, region: null,
        keywords: await tally((q) => q.eq("zip_code", zip)),
      };
    }
    if (data.scope === "region" && data.region) {
      return {
        scope: "region" as TrendScope,
        country: data.country ?? null, region: data.region,
        keywords: await tally((q) =>
          data.country ? q.eq("region", data.region).eq("country", data.country) : q.eq("region", data.region),
        ),
      };
    }
    if (data.scope === "country" && data.country) {
      return {
        scope: "country" as TrendScope,
        country: data.country, region: null,
        keywords: await tally((q) => q.eq("country", data.country)),
      };
    }
    if (data.scope === "global") {
      return {
        scope: "global" as TrendScope,
        country: null, region: null,
        keywords: await tally((q) => q),
      };
    }

    // "auto": narrow to the visitor's own state, widening until there's enough
    // to show. Location comes from the request's IP — nothing is asked of them.
    const geo = await ipGeo();
    if (geo.region && geo.country) {
      const kw = await tally((q) => q.eq("region", geo.region).eq("country", geo.country));
      if (kw.length >= MIN_KEYWORDS_FOR_SCOPE) {
        return { scope: "region" as TrendScope, country: geo.country, region: geo.region, keywords: kw };
      }
    }
    if (geo.country) {
      const kw = await tally((q) => q.eq("country", geo.country));
      if (kw.length >= MIN_KEYWORDS_FOR_SCOPE) {
        return { scope: "country" as TrendScope, country: geo.country, region: null, keywords: kw };
      }
    }
    return {
      scope: "global" as TrendScope,
      country: null, region: null,
      keywords: await tally((q) => q),
    };
  });
