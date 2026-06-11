import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, ChefHat, ExternalLink, Flame, Loader2, Search, ShoppingCart, Sparkles, X, Youtube } from "lucide-react";
import { cn } from "@/lib/utils";
import { findRecipes, lookupMeal, amazonSearchUrl, instacartSearchUrl, type MealSummary } from "@/lib/mealdb";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// Units available in the portion picker (matches a typical kitchen unit menu)
const UNITS = [
  "g", "kg", "oz", "lb", "ml", "l", "cup", "tbsp", "tsp", "fl oz",
  "pcs", "slice", "bunch", "clove", "head", "can", "pack", "handful",
] as const;
type Unit = (typeof UNITS)[number];

type Portion = { qty: string; unit: Unit };

// Default unit per ingredient key — used when a chip/icon is first added
const DEFAULT_UNIT: Record<string, Unit> = {
  chicken: "lb", beef: "lb", pork: "lb", salmon: "fl oz", shrimp: "lb",
  eggs: "pcs", tofu: "pack", cheese: "oz", milk: "cup", butter: "tbsp",
  rice: "cup", pasta: "g", potatoes: "pcs", beans: "can", lentils: "cup", corn: "can",
  tomatoes: "pcs", onion: "pcs", garlic: "clove", mushrooms: "handful",
  spinach: "handful", broccoli: "head", carrots: "pcs", lemon: "pcs",
};
const unitFor = (key: string): Unit => DEFAULT_UNIT[key.toLowerCase()] ?? "pcs";

// "Popular now" — 10 seasonally-popular quick picks shown as chips at the top
const POPULAR_PICKS = [
  "Chicken breast", "Leftover pasta", "Eggs", "Tofu", "Ground beef",
  "Salmon fillet", "Avocado", "Sweet potato", "Greek yogurt", "Kimchi",
];

// Format a number as a friendly fraction string
function formatQty(n: number): string {
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

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Pantry — Find recipes from what you have" },
      { name: "description", content: "Pick a couple of ingredients, choose a meal, and get beautiful recipes with shoppable ingredient lists." },
    ],
  }),
  component: Pantry,
});

type Step = "pick" | "portions" | "meal" | "results";

type Ingredient = { key: string; label: string; emoji: string; category: string };

type IngredientCategory = { label: string; emoji: string; color: string };

const CATEGORIES: Record<string, IngredientCategory> = {
  proteins: { label: "Proteins", emoji: "🍖", color: "bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-800" },
  dairy: { label: "Dairy", emoji: "🥛", color: "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800" },
  carbs: { label: "Carbs & Grains", emoji: "🌾", color: "bg-yellow-50 dark:bg-yellow-950/30 border-yellow-200 dark:border-yellow-800" },
  veg: { label: "Vegetables", emoji: "🥬", color: "bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800" },
};

const INGREDIENTS: Ingredient[] = [
  // Proteins
  { key: "chicken", label: "Chicken", emoji: "🍗", category: "proteins" },
  { key: "beef", label: "Beef", emoji: "🥩", category: "proteins" },
  { key: "pork", label: "Pork", emoji: "🥓", category: "proteins" },
  { key: "salmon", label: "Salmon", emoji: "🐟", category: "proteins" },
  { key: "shrimp", label: "Shrimp", emoji: "🦐", category: "proteins" },
  { key: "eggs", label: "Eggs", emoji: "🥚", category: "proteins" },
  { key: "tofu", label: "Tofu", emoji: "🧊", category: "proteins" },
  // Dairy
  { key: "cheese", label: "Cheese", emoji: "🧀", category: "dairy" },
  { key: "milk", label: "Milk", emoji: "🥛", category: "dairy" },
  { key: "butter", label: "Butter", emoji: "🧈", category: "dairy" },
  // Carbs & Grains
  { key: "rice", label: "Rice", emoji: "🍚", category: "carbs" },
  { key: "pasta", label: "Pasta", emoji: "🍝", category: "carbs" },
  { key: "potatoes", label: "Potatoes", emoji: "🥔", category: "carbs" },
  { key: "beans", label: "Beans", emoji: "🫘", category: "carbs" },
  { key: "lentils", label: "Lentils", emoji: "🌰", category: "carbs" },
  { key: "corn", label: "Corn", emoji: "🌽", category: "carbs" },
  // Vegetables
  { key: "tomatoes", label: "Tomatoes", emoji: "🍅", category: "veg" },
  { key: "onion", label: "Onion", emoji: "🧅", category: "veg" },
  { key: "garlic", label: "Garlic", emoji: "🧄", category: "veg" },
  { key: "mushrooms", label: "Mushrooms", emoji: "🍄", category: "veg" },
  { key: "spinach", label: "Spinach", emoji: "🥬", category: "veg" },
  { key: "broccoli", label: "Broccoli", emoji: "🥦", category: "veg" },
  { key: "carrots", label: "Carrots", emoji: "🥕", category: "veg" },
  { key: "lemon", label: "Lemon", emoji: "🍋", category: "veg" },
];

