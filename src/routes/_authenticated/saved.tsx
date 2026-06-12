import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft, ChefHat, Heart, Loader2, LogOut } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { listSavedRecipes, unsaveRecipe } from "@/lib/saved-recipes.functions";

export const Route = createFileRoute("/_authenticated/saved")({
  head: () => ({ meta: [{ title: "Saved recipes — Pantry" }] }),
  component: SavedPage,
});

function SavedPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const list = useServerFn(listSavedRecipes);
  const remove = useServerFn(unsaveRecipe);
  const [openId, setOpenId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["saved-recipes"],
    queryFn: () => list(),
  });

  const removeMut = useMutation({
    mutationFn: (mealId: string) => remove({ data: { mealId } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["saved-recipes"] });
      qc.invalidateQueries({ queryKey: ["saved-recipe-ids"] });
    },
  });

  const signOut = async () => {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/", replace: true });
  };

  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-5 pt-6">
        <Link to="/" className="flex items-center gap-2.5">
          <div className="grid h-9 w-9 place-items-center rounded-2xl bg-[var(--gradient-warm)] text-primary-foreground shadow-warm">
            <ChefHat className="h-4.5 w-4.5" strokeWidth={2.4} />
          </div>
          <span className="font-display text-xl font-semibold tracking-tight">Pantry</span>
        </Link>
        <button
          onClick={signOut}
          className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-semibold hover:bg-secondary"
        >
          <LogOut className="h-3.5 w-3.5" /> Sign out
        </button>
      </header>

      <main className="mx-auto max-w-5xl px-5 pb-24 pt-10">
        <div className="mb-8">
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
            Your collection
          </p>
          <h1 className="font-display text-4xl font-medium leading-[1.05] md:text-5xl">
            Saved recipes
          </h1>
        </div>

        {isLoading && (
          <div className="grid h-40 place-items-center">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        )}

        {data && data.length === 0 && (
          <div className="rounded-3xl border border-dashed border-border bg-card p-10 text-center">
            <div className="text-4xl">💛</div>
            <p className="mt-3 font-display text-xl">Nothing saved yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Tap the heart on any recipe to save it for later.
            </p>
            <Link
              to="/"
              className="mt-5 inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-warm"
            >
              Find a recipe
            </Link>
          </div>
        )}

        {data && data.length > 0 && (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 md:grid-cols-3">
            {data.map((r) => (
              <div
                key={r.meal_id}
                className="group relative overflow-hidden rounded-3xl border border-border bg-card text-left shadow-sm transition hover:-translate-y-1 hover:shadow-lift"
              >
                <button onClick={() => setOpenId(r.meal_id)} className="block w-full text-left">
                  <div className="relative aspect-[4/5] overflow-hidden bg-muted">
                    <img
                      src={r.meal_thumb}
                      alt={r.meal_name}
                      loading="lazy"
                      className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                    />
                    <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/70 to-transparent" />
                    <div className="absolute bottom-0 left-0 right-0 p-5">
                      <h3 className="font-display text-xl font-medium leading-tight text-white">
                        {r.meal_name}
                      </h3>
                    </div>
                  </div>
                </button>
                <button
                  onClick={() => removeMut.mutate(r.meal_id)}
                  disabled={removeMut.isPending}
                  title="Remove from saved"
                  className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full bg-white/90 text-primary shadow-warm backdrop-blur transition hover:scale-110 disabled:opacity-50"
                >
                  <Heart className="h-4 w-4 fill-current" />
                </button>
              </div>
            ))}
          </div>
        )}
      </main>

      <Dialog open={!!openId} onOpenChange={(o) => !o && setOpenId(null)}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto rounded-3xl p-0">
          <button
            onClick={() => setOpenId(null)}
            className="absolute left-4 top-4 z-50 inline-flex items-center gap-1.5 rounded-full bg-black/40 px-3 py-1.5 text-xs font-medium text-white backdrop-blur transition hover:bg-black/60"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back
          </button>
          {openId && <SavedRecipeView id={openId} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SavedRecipeView({ id }: { id: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["meal", id],
    queryFn: async () => {
      const { lookupMeal } = await import("@/lib/mealdb");
      return lookupMeal(id);
    },
  });
  if (isLoading) {
    return (
      <div className="grid h-80 place-items-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }
  if (!data) return null;
  return (
    <article>
      <div className="relative aspect-[16/9] overflow-hidden rounded-t-3xl bg-muted">
        <img src={data.strMealThumb} alt={data.strMeal} className="h-full w-full object-cover" />
        <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 p-6">
          <h2 className="font-display text-3xl font-medium text-white md:text-4xl">{data.strMeal}</h2>
        </div>
      </div>
      <div className="grid gap-8 p-6 md:grid-cols-[1fr_1.4fr] md:p-8">
        <section>
          <h3 className="mb-3 font-display text-xl">Ingredients</h3>
          <ul className="space-y-2">
            {data.ingredients.map((ing, i) => (
              <li key={i} className="rounded-xl border border-border bg-card px-3 py-2.5 text-sm">
                <div className="font-medium capitalize">{ing.name}</div>
                {ing.measure && <div className="text-xs text-muted-foreground">{ing.measure}</div>}
              </li>
            ))}
          </ul>
        </section>
        <section>
          <h3 className="mb-3 font-display text-xl">Instructions</h3>
          <div className="space-y-3 text-sm leading-relaxed text-foreground/90">
            {data.strInstructions
              .split(/\r?\n+/)
              .filter((p) => p.trim())
              .map((p, i) => (
                <p key={i}>
                  <span className="mr-2 font-display text-primary">{i + 1}.</span>
                  {p}
                </p>
              ))}
          </div>
        </section>
      </div>
    </article>
  );
}
