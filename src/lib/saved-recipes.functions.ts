import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const saveSchema = z.object({
  mealId: z.string().min(1).max(64),
  mealName: z.string().min(1).max(255),
  mealThumb: z.string().url().max(2048),
});

const mealIdSchema = z.object({ mealId: z.string().min(1).max(64) });

export const saveRecipe = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => saveSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("saved_recipes")
      .upsert(
        {
          user_id: context.userId,
          meal_id: data.mealId,
          meal_name: data.mealName,
          meal_thumb: data.mealThumb,
        },
        { onConflict: "user_id,meal_id" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const unsaveRecipe = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => mealIdSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("saved_recipes")
      .delete()
      .eq("user_id", context.userId)
      .eq("meal_id", data.mealId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listSavedRecipes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("saved_recipes")
      .select("meal_id, meal_name, meal_thumb, created_at")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const listSavedRecipeIds = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("saved_recipes")
      .select("meal_id")
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => r.meal_id);
  });