type MealType = { key: string; label: string; emoji: string; category?: string };
const MEALS: MealType[] = [
  { key: "breakfast", label: "Breakfast", emoji: "🍳", category: "Breakfast" },
  { key: "lunch", label: "Lunch", emoji: "🥗" },
  { key: "dinner", label: "Dinner", emoji: "🍽️" },
  { key: "snack", label: "Snack", emoji: "🥨", category: "Starter" },
  { key: "special", label: "Special day", emoji: "🎉", category: "Dessert" },
];

function Pantry() {
  const [step, setStep] = useState<Step>("pick");
  const [selected, setSelected] = useState<string[]>([]);
  const [freeText, setFreeText] = useState("");
  const [portions, setPortions] = useState<Record<string, Portion>>({});
  const [meal, setMeal] = useState<MealType | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const finalIngredients = useMemo(() => {
    const extras = freeText
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    return [...new Set([...selected, ...extras])].slice(0, 6);
  }, [selected, freeText]);

  const toggle = (k: string) => {
    setSelected((prev) => {
      if (prev.includes(k)) return prev.filter((x) => x !== k);
      if (prev.length >= 2) return prev;
      return [...prev, k];
    });
  };

  const addFromChip = (label: string) => {
    const key = label.toLowerCase();
    setSelected((prev) => (prev.includes(key) || prev.length >= 2 ? prev : [...prev, key]));
  };

  const removeIngredient = (k: string) => {
    setSelected((prev) => prev.filter((x) => x !== k));
    setFreeText((t) =>
      t
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s && s.toLowerCase() !== k)
        .join(", "),
    );
    setPortions((p) => {
      const { [k]: _, ...rest } = p;
      return rest;
    });
  };

  const next = () => {
    if (step === "pick") {
      const init: Record<string, Portion> = {};
      finalIngredients.forEach((i) => (init[i] = portions[i] ?? { qty: "", unit: unitFor(i) }));
      setPortions(init);
      setStep("portions");
    } else if (step === "portions") setStep("meal");
    else if (step === "meal") setStep("results");
  };

  const back = () => {
    if (step === "portions") setStep("pick");
    else if (step === "meal") setStep("portions");
    else if (step === "results") setStep("meal");
  };

  const canNext =
    (step === "pick" && finalIngredients.length > 0) ||
    step === "portions" ||
    (step === "meal" && meal !== null);

  return (
    <div className="min-h-screen">
      <Header />
      <main className="mx-auto max-w-5xl px-5 pb-24 pt-8 md:pt-12">
        <Stepper step={step} />

        {step === "pick" && (
          <PickStep
            selected={selected}
            toggle={toggle}
            freeText={freeText}
            setFreeText={setFreeText}
          />
        )}
        {step === "portions" && (
          <PortionStep
            ingredients={finalIngredients}
            portions={portions}
            setPortions={setPortions}
          />
        )}
        {step === "meal" && <MealStep meal={meal} setMeal={setMeal} />}
        {step === "results" && (
          <ResultsStep
            ingredients={finalIngredients}
            meal={meal}
            onOpen={setOpenId}
          />
        )}

        {step !== "results" ? (
          <div className="mt-10 flex items-center justify-between">
            <button
              onClick={back}
              disabled={step === "pick"}
              className="inline-flex items-center gap-2 rounded-full px-5 py-3 text-sm font-medium text-muted-foreground transition disabled:opacity-30 hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" /> Back
            </button>
            <button
              onClick={next}
              disabled={!canNext}
              className="group inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-warm transition hover:translate-y-[-1px] hover:shadow-lift disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0"
            >
              {step === "meal" ? (
                <>
                  Find recipes <Sparkles className="h-4 w-4" />
                </>
              ) : (
                <>
                  Continue <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
                </>
              )}
            </button>
          </div>
        ) : (
          <div className="mt-10 flex justify-center">
            <button
              onClick={() => {
                setStep("pick");
                setSelected([]);
                setFreeText("");
                setPortions({});
                setMeal(null);
              }}
              className="rounded-full border border-border bg-card px-6 py-3 text-sm font-medium text-foreground hover:bg-secondary"
            >
              Start over
            </button>
          </div>
        )}
      </main>

      <Dialog open={!!openId} onOpenChange={(o) => !o && setOpenId(null)}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto rounded-3xl p-0">
          {openId && <RecipeDetail id={openId} portions={portions} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Header() {
  return (
    <header className="mx-auto flex max-w-5xl items-center justify-between px-5 pt-6">
      <div className="flex items-center gap-2.5">
        <div className="grid h-9 w-9 place-items-center rounded-2xl bg-[var(--gradient-warm)] text-primary-foreground shadow-warm">
          <ChefHat className="h-4.5 w-4.5" strokeWidth={2.4} />
        </div>
        <span className="font-display text-xl font-semibold tracking-tight">
          Pantry
        </span>
      </div>
      <span className="hidden text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground md:block">
        From your kitchen, to the table
      </span>
    </header>
  );
}

function Stepper({ step }: { step: Step }) {
  const steps: { k: Step; label: string }[] = [
    { k: "pick", label: "Ingredients" },
    { k: "portions", label: "Portions" },
    { k: "meal", label: "Meal" },
    { k: "results", label: "Recipes" },
  ];
  const idx = steps.findIndex((s) => s.k === step);
  return (
    <div className="mb-10 flex items-center gap-2 text-xs font-medium md:mb-14">
      {steps.map((s, i) => (
        <div key={s.k} className="flex items-center gap-2">
          <span
            className={cn(
              "grid h-7 w-7 place-items-center rounded-full border transition",
              i < idx && "border-accent bg-accent text-accent-foreground",
              i === idx && "border-primary bg-primary text-primary-foreground shadow-warm",
              i > idx && "border-border bg-card text-muted-foreground",
            )}
          >
            {i + 1}
          </span>
          <span className={cn(i === idx ? "text-foreground" : "text-muted-foreground")}>
            {s.label}
          </span>
          {i < steps.length - 1 && <span className="mx-1 h-px w-6 bg-border md:w-10" />}
        </div>
      ))}
    </div>
  );
}

function StepTitle({ kicker, title, sub }: { kicker: string; title: string; sub: string }) {
  return (
    <div className="mb-8 max-w-2xl">
      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-primary">{kicker}</p>
      <h1 className="font-display text-4xl font-medium leading-[1.05] md:text-5xl">{title}</h1>
      <p className="mt-3 text-base text-muted-foreground">{sub}</p>
    </div>
  );
}

function PickStep({
  selected,
  toggle,
  freeText,
  setFreeText,
}: {
  selected: string[];
  toggle: (k: string) => void;
  freeText: string;
  setFreeText: (s: string) => void;
}) {
  const grouped = useMemo(() => {
    const groups: Record<string, Ingredient[]> = {};
    for (const ing of INGREDIENTS) {
      (groups[ing.category] ??= []).push(ing);
    }
    return groups;
  }, []);

  return (
    <section>
      <StepTitle
        kicker="Step 1"
        title="What's in your pantry tonight?"
        sub="Type one or two ingredients, or tap up to two from the map below."
      />

      <div className="relative mb-8 max-w-xl">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={freeText}
          onChange={(e) => setFreeText(e.target.value)}
          placeholder="e.g. zucchini, basil"
          className="w-full rounded-full border border-border bg-card py-3.5 pl-11 pr-4 text-sm shadow-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
        />
      </div>

      <div className="space-y-6">
        {Object.entries(grouped).map(([catKey, items]) => {
          const cat = CATEGORIES[catKey];
          return (
            <div key={catKey}>
              <div className="mb-3 flex items-center gap-2">
                <span className="text-sm">{cat.emoji}</span>
                <span className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">
                  {cat.label}
                </span>
                <span className="h-px flex-1 bg-border" />
              </div>
              <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6">
                {items.map((ing) => {
                  const active = selected.includes(ing.key);
                  return (
                    <button
                      key={ing.key}
                      onClick={() => toggle(ing.key)}
                      disabled={!active && selected.length >= 2}
                      className={cn(
                        "group relative aspect-square rounded-2xl border p-3 text-center transition",
                        active
                          ? "border-primary bg-primary/5 shadow-warm"
                          : "border-border bg-card hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-warm disabled:opacity-40 disabled:hover:translate-y-0 disabled:hover:shadow-none",
                      )}
                    >
                      <div className="grid h-full place-items-center gap-1.5">
                        <span className="text-3xl transition group-hover:scale-110">{ing.emoji}</span>
                        <span className="text-xs font-medium text-foreground">{ing.label}</span>
                      </div>
                      {active && (
                        <span className="absolute -right-1.5 -top-1.5 grid h-6 w-6 place-items-center rounded-full bg-primary text-primary-foreground shadow-warm">
                          ✓
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <p className="mt-6 text-xs text-muted-foreground">
        {selected.length}/2 selected from map · we'll combine these with what you typed.
      </p>
    </section>
  );
}

function PortionStep({
  ingredients,
  portions,
  setPortions,
}: {
  ingredients: string[];
  portions: Record<string, number>;
  setPortions: (p: Record<string, number>) => void;
}) {
  return (
    <section>
      <StepTitle
        kicker="Step 2"
        title="How much of each?"
        sub="Slide to Small, Decent, or Plenty — we'll scale every measurement in the recipe to match."
      />
      <div className="space-y-4">
        {ingredients.map((ing) => {
          const mult = portions[ing] ?? 1;
          const tier = tierFromMult(mult);
          const current = PORTION_TIERS[tier];
          return (
            <div
              key={ing}
              className="rounded-2xl border border-border bg-card p-5 shadow-sm"
            >
              <div className="mb-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">
                    {INGREDIENTS.find((i) => i.key === ing)?.emoji ?? "🥗"}
                  </span>
                  <span className="font-medium capitalize">{ing}</span>
                </div>
                <div className="text-right">
                  <div className="font-display text-lg leading-tight text-primary">{current.label}</div>
                  <div className="text-xs text-muted-foreground">{current.hint}</div>
                </div>
              </div>
              <Slider
                min={0}
                max={2}
                step={1}
                value={[tier]}
                onValueChange={(v) =>
                  setPortions({ ...portions, [ing]: PORTION_TIERS[v[0]].mult })
                }
              />
              <div className="mt-2 flex justify-between text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                {PORTION_TIERS.map((t, i) => (
                  <span key={t.key} className={cn(i === tier && "text-foreground")}>
                    {t.label}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}


function MealStep({ meal, setMeal }: { meal: MealType | null; setMeal: (m: MealType) => void }) {
  return (
    <section>
      <StepTitle
        kicker="Step 3"
        title="What kind of meal?"
        sub="Pick the moment — we'll match the mood."
      />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {MEALS.map((m) => {
          const active = meal?.key === m.key;
          return (
            <button
              key={m.key}
              onClick={() => setMeal(m)}
              className={cn(
                "group rounded-3xl border bg-card p-5 text-left transition",
                active
                  ? "border-primary bg-primary/5 shadow-warm"
                  : "border-border hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-warm",
              )}
            >
              <div className="text-4xl">{m.emoji}</div>
              <div className="mt-3 font-display text-lg">{m.label}</div>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function ResultsStep({
  ingredients,
  meal,
  onOpen,
}: {
  ingredients: string[];
  meal: MealType | null;
  onOpen: (id: string) => void;
}) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["recipes", ingredients, meal?.category],
    queryFn: () => findRecipes({ ingredients, category: meal?.category }),
  });

  return (
    <section>
      <StepTitle
        kicker="Step 4"
        title={
          isLoading ? "Searching the kitchen…" : `${data?.length ?? 0} recipes for you`
        }
        sub={`Using ${ingredients.join(", ")}${meal ? ` · ${meal.label}` : ""}.`}
      />

      {isLoading && (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 md:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="aspect-[4/5] animate-pulse rounded-3xl bg-muted" />
          ))}
        </div>
      )}

      {error && (
        <p className="rounded-2xl bg-destructive/10 p-4 text-sm text-destructive">
          Couldn't reach the recipe service. Try again in a moment.
        </p>
      )}

      {data && data.length === 0 && !isLoading && (
        <div className="rounded-3xl border border-dashed border-border bg-card p-10 text-center">
          <div className="text-4xl">🍽️</div>
          <p className="mt-3 font-display text-xl">No matches with that combo.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Try fewer ingredients, or switch to a different meal.
          </p>
        </div>
      )}

      {data && data.length > 0 && (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 md:grid-cols-3">
          {data.map((m) => (
            <RecipeCard key={m.idMeal} meal={m} onOpen={() => onOpen(m.idMeal)} />
          ))}
        </div>
      )}
    </section>
  );
}

function RecipeCard({ meal, onOpen }: { meal: MealSummary; onOpen: () => void }) {
  return (
    <button
      onClick={onOpen}
      className="group overflow-hidden rounded-3xl border border-border bg-card text-left shadow-sm transition hover:-translate-y-1 hover:shadow-lift"
    >
      <div className="relative aspect-[4/5] overflow-hidden bg-muted">
        <img
          src={meal.strMealThumb}
          alt={meal.strMeal}
          loading="lazy"
          className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
        />
        <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/70 to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 p-5">
          <h3 className="font-display text-xl font-medium leading-tight text-white">
            {meal.strMeal}
          </h3>
        </div>
      </div>
    </button>
  );
}

function RecipeDetail({
  id,
  portions,
}: {
  id: string;
  portions: Record<string, number>;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ["meal", id],
    queryFn: () => lookupMeal(id),
  });

  if (isLoading) {
    return (
      <div className="grid h-80 place-items-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }
  if (!data) return null;

  // Per-ingredient multiplier: match recipe ingredient name to a user-chosen
  // ingredient; fall back to the average of all chosen multipliers.
  const chosenMults = Object.values(portions);
  const avg =
    chosenMults.length > 0
      ? chosenMults.reduce((a, b) => a + b, 0) / chosenMults.length
      : 1;

  const multFor = (ingredientName: string) => {
    const n = ingredientName.toLowerCase();
    for (const [key, m] of Object.entries(portions)) {
      if (n.includes(key) || key.includes(n)) return m;
    }
    return avg;
  };

  // Parse leading quantity (supports "1 1/2", "1/2", "1.5", "2-3") and scale it.
  const scaleMeasure = (measure: string, mult: number) => {
    if (mult === 1) return measure;
    const re = /^\s*(\d+(?:\.\d+)?)(?:\s+(\d+)\/(\d+))?(?:\s*\/\s*(\d+))?(?:\s*-\s*(\d+(?:\.\d+)?))?\s*(.*)$/;
    const m = measure.match(re);
    if (!m) return measure;
    const [, aStr, mixNum, mixDen, denOnly, rangeHi, rest] = m;
    let val: number;
    if (mixNum && mixDen) val = parseFloat(aStr) + parseInt(mixNum) / parseInt(mixDen);
    else if (denOnly) val = parseFloat(aStr) / parseInt(denOnly);
    else val = parseFloat(aStr);
    if (!isFinite(val)) return measure;
    const scaled = val * mult;
    if (rangeHi) {
      const hi = parseFloat(rangeHi) * mult;
      return `${formatQty(scaled)}-${formatQty(hi)} ${rest}`.trim();
    }
    return `${formatQty(scaled)} ${rest}`.trim();
  };


  return (
    <article>
      <div className="relative aspect-[16/9] overflow-hidden rounded-t-3xl bg-muted">
        <img src={data.strMealThumb} alt={data.strMeal} className="h-full w-full object-cover" />
        <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 p-6">
          <div className="mb-2 flex flex-wrap gap-2 text-xs font-medium uppercase tracking-wider text-white/80">
            <span className="rounded-full bg-white/15 px-3 py-1 backdrop-blur">{data.strCategory}</span>
            <span className="rounded-full bg-white/15 px-3 py-1 backdrop-blur">{data.strArea}</span>
          </div>
          <h2 className="font-display text-3xl font-medium text-white md:text-4xl">{data.strMeal}</h2>
        </div>
      </div>

      <div className="grid gap-8 p-6 md:grid-cols-[1fr_1.4fr] md:p-8">
        <section>
          <h3 className="mb-1 font-display text-xl">Ingredients</h3>
          <p className="mb-4 text-xs text-muted-foreground">
            {avg !== 1 ? `Scaled ${avg.toFixed(2)}× from your portions` : "Scroll to shop what's missing"}
          </p>
          <ul className="space-y-2">
            {data.ingredients.map((ing, i) => (
              <li
                key={i}
                className="flex items-start justify-between gap-3 rounded-xl border border-border bg-card px-3 py-2.5"
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium capitalize">{ing.name}</div>
                  {ing.measure && (
                    <div className="text-xs text-muted-foreground">{scaleMeasure(ing.measure, multFor(ing.name))}</div>
                  )}
                </div>
                <div className="flex shrink-0 gap-1">
                  <a
                    href={amazonSearchUrl(ing.name)}
                    target="_blank"
                    rel="noreferrer"
                    title="Buy on Amazon"
                    className="rounded-lg bg-secondary px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-secondary-foreground transition hover:bg-primary hover:text-primary-foreground"
                  >
                    Amazon
                  </a>
                  <a
                    href={instacartSearchUrl(ing.name)}
                    target="_blank"
                    rel="noreferrer"
                    title="Buy on Instacart"
                    className="rounded-lg bg-secondary px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-secondary-foreground transition hover:bg-accent hover:text-accent-foreground"
                  >
                    Instacart
                  </a>
                </div>
              </li>
            ))}
          </ul>

          <div className="mt-4 flex items-center gap-2 rounded-xl bg-accent/10 p-3 text-xs text-accent">
            <ShoppingCart className="h-4 w-4" />
            <span>Tap Amazon or Instacart to shop any ingredient.</span>
          </div>
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

          <div className="mt-5 flex flex-wrap gap-2">
            {data.strYoutube && (
              <a
                href={data.strYoutube}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-full bg-foreground px-4 py-2 text-xs font-semibold text-background hover:opacity-90"
              >
                <Youtube className="h-4 w-4" /> Watch video
              </a>
            )}
            {data.strSource && (
              <a
                href={data.strSource}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-xs font-semibold text-foreground hover:bg-secondary"
              >
                <ExternalLink className="h-4 w-4" /> Source
              </a>
            )}
          </div>
        </section>
      </div>
    </article>
  );
}
