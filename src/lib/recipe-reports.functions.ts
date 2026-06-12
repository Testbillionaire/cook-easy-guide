import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const reportSchema = z.object({
  recipe_id: z.string().min(1).max(64),
  recipe_name: z.string().max(200).default(""),
  reason: z.enum(["wrong_info", "broken_image", "inappropriate", "other"]),
  note: z.string().max(1000).optional(),
});

export const submitReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => reportSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase.from("recipe_reports").insert({
      recipe_id: data.recipe_id,
      recipe_name: data.recipe_name,
      reason: data.reason,
      note: data.note ?? null,
      reporter_id: context.userId,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
