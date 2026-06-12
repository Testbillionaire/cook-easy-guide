import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, ChefHat, Check, ExternalLink, Keyboard, Layers, Loader2, Search, ShoppingCart, Sparkles, X, Youtube } from "lucide-react";
import { cn } from "@/lib/utils";
import { findRecipes, lookupMeal, amazonSearchUrl, instacartSearchUrl, type MealSummary } from "@/lib/mealdb";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  INGREDIENTS,
  INGREDIENT_BY_KEY,
  searchIngredients,
  getParentGroups,
  getItemsByParent,
  type Ingredient,
  type ParentKey,
} from "@/lib/ingredients";
import { LEFTOVER_CATEGORIES, LEFTOVER_BY_KEY, type LeftoverCategoryKey } from "@/lib/leftovers";

// Units available in the portion picker
const UNITS = [
  "g", "kg", "oz", "lb", "ml", "l", "cup", "tbsp", "tsp", "fl oz",
  "pcs", "slice", "bunch", "clove", "head", "can", "pack", "handful",
] as const;
type Unit = (typeof UNITS)[number];

type Portion = { qty: string; unit: Unit };
type Mode = "type" | "pick" | "leftover";

const unitFor = (key: string): Unit => (INGREDIENT_BY_KEY[key]?.defaultUnit as Unit) ?? "pcs";

// Open an external URL. Works on the published site (plain new tab) and also
// inside Lovable's sandboxed preview iframe, which blocks <a target="_blank">.
function openExternal(e: React.MouseEvent, url: string) {
  // Let modifier-click / middle-click use the browser default.
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button === 1) return;
  try {
    const inIframe = typeof window !== "undefined" && window.top !== window.self;
    if (!inIframe) return; // default anchor behavior is fine
    e.preventDefault();
    const w = window.open(url, "_blank", "noopener,noreferrer");
    if (!w) {
      // Popup blocked — fall back to navigating the top frame.
      try {
        if (window.top) window.top.location.href = url;
        else window.location.href = url;
      } catch {
        window.location.href = url;
      }
    }
  } catch {
    // Cross-origin access to window.top throws in some embeds — let the link fire.
  }
}

const labelFor = (key: string): string =>
  INGREDIENT_BY_KEY[key]?.label ?? LEFTOVER_BY_KEY[key]?.label ?? key;
const emojiFor = (key: string): string =>
  INGREDIENT_BY_KEY[key]?.emoji ?? LEFTOVER_BY_KEY[key]?.emoji ?? "";

const POPULAR_PICKS = [
  "Chicken breast", "Spaghetti", "Large eggs", "Tofu (firm)", "Ground beef",
  "Salmon fillet", "Avocado", "Sweet potato", "Greek yogurt", "Kimchi",
];

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

type Step = "intro" | "pick" | "portions" | "meal" | "results";

type MealType = { key: string; label: string; emoji: string; category?: string };
const MEALS: MealType[] = [
  { key: "all", label: "All Type", emoji: "🍽️" },
  { key: "quick10", label: "10-min recipe", emoji: "⏱️" },
  { key: "quick30", label: "30-min recipe", emoji: "⏲️" },
  { key: "breakfast", label: "Breakfast", emoji: "🍳", category: "Breakfast" },
  { key: "lunch", label: "Lunch", emoji: "🥗" },
  { key: "dinner", label: "Dinner", emoji: "🍽️" },
  { key: "snack", label: "Snack", emoji: "🥨" },
  { key: "special", label: "Special day", emoji: "🎉", category: "Dessert" },
];

function Pantry() {
  const [step, setStep] = useState<Step>("pick");
  const [mode, setMode] = useState<Mode>("type");
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
    const hit = INGREDIENTS.find((i) => i.label.toLowerCase() === label.toLowerCase());
    const key = hit?.key ?? label.toLowerCase();
    setSelected((prev) => {
      if (prev.includes(key)) return prev.filter((x) => x !== key);
      if (prev.length >= 2) return prev;
      return [...prev, key];
    });
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
    if (step === "intro") setStep("pick");
    else if (step === "pick") {
      const init: Record<string, Portion> = {};
      finalIngredients.forEach((i) => (init[i] = portions[i] ?? { qty: "1", unit: unitFor(i) }));
      setPortions(init);
      setStep("portions");
    } else if (step === "portions") setStep("meal");
    else if (step === "meal") setStep("results");
  };

  const back = () => {
    if (step === "pick") {
      if (mode === "pick") setMode("type");
    } else if (step === "portions") setStep("pick");
    else if (step === "meal") setStep("portions");
    else if (step === "results") setStep("meal");
  };

  const canNext =
    (step === "intro") ||
    (step === "pick" && finalIngredients.length > 0) ||
    step === "portions" ||
    (step === "meal" && meal !== null);

  const goToStep = (target: Step) => {
    const order: Step[] = ["intro", "pick", "portions", "meal", "results"];
    const currentIdx = order.indexOf(step);
    const targetIdx = order.indexOf(target);
    if (targetIdx < currentIdx) setStep(target);
  };

  return (
    <div className="min-h-screen">
      <Header />
      <main className="mx-auto max-w-5xl px-5 pb-24 pt-8 md:pt-12">
        {step !== "intro" && !(step === "pick" && mode === "type") && <Stepper step={step} onStepClick={goToStep} />}

        {step === "intro" && (
          <IntroStep
            onPick={(m) => {
              setMode(m);
              setStep("pick");
            }}
          />
        )}

        {step === "pick" && mode === "type" && (
          <TypeStep
            selected={selected}
            toggle={toggle}
            freeText={freeText}
            setFreeText={setFreeText}
            addFromChip={addFromChip}
            onExplore={() => setMode("pick")}
            onLeftover={() => setMode("leftover")}
            onNext={next}
            canNext={finalIngredients.length > 0}
          />
        )}
        {step === "pick" && mode === "pick" && (
          <PickMapStep selected={selected} toggle={toggle} onBackToType={() => setMode("type")} />
        )}
        {step === "pick" && mode === "leftover" && (
          <LeftoverPickStep selected={selected} toggle={toggle} onBackToType={() => setMode("type")} />
        )}

        {step === "portions" && (
          <PortionStep
            ingredients={finalIngredients}
            portions={portions}
            setPortions={setPortions}
            onRemove={removeIngredient}
          />
        )}
        {step === "meal" && <MealStep meal={meal} setMeal={setMeal} />}
        {step === "results" && (
          <ResultsStep
            ingredients={finalIngredients}
            meal={meal}
            onOpen={setOpenId}
            onBack={back}
          />
        )}

        {step === "intro" || (step === "pick" && mode === "type") ? null : step !== "results" ? (
          <div className="mt-10 flex items-center justify-between">
            <button
              onClick={back}
              className="inline-flex items-center gap-2 rounded-full px-5 py-3 text-sm font-medium text-muted-foreground transition hover:text-foreground"
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
          <div className="mt-10 flex items-center justify-between">
            <button
              onClick={back}
              className="inline-flex items-center gap-2 rounded-full px-5 py-3 text-sm font-medium text-muted-foreground transition hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" /> Back
            </button>
            <button
              onClick={() => {
                setStep("pick");
                setMode("type");
                setSelected([]);
                setFreeText("");
                setPortions({});
                setMeal(null);
              }}
              className="group inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-warm transition hover:translate-y-[-1px] hover:shadow-lift"
            >
              <Sparkles className="h-4 w-4" /> Start over
            </button>
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

function Stepper({ step, onStepClick }: { step: Step; onStepClick?: (step: Step) => void }) {
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
          <button
            onClick={() => onStepClick?.(s.k)}
            disabled={!onStepClick || i >= idx}
            className={cn(
              "grid h-7 w-7 place-items-center rounded-full border transition",
              i < idx && "border-accent bg-accent text-accent-foreground cursor-pointer hover:bg-primary/10",
              i === idx && "border-primary bg-primary text-primary-foreground shadow-warm",
              i > idx && "border-border bg-card text-muted-foreground",
            )}
          >
            {i + 1}
          </button>
          <button
            onClick={() => onStepClick?.(s.k)}
            disabled={!onStepClick || i >= idx}
            className={cn(
              "transition",
              i === idx ? "text-foreground" : "text-muted-foreground",
              i < idx && onStepClick && "cursor-pointer hover:text-foreground",
            )}
          >
            {s.label}
          </button>
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

// ============ INTRO ============
function IntroStep({ onPick }: { onPick: (m: Mode) => void }) {
  const Card = ({
    mode, icon, title, sub,
  }: { mode: Mode; icon: React.ReactNode; title: string; sub: string }) => (
    <button
      onClick={() => onPick(mode)}
      className="group flex flex-col items-start gap-4 rounded-3xl border border-border bg-card p-7 text-left shadow-sm transition hover:-translate-y-1 hover:border-primary/40 hover:shadow-lift md:p-9"
    >
      <div className="grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary">
        {icon}
      </div>
      <div className="flex-1">
        <div className="font-display text-2xl font-medium md:text-3xl">{title}</div>
        <p className="mt-2 text-sm text-muted-foreground">{sub}</p>
      </div>
      <span className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-primary">
        Continue <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
      </span>
    </button>
  );

  return (
    <section>
      <StepTitle
        kicker="Get started"
        title="What to cook with?"
        sub="Choose how you'd like to tell us what's in your kitchen."
      />
      <div className="grid gap-4 md:grid-cols-2 md:gap-6">
        <Card
          mode="type"
          icon={<Keyboard className="h-6 w-6" />}
          title="Type what I have"
          sub="Search 700+ ingredients and add them to your list."
        />
        <Card
          mode="pick"
          icon={<Layers className="h-6 w-6" />}
          title="Pick what I want"
          sub="Browse the ingredient map — start with a category, then pick a cut or item."
        />
      </div>
    </section>
  );
}

// ============ TYPE FLOW ============
function TypeStep({
  selected,
  toggle,
  freeText,
  setFreeText,
  addFromChip,
  onExplore,
  onLeftover,
  onNext,
  canNext,
}: {
  selected: string[];
  toggle: (k: string) => void;
  freeText: string;
  setFreeText: (s: string) => void;
  addFromChip: (label: string) => void;
  onExplore: () => void;
  onLeftover: () => void;
  onNext: () => void;
  canNext: boolean;
}) {
  const atLimit = selected.length >= 2;
  const [draft, setDraft] = useState("");

  const committed = useMemo(
    () => freeText.split(",").map((s) => s.trim()).filter(Boolean),
    [freeText],
  );

  const searchResults = useMemo(
    () => (draft.trim() ? searchIngredients(draft, 30) : []),
    [draft],
  );

  const handleAdd = () => {
    const trimmed = draft.trim();
    if (!trimmed) {
      if (canNext) onNext();
      return;
    }
    const hit = INGREDIENTS.find(
      (i) => i.label.toLowerCase() === trimmed.toLowerCase(),
    );
    if (hit) {
      if (!selected.includes(hit.key) && selected.length < 2) toggle(hit.key);
      setDraft("");
      return;
    }
    const exists = committed.some((c) => c.toLowerCase() === trimmed.toLowerCase());
    if (exists) { setDraft(""); return; }
    setFreeText(committed.length > 0 ? `${freeText}, ${trimmed}` : trimmed);
    setDraft("");
  };

  const removeCommitted = (label: string) => {
    setFreeText(
      committed.filter((c) => c.toLowerCase() !== label.toLowerCase()).join(", "),
    );
  };

  const Chip = ({ ing }: { ing: Ingredient }) => {
    const active = selected.includes(ing.key);
    return (
      <button
        onClick={() => toggle(ing.key)}
        disabled={!active && atLimit}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition",
          active
            ? "border-primary bg-primary/10 text-primary"
            : "border-input bg-background text-foreground hover:-translate-y-0.5 hover:bg-accent hover:text-accent-foreground disabled:opacity-40 disabled:hover:translate-y-0",
        )}
      >
        <span className="text-sm leading-none">{ing.emoji}</span>
        <span>{ing.label}</span>
        {active && <Check className="h-3 w-3" />}
      </button>
    );
  };

  const arrowEnabled = !!draft.trim() || canNext;

  return (
    <section className="flex min-h-[calc(100vh-12rem)] flex-col items-center justify-center text-center">
      <h1 className="mb-8 font-display text-4xl font-medium leading-tight md:text-5xl">
        What 2 Cook with?
      </h1>

      <div className="mb-5 flex w-full max-w-xl items-center gap-3">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleAdd();
              }
            }}
            placeholder="Search chicken, parmesan, miso…"
            className="w-full rounded-full border border-border bg-card py-3.5 pl-11 pr-4 text-sm shadow-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </div>
        <button
          onClick={handleAdd}
          disabled={!arrowEnabled}
          className="inline-flex items-center justify-center rounded-full bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-warm transition hover:translate-y-[-1px] hover:shadow-lift disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0"
        >
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>

      {searchResults.length > 0 && (
        <div className="mb-5 w-full max-w-xl rounded-2xl border border-border bg-card p-3 text-left shadow-sm">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
            {searchResults.length} match{searchResults.length === 1 ? "" : "es"}
          </p>
          <div className="flex flex-wrap gap-2">
            {searchResults.map((ing) => <Chip key={ing.key} ing={ing} />)}
          </div>
        </div>
      )}


      {committed.length > 0 && (
        <div className="mb-5 flex w-full max-w-xl flex-wrap justify-center gap-2">
          {committed.map((label) => (
            <span
              key={label}
              className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/5 px-3 py-1.5 text-sm font-medium text-primary"
            >
              {label}
              <button
                onClick={() => removeCommitted(label)}
                className="grid h-4 w-4 place-items-center rounded-full hover:bg-primary/10"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="flex w-full max-w-xl flex-wrap justify-center gap-2">
        {POPULAR_PICKS.map((label) => {
          const active = selected.some(
            (k) => INGREDIENT_BY_KEY[k]?.label.toLowerCase() === label.toLowerCase() || k === label.toLowerCase(),
          );
          return (
            <button
              key={label}
              onClick={() => addFromChip(label)}
              disabled={!active && atLimit}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-4 py-2 text-sm font-medium transition",
                active
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-input bg-background text-foreground hover:-translate-y-0.5 hover:bg-accent hover:text-accent-foreground disabled:opacity-40 disabled:hover:translate-y-0",
              )}
            >
              {label}
              {active && <Check className="h-3.5 w-3.5" />}
            </button>
          );
        })}
      </div>

      <div className="mt-8 flex w-full max-w-xl items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          {selected.length}/2 selected
        </p>
        <div className="flex items-center gap-2">
          <button
            onClick={onExplore}
            className="inline-flex items-center gap-2 rounded-full border border-input bg-background px-4 py-2 text-xs font-semibold text-foreground transition hover:bg-accent hover:text-accent-foreground"
          >
            <Layers className="h-3.5 w-3.5" /> Explore new ingredient
          </button>
          <button
            onClick={onLeftover}
            className="inline-flex items-center gap-2 rounded-full border border-input bg-background px-4 py-2 text-xs font-semibold text-foreground transition hover:bg-accent hover:text-accent-foreground"
          >
            <Sparkles className="h-3.5 w-3.5" /> Leftover dish
          </button>
        </div>
      </div>
    </section>
  );
}


// ============ 2-LAYER PICK MAP ============
function PickMapStep({
  selected,
  toggle,
  onBackToType,
}: {
  selected: string[];
  toggle: (k: string) => void;
  onBackToType: () => void;
}) {
  const atLimit = selected.length >= 2;
  const [activeParent, setActiveParent] = useState<ParentKey | null>(null);
  const groups = useMemo(() => getParentGroups(), []);

  if (!activeParent) {
    return (
      <section>
        <button
          onClick={onBackToType}
          className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back to type
        </button>
        <StepTitle
          kicker="Step 1"
          title="Pick what I want"
          sub="Start with a category, then pick a specific item. Choose up to two."
        />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {groups.map((g) => {
            const items = getItemsByParent(g.key);
            const selectedHere = items.filter((i) => selected.includes(i.key)).length;
            return (
              <button
                key={g.key}
                onClick={() => setActiveParent(g.key)}
                className="group relative flex flex-col items-start gap-2 rounded-2xl border border-border bg-card p-4 text-left transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-warm"
              >
                <div className="text-3xl">{g.emoji}</div>
                <div className="font-display text-base leading-tight">{g.label}</div>
                <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  {g.count} items
                </div>
                {selectedHere > 0 && (
                  <span className="absolute right-3 top-3 grid h-6 min-w-6 place-items-center rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground">
                    {selectedHere}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <p className="mt-6 text-xs text-muted-foreground">
          {selected.length}/2 selected
        </p>
      </section>
    );
  }

  const group = groups.find((g) => g.key === activeParent)!;
  const items = getItemsByParent(activeParent);

  return (
    <section>
      <button
        onClick={() => setActiveParent(null)}
        className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> All categories
      </button>
      <StepTitle
        kicker={`Step 1 · ${group.emoji} ${group.label}`}
        title="Pick an item"
        sub={`${items.length} items in this category. Tap to add or remove.`}
      />
      <div className="flex flex-wrap gap-2">
        {items.map((ing) => {
          const active = selected.includes(ing.key);
          return (
            <button
              key={ing.key}
              onClick={() => toggle(ing.key)}
              disabled={!active && atLimit}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-2 text-sm font-medium transition",
                active
                  ? "border-primary bg-primary text-primary-foreground shadow-warm"
                  : "border-border bg-card text-foreground hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-warm disabled:opacity-40 disabled:hover:translate-y-0 disabled:hover:shadow-none",
              )}
            >
              <span className="text-base leading-none">{ing.emoji}</span>
              <span>{ing.label}</span>
              {active && <Check className="ml-1 h-3.5 w-3.5" />}
            </button>
          );
        })}
      </div>
      <p className="mt-6 text-xs text-muted-foreground">
        {selected.length}/2 selected
      </p>
    </section>
  );
}

function PortionRow({
  ing,
  portion,
  setPortion,
  onRemove,
}: {
  ing: string;
  portion: Portion;
  setPortion: (p: Portion) => void;
  onRemove: () => void;
}) {
  const [showUnits, setShowUnits] = useState(false);
  const level = Math.max(1, Math.min(3, parseInt(portion.qty) || 1));

  return (
    <div className="rounded-2xl border border-border bg-card px-4 py-3 shadow-sm">
      <div className="flex items-center gap-3">
        <span className="h-2 w-2 shrink-0 rounded-full bg-accent" />
        <span className="flex-1 truncate text-sm font-medium">
          {emojiFor(ing)} {labelFor(ing)}
        </span>

        <div className="flex items-center gap-1.5" role="radiogroup" aria-label="Portion size">
          {[1, 2, 3].map((n) => {
            const filled = n <= level;
            return (
              <button
                key={n}
                role="radio"
                aria-checked={n === level}
                aria-label={`Portion ${n}`}
                onClick={() => setPortion({ ...portion, qty: String(n) })}
                className={cn(
                  "h-3 w-3 rounded-full border transition",
                  filled
                    ? "border-primary bg-primary"
                    : "border-input bg-background hover:border-primary/50",
                )}
              />
            );
          })}
        </div>

        <button
          onClick={() => setShowUnits((s) => !s)}
          aria-label="Toggle units"
          className={cn(
            "inline-flex h-8 items-center gap-1 rounded-md border px-2 text-[10px] font-semibold uppercase tracking-wide transition",
            showUnits
              ? "border-primary bg-primary/10 text-primary"
              : "border-input bg-background text-muted-foreground hover:text-foreground",
          )}
        >
          Unit
        </button>

        <button
          onClick={onRemove}
          aria-label={`Remove ${ing}`}
          className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-border text-muted-foreground transition hover:border-destructive hover:text-destructive"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {showUnits && (
        <div className="mt-3 flex items-center justify-end gap-2 border-t border-border pt-3">
          <span className="mr-auto text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Custom amount
          </span>
          <input
            type="number"
            inputMode="decimal"
            min={0}
            step="any"
            value={portion.qty}
            onChange={(e) => setPortion({ ...portion, qty: e.target.value })}
            className="h-9 w-20 rounded-md border border-input bg-background px-2 text-sm text-right shadow-sm outline-none transition focus:border-primary focus:ring-1 focus:ring-primary/30"
          />
          <Select
            value={portion.unit}
            onValueChange={(v) => setPortion({ ...portion, unit: v as Unit })}
          >
            <SelectTrigger className="h-9 w-[88px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="max-h-72">
              {UNITS.map((u) => (
                <SelectItem key={u} value={u}>
                  {u}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
}

function PortionStep({
  ingredients,
  portions,
  setPortions,
  onRemove,
}: {
  ingredients: string[];
  portions: Record<string, Portion>;
  setPortions: React.Dispatch<React.SetStateAction<Record<string, Portion>>>;
  onRemove: (k: string) => void;
}) {
  return (
    <section>
      <StepTitle
        kicker="Step 2"
        title="How much of each?"
        sub="Tap the dots for a quick portion (1 = small, 3 = large), or open Unit for an exact amount."
      />
      <div className="space-y-3">
        {ingredients.map((ing) => {
          const p = portions[ing] ?? { qty: "1", unit: unitFor(ing) };
          return (
            <PortionRow
              key={ing}
              ing={ing}
              portion={p}
              setPortion={(np) => setPortions((prev) => ({ ...prev, [ing]: np }))}
              onRemove={() => onRemove(ing)}
            />
          );
        })}
        {ingredients.length === 0 && (
          <p className="rounded-2xl border border-dashed border-border bg-card p-6 text-center text-sm text-muted-foreground">
            No ingredients yet — go back and pick a couple.
          </p>
        )}
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
      {meal && (
        <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-1.5 text-sm font-medium text-primary">
          <span>{meal.emoji}</span>
          <span>Current: {meal.label}</span>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
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
  onBack,
}: {
  ingredients: string[];
  meal: MealType | null;
  onOpen: (id: string) => void;
  onBack?: () => void;
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
  portions: Record<string, Portion>;
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

  const multOf = (p: Portion) => {
    const n = parseFloat(p.qty);
    return isFinite(n) && n > 0 ? n : 1;
  };
  const chosenMults = Object.values(portions).map(multOf);
  const avg =
    chosenMults.length > 0
      ? chosenMults.reduce((a, b) => a + b, 0) / chosenMults.length
      : 1;

  const multFor = (ingredientName: string) => {
    const n = ingredientName.toLowerCase();
    for (const [key, p] of Object.entries(portions)) {
      if (n.includes(key) || key.includes(n)) return multOf(p);
    }
    return avg;
  };

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

// ============ LEFTOVER 2-LAYER PICK ============
function LeftoverPickStep({
  selected,
  toggle,
  onBackToType,
}: {
  selected: string[];
  toggle: (k: string) => void;
  onBackToType: () => void;
}) {
  const atLimit = selected.length >= 2;
  const [activeCat, setActiveCat] = useState<LeftoverCategoryKey | null>(null);
  const cats = LEFTOVER_CATEGORIES;

  if (!activeCat) {
    return (
      <section>
        <button
          onClick={onBackToType}
          className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back to type
        </button>
        <StepTitle
          kicker="Leftover dish"
          title="What did you cook before?"
          sub="Pick a category of leftover, then choose the specific item to transform."
        />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-3">
          {cats.map((c) => {
            const selectedHere = c.items.filter((i) => selected.includes(i.key)).length;
            return (
              <button
                key={c.key}
                onClick={() => setActiveCat(c.key)}
                className="group relative flex flex-col items-start gap-2 rounded-2xl border border-border bg-card p-4 text-left transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-warm"
              >
                <div className="text-3xl">{c.emoji}</div>
                <div className="font-display text-base leading-tight">{c.label}</div>
                <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  {c.items.length} items
                </div>
                {selectedHere > 0 && (
                  <span className="absolute right-3 top-3 grid h-6 min-w-6 place-items-center rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground">
                    {selectedHere}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </section>
    );
  }

  const cat = cats.find((c) => c.key === activeCat)!;
  return (
    <section>
      <button
        onClick={() => setActiveCat(null)}
        className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> All leftover categories
      </button>
      <StepTitle
        kicker={`Leftover · ${cat.label}`}
        title={`Pick a ${cat.label.toLowerCase()} leftover`}
        sub="Choose up to two items to transform into something new."
      />
      <div className="flex flex-wrap gap-2">
        {cat.items.map((i) => {
          const active = selected.includes(i.key);
          return (
            <button
              key={i.key}
              onClick={() => toggle(i.key)}
              disabled={!active && atLimit}
              className={cn(
                "inline-flex max-w-full items-center gap-2 rounded-2xl border px-3 py-2 text-left text-sm font-medium transition",
                active
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-input bg-background text-foreground hover:-translate-y-0.5 hover:bg-accent hover:text-accent-foreground disabled:opacity-40 disabled:hover:translate-y-0",
              )}
            >
              <span className="text-lg leading-none">{i.emoji}</span>
              <span className="flex flex-col">
                <span className="leading-tight">{i.label}</span>
                <span className="text-[10px] font-normal uppercase tracking-wider text-muted-foreground">
                  → {i.dishes.slice(0, 2).join(" · ")}
                </span>
              </span>
              {active && <Check className="ml-1 h-3.5 w-3.5" />}
            </button>
          );
        })}
      </div>
    </section>
  );
}
