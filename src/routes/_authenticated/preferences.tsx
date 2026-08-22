import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Check, ChevronDown, Minus, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatQty } from "@/lib/mealdb";
import { recordDietRequest } from "@/lib/profile.functions";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/preferences")({
  head: () => ({ meta: [{ title: "Portion profile — What 2 Cook" }] }),
  component: PreferencesPage,
});

// ============================================================
// UI-ONLY BUILD. Nothing here reads or writes Supabase yet — every field is
// local component state. Reference: personalized/portion-profile.html (logic
// carried over, visuals rebuilt from this app's own design system). Backend
// wiring lands after visual sign-off, scoped to the "easy" tier only:
// portion/household, favorite cuisines, pantry-first, meal-prep default,
// disliked ingredients. Everything else (diet/spice/equipment/skill/units/
// goals) stays visible and interactive but is NOT a persisted or safety
// claim yet — see the disclaimer on the dietary card below.
// ============================================================

const PORTION_LEVELS = [
  { level: 1, mult: 0.85, label: "Light" },
  { level: 2, mult: 1, label: "Regular" },
  { level: 3, mult: 1.2, label: "Hearty" },
] as const;

// Only these two map to real MealDB categories, so they're the only ones we
// can actually filter on today.
const DIET_SUPPORTED = ["Vegetarian", "Vegan"] as const;

// Listed so people can tell us what they need, but not filterable yet —
// selecting one records demand rather than changing results.
const DIET_PLANNED = [
  "Gluten-free",
  "Dairy-free",
  "Nut allergy",
  "Shellfish allergy",
  "Halal",
  "Kosher",
  "Keto",
  "Low-FODMAP",
  "Low-sodium",
  "Diabetic-friendly",
] as const;

const DIET_OPTIONS = [...DIET_SUPPORTED, ...DIET_PLANNED] as const;

const CUISINE_OPTIONS = [
  "Italian",
  "Mexican",
  "Thai",
  "Japanese",
  "Indian",
  "Mediterranean",
  "French",
  "Korean",
] as const;

const EQUIPMENT_OPTIONS = [
  "Oven",
  "Stovetop",
  "Air fryer",
  "Instant Pot",
  "Grill",
  "Slow cooker",
  "Microwave only",
] as const;

const SPICE_LABELS = ["Mild", "Medium", "Hot"] as const;

// Skill level rescales each recipe's stated cooking time — a beginner needs
// longer than the recipe assumes, an experienced cook less. Calibrated so a
// 40 min recipe reads as 50 / 35 / 30 min respectively.
const SKILL_LEVELS = [
  { key: "beginner", label: "Beginner", timeMult: 1.25 },
  { key: "intermediate", label: "Intermediate", timeMult: 0.875 },
  { key: "advanced", label: "Advanced", timeMult: 0.75 },
] as const;
type SkillKey = (typeof SKILL_LEVELS)[number]["key"];

const TIME_PREFS = [
  { key: "quick", label: "≤20 min" },
  { key: "standard", label: "Standard" },
  { key: "weekend", label: "Weekend" },
] as const;
type TimePrefKey = (typeof TIME_PREFS)[number]["key"];

// The stated time on a typical mid-length recipe, used only to illustrate the
// skill adjustment in the UI.
const EXAMPLE_RECIPE_MINUTES = 40;

// Per-age-group appetite multipliers. Placeholder assumptions (not sourced
// from any nutrition standard) — reasonable starting points, easy to tune
// later. Babies are tracked for household context but excluded from portion
// math entirely: baby food is typically a different dish, not a smaller
// serving of the same recipe, so scaling by a fraction would be misleading.
const AGE_GROUPS = [
  { key: "adults", label: "Adults", mult: 1 },
  { key: "seniors", label: "Seniors", mult: 0.85 },
  { key: "teens", label: "Teens", mult: 1.1 },
  { key: "kids", label: "Kids", mult: 0.6 },
  { key: "babies", label: "Babies", mult: 0 },
] as const;
type AgeGroupKey = (typeof AGE_GROUPS)[number]["key"];

// Household shape picks how much detail you're asked for. Single needs only a
// portion size; couple and family expand into one row per person so each
// eater's age and appetite can differ.
const HOUSEHOLD_MODES = [
  { key: "single", label: "Single" },
  { key: "couple", label: "Couple" },
  { key: "family", label: "Family" },
] as const;
type HouseholdMode = (typeof HOUSEHOLD_MODES)[number]["key"];

type Person = { id: string; age: AgeGroupKey; portion: 1 | 2 | 3 };

let personSeq = 0;
const makePerson = (age: AgeGroupKey = "adults"): Person => ({
  id: `p${++personSeq}`,
  age,
  portion: 2,
});

const peopleForMode = (mode: HouseholdMode): Person[] => {
  if (mode === "single") return [makePerson()];
  if (mode === "couple") return [makePerson(), makePerson()];
  return [makePerson(), makePerson(), makePerson("kids")];
};

type Diet = (typeof DIET_OPTIONS)[number];
type Cuisine = (typeof CUISINE_OPTIONS)[number];
type Equipment = (typeof EQUIPMENT_OPTIONS)[number];

export function PreferencesPage() {
  // ---- Essentials (Phase 1 target — reuses existing scaling math) ----
  // Master switch. Off collapses every setting out of view — nothing below is
  // applied to searches, so there's nothing worth configuring. State is kept
  // in memory, so switching back on restores what was there.
  const [profileEnabled, setProfileEnabled] = useState(true);
  const [householdMode, setHouseholdMode] = useState<HouseholdMode | null>("single");
  const [people, setPeople] = useState<Person[]>(() => peopleForMode("single"));
  const [diet, setDiet] = useState<Set<Diet>>(new Set(["Vegetarian", "Gluten-free"]));
  const [customDietTags, setCustomDietTags] = useState<string[]>([]);
  const [customDietDraft, setCustomDietDraft] = useState("");
  const recordDietRequestFn = useServerFn(recordDietRequest);

  // ---- Refine further (visual/interactive now, wired later) ----
  const [dislikes, setDislikes] = useState<string[]>(["Cilantro", "Mushrooms"]);
  const [dislikeDraft, setDislikeDraft] = useState("");
  const [spiceLevel, setSpiceLevel] = useState(1);
  const [cuisines, setCuisines] = useState<Set<Cuisine>>(new Set(["Italian", "Thai"]));

  const [skill, setSkill] = useState<SkillKey | null>("beginner");
  const [timeAvailable, setTimeAvailable] = useState<TimePrefKey | null>(null);
  const [equipment, setEquipment] = useState<Set<Equipment>>(
    new Set(["Oven", "Stovetop", "Air fryer"]),
  );

  const [units, setUnits] = useState<"us" | "metric">("us");
  const [bakingPrecision, setBakingPrecision] = useState<"volume" | "weight">("volume");

  const [trackGoals, setTrackGoals] = useState(false);
  const [calorieTarget, setCalorieTarget] = useState("2000");
  const [proteinTarget, setProteinTarget] = useState("110");
  const [budgetSwaps, setBudgetSwaps] = useState(false);
  const [pantryFirst, setPantryFirst] = useState(false);

  const [prepDays, setPrepDays] = useState(1);
  const [leftoverFriendly, setLeftoverFriendly] = useState(false);

  const [openSection, setOpenSection] = useState<string | null>("taste");
  const [saved, setSaved] = useState(false);

  // ---- Live math — same model as the recipe-detail servings scaler ----
  const skillTimeMult = SKILL_LEVELS.find((s) => s.key === skill)?.timeMult ?? 1;
  const adjustedMinutes = Math.round(EXAMPLE_RECIPE_MINUTES * skillTimeMult);
  // Each person contributes their own age multiplier × their own appetite —
  // a hearty teen counts for more than a light senior. Babies contribute 0
  // (see AGE_GROUPS comment).
  const adultEq = people.reduce((sum, p) => {
    const ageMult = AGE_GROUPS.find((g) => g.key === p.age)?.mult ?? 1;
    return sum + ageMult * PORTION_LEVELS[p.portion - 1].mult;
  }, 0);
  const BASE_SERVES = 4;
  const scale = adultEq / BASE_SERVES;

  const scaledExample = (base: number, unit: "cup" | "lb") => {
    const scaled = base * scale;
    if (units === "us") return `${formatQty(scaled)} ${unit === "cup" ? "cups" : "lb"}`;
    const grams = unit === "cup" ? scaled * 236.588 : scaled * 453.592;
    return `${Math.round(grams / 5) * 5} ${unit === "cup" ? "ml" : "g"}`;
  };

  const toggleSet = <T,>(set: Set<T>, value: T, setter: (s: Set<T>) => void) => {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    setter(next);
  };

  // Click a mode to apply it; click the active one again to clear back to none.
  const selectHouseholdMode = (mode: HouseholdMode) => {
    if (householdMode === mode) {
      setHouseholdMode(null);
      setPeople([]);
    } else {
      setHouseholdMode(mode);
      setPeople(peopleForMode(mode));
    }
  };

  const updatePerson = (id: string, patch: Partial<Omit<Person, "id">>) =>
    setPeople((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));

  // Ticking a not-yet-supported restriction is the clearest signal that
  // someone needs it — record it (on select only, never on deselect).
  const toggleDiet = (d: Diet) => {
    const turningOn = !diet.has(d);
    toggleSet(diet, d, setDiet);
    if (turningOn && (DIET_PLANNED as readonly string[]).includes(d)) {
      recordDietRequestFn({ data: { label: d, source: "preset" } }).catch(() => {});
    }
  };

  const addCustomDietTag = () => {
    const label = customDietDraft.trim();
    if (!label) return;
    setCustomDietTags((prev) => (prev.includes(label) ? prev : [...prev, label]));
    setCustomDietDraft("");
    // Best-effort demand signal for admins — never blocks the UI on failure.
    recordDietRequestFn({ data: { label, source: "custom" } }).catch(() => {});
  };

  const dietAll = [...diet, ...customDietTags];
  const dietSummary =
    dietAll.length === 0
      ? "None set — showing everything"
      : dietAll.length <= 2
        ? dietAll.join(", ")
        : `${dietAll.slice(0, 2).join(", ")} +${dietAll.length - 2} more`;

  const handleSave = () => {
    // Placeholder — wiring lands after visual sign-off. See file header.
    setSaved(true);
    setTimeout(() => setSaved(false), 2600);
  };

  return (
    <div className="min-h-screen pb-24">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-5 pt-6">
        <Link to="/" className="flex items-center gap-2.5">
          <span className="font-display text-xl font-semibold tracking-tight">What 2 Cook</span>
        </Link>
      </header>

      <main className="mx-auto max-w-5xl px-5 pt-8">
        <Link
          to="/profile"
          className="mb-4 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to profile
        </Link>

        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
              Personalization
            </p>
            <h1 className="mt-2 font-display text-3xl font-medium md:text-4xl">Portion profile</h1>
            <p className="mt-3 max-w-xl text-sm text-muted-foreground">
              Three settings shape every recipe you open. Everything past that is optional — set it
              once, or leave it and refine as you go.
            </p>
          </div>
          <button
            onClick={handleSave}
            className="inline-flex items-center gap-2 rounded-full bg-foreground px-5 py-2.5 text-sm font-semibold text-background shadow-lift transition hover:translate-y-[-1px]"
          >
            Save profile
          </button>
        </div>

        {/* Master switch — the whole point of the page hinges on this, so it
            sits above everything rather than buried in a section. */}
        <div
          className={cn(
            "mb-8 rounded-2xl border p-4 transition",
            profileEnabled ? "border-primary/30 bg-primary/5" : "border-border bg-card",
          )}
        >
          <SwitchRow
            title="Use my profile for searches"
            sub={
              profileEnabled
                ? "On — recipes are scaled and filtered for your household on every search."
                : "Off — searches use standard portions. Turn on if you regularly cook for the same people."
            }
            checked={profileEnabled}
            onCheckedChange={setProfileEnabled}
          />
        </div>

        {/* Everything below is hidden while the profile is off — there's
            nothing to configure if none of it is being applied. */}
        {!profileEnabled && (
          <p className="text-sm text-muted-foreground">
            Switch the toggle on to set up your household, portions, and dietary preferences.
          </p>
        )}

        {profileEnabled && (
          <div className="animate-in fade-in slide-in-from-top-2 duration-300">
            <div className="mb-8 flex flex-wrap gap-5 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-primary" /> Preferred — applied as your
                default search settings
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full border border-input" /> Optional — refine
                anytime
              </span>
            </div>

            <div className="grid gap-8 lg:grid-cols-[1fr_320px] lg:items-start">
              <div>
                {/* ===================== ESSENTIALS ===================== */}
                <Section title="Essentials" tag="preferred">
                  {/* Row 1 — cooking context, always open (not a collapsible
                  accordion): it's foundational context, not a refinement. */}
                  <Card
                    title="How you cook"
                    hint="Your experience and kitchen — shapes which recipes surface and how long they'll really take."
                    className="mb-4"
                  >
                    {/* Column 1 stacks skill over time (both are segmented pickers,
                    so they share a rhythm); column 2 is the equipment chip cloud. */}
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-4">
                        <div>
                          <FieldLabel>Skill level</FieldLabel>
                          <Segmented
                            value={skill}
                            onChange={setSkill}
                            allowDeselect
                            options={SKILL_LEVELS.map((s) => ({ value: s.key, label: s.label }))}
                          />
                          <p className="mt-1.5 text-[11px] text-muted-foreground">
                            {skill ? (
                              <>
                                Adjusts every recipe's stated time to match your pace — a{" "}
                                {EXAMPLE_RECIPE_MINUTES} min recipe shows as{" "}
                                <b className="font-semibold text-foreground">
                                  {adjustedMinutes} min
                                </b>{" "}
                                for you.
                              </>
                            ) : (
                              <>
                                Pick a level to adjust recipe times to your pace — otherwise times
                                show as written.
                              </>
                            )}
                          </p>
                        </div>
                        <div>
                          <FieldLabel>Preferred cooking time</FieldLabel>
                          <Segmented
                            value={timeAvailable}
                            onChange={setTimeAvailable}
                            allowDeselect
                            options={TIME_PREFS.map((t) => ({ value: t.key, label: t.label }))}
                          />
                          <p className="mt-1.5 text-[11px] text-muted-foreground">
                            {timeAvailable
                              ? "Filters recipes to this length."
                              : "No preference — all lengths shown."}
                          </p>
                        </div>
                      </div>
                      <div>
                        <FieldLabel>Equipment on hand</FieldLabel>
                        <div className="flex flex-wrap gap-1.5">
                          {EQUIPMENT_OPTIONS.map((e) => (
                            <ChipToggle
                              key={e}
                              label={e}
                              active={equipment.has(e)}
                              onClick={() => toggleSet(equipment, e, setEquipment)}
                              pill={false}
                            />
                          ))}
                        </div>
                      </div>
                    </div>
                  </Card>

                  {/* Row 2 — household. Single asks only for a portion size;
                  couple/family expand into one row per person so ages and
                  appetites can differ. Portion size lives here rather than in
                  its own card — it's per-person now, not a global setting. */}
                  <Card
                    title="Who's eating"
                    hint="Your regular household — this is what every search gets scaled to."
                  >
                    <FieldLabel>Household</FieldLabel>
                    <div className="flex max-w-sm gap-2">
                      {HOUSEHOLD_MODES.map((m) => (
                        <button
                          key={m.key}
                          onClick={() => selectHouseholdMode(m.key)}
                          className={cn(
                            "flex-1 rounded-full border px-2 py-2 text-xs font-medium transition",
                            householdMode === m.key
                              ? "border-primary bg-primary text-primary-foreground shadow-warm"
                              : "border-border bg-background text-foreground hover:bg-secondary",
                          )}
                        >
                          {m.label}
                        </button>
                      ))}
                    </div>

                    {householdMode === "single" && people[0] && (
                      <>
                        <FieldLabel className="mt-4">Your portion size</FieldLabel>
                        <div className="flex max-w-sm gap-2">
                          {PORTION_LEVELS.map((p) => (
                            <button
                              key={p.level}
                              onClick={() => updatePerson(people[0].id, { portion: p.level })}
                              className={cn(
                                "flex-1 rounded-full border px-2 py-2 text-xs font-medium transition",
                                people[0].portion === p.level
                                  ? "border-primary bg-primary text-primary-foreground shadow-warm"
                                  : "border-border bg-background text-foreground hover:bg-secondary",
                              )}
                            >
                              {p.label}
                            </button>
                          ))}
                        </div>
                        <p className="mt-2 text-[11px] text-muted-foreground">
                          Applied to every recipe you search — ingredient amounts scale to this.
                        </p>
                      </>
                    )}

                    {(householdMode === "couple" || householdMode === "family") && (
                      <>
                        <FieldLabel className="mt-4">Set each person</FieldLabel>
                        <div className="space-y-2">
                          {people.map((p, i) => (
                            <PersonRow
                              key={p.id}
                              index={i}
                              person={p}
                              onChange={(patch) => updatePerson(p.id, patch)}
                              onRemove={
                                householdMode === "family" && people.length > 1
                                  ? () => setPeople((prev) => prev.filter((x) => x.id !== p.id))
                                  : undefined
                              }
                            />
                          ))}
                        </div>
                        {householdMode === "family" && (
                          <button
                            onClick={() => setPeople((prev) => [...prev, makePerson()])}
                            className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-dashed border-input px-3 py-1.5 text-xs font-medium text-muted-foreground transition hover:text-foreground"
                          >
                            <Plus className="h-3 w-3" /> Add person
                          </button>
                        )}
                        <p className="mt-2 text-[11px] text-muted-foreground">
                          Applied to every recipe you search. Babies aren't counted in scaling —
                          baby food is usually a different dish, not a smaller serving.
                        </p>
                      </>
                    )}

                    {!householdMode && (
                      <p className="mt-3 text-[11px] text-muted-foreground">
                        Nothing set — searches use standard portions. Pick a household above.
                      </p>
                    )}
                  </Card>

                  {/* Row 3 — dietary, full width. */}
                  <Card
                    title="Dietary restrictions & allergies"
                    hint="Always check ingredients yourself for allergies — no filter here is a guarantee."
                    className="mt-4"
                  >
                    <FieldLabel>Working now</FieldLabel>
                    <div className="flex flex-wrap gap-1.5">
                      {DIET_SUPPORTED.map((d) => (
                        <ChipToggle
                          key={d}
                          label={d}
                          active={diet.has(d)}
                          onClick={() => toggleDiet(d)}
                        />
                      ))}
                    </div>
                    <p className="mt-1.5 text-[11px] text-muted-foreground">
                      These filter your results today.
                    </p>

                    <div className="my-4 h-px bg-border" />

                    <FieldLabel>Not working yet — we're building these</FieldLabel>
                    <div className="flex flex-wrap gap-1.5">
                      {DIET_PLANNED.map((d) => (
                        <ChipToggle
                          key={d}
                          label={d}
                          active={diet.has(d)}
                          onClick={() => toggleDiet(d)}
                        />
                      ))}
                    </div>
                    <p className="mt-1.5 text-[11px] text-muted-foreground">
                      Selecting these won't change your results yet — it tells us which to build
                      first. Your preference genuinely helps us prioritise.
                    </p>

                    <FieldLabel className="mt-4">Not listed? Add your own</FieldLabel>
                    <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-input bg-background px-3 py-2">
                      {customDietTags.map((t) => (
                        <span
                          key={t}
                          className="inline-flex items-center gap-1 rounded-full border border-primary bg-primary/10 py-1 pl-3 pr-1.5 text-xs font-medium text-primary"
                        >
                          {t}
                          <button
                            onClick={() => setCustomDietTags((prev) => prev.filter((x) => x !== t))}
                            aria-label={`Remove ${t}`}
                            className="grid h-4 w-4 place-items-center rounded-full hover:bg-primary/20"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      ))}
                      <input
                        value={customDietDraft}
                        onChange={(e) => setCustomDietDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            addCustomDietTag();
                          }
                        }}
                        placeholder="e.g. Pescatarian, no pork — press Enter…"
                        className="min-w-[12rem] flex-1 bg-transparent py-1 text-xs outline-none placeholder:text-muted-foreground/60"
                      />
                    </div>
                    <p className="mt-1.5 text-[11px] text-muted-foreground">
                      Anything you add here is shared with us so we can see which restrictions to
                      support properly — it isn't a working filter yet.
                    </p>
                  </Card>
                </Section>

                {/* ===================== REFINE FURTHER ===================== */}
                <Section title="Refine further" tag="optional">
                  <div className="space-y-3">
                    <Accordion
                      id="units"
                      title="Units & measurement"
                      summary={units === "us" ? "US (cups, lb)" : "Metric (ml, g)"}
                      open={openSection === "units"}
                      onToggle={() => setOpenSection((s) => (s === "units" ? null : "units"))}
                    >
                      <FieldLabel>Measurement system</FieldLabel>
                      {/* Not deselectable — amounts always need a unit system. */}
                      <Segmented
                        value={units}
                        onChange={(v) => v && setUnits(v)}
                        options={[
                          { value: "us", label: "US (cups, lb)" },
                          { value: "metric", label: "Metric (ml, g)" },
                        ]}
                      />

                      <FieldLabel className="mt-5">Baking precision</FieldLabel>
                      <Segmented
                        value={bakingPrecision}
                        onChange={(v) => v && setBakingPrecision(v)}
                        options={[
                          { value: "volume", label: "Volume (cups)" },
                          { value: "weight", label: "Weight (grams)" },
                        ]}
                      />
                    </Accordion>

                    {/* Each on its own full-width row, matching Units above. */}
                    <Accordion
                      id="taste"
                      title="Taste & flavor"
                      summary={[...cuisines].join(" · ") || "Nothing set — using defaults"}
                      open={openSection === "taste"}
                      onToggle={() => setOpenSection((s) => (s === "taste" ? null : "taste"))}
                    >
                      <FieldLabel>Ingredients to avoid</FieldLabel>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {dislikes.map((d) => (
                          <span
                            key={d}
                            className="inline-flex items-center gap-1 rounded-full border border-border bg-card py-1 pl-3 pr-1.5 text-xs"
                          >
                            {d}
                            <button
                              onClick={() => setDislikes((prev) => prev.filter((x) => x !== d))}
                              aria-label={`Remove ${d}`}
                              className="grid h-4 w-4 place-items-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </span>
                        ))}
                        <input
                          value={dislikeDraft}
                          onChange={(e) => setDislikeDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && dislikeDraft.trim()) {
                              e.preventDefault();
                              setDislikes((prev) => [...prev, dislikeDraft.trim()]);
                              setDislikeDraft("");
                            }
                          }}
                          placeholder="Type an ingredient, press Enter…"
                          className="min-w-[9rem] flex-1 bg-transparent py-1 text-xs outline-none placeholder:text-muted-foreground/60"
                        />
                      </div>

                      <FieldLabel className="mt-5">Spice tolerance</FieldLabel>
                      <Slider
                        min={0}
                        max={2}
                        step={1}
                        value={[spiceLevel]}
                        onValueChange={([v]) => setSpiceLevel(v)}
                      />
                      <div className="mt-2 flex justify-between text-xs text-muted-foreground">
                        {SPICE_LABELS.map((l, i) => (
                          <span
                            key={l}
                            className={cn(i === spiceLevel && "font-semibold text-primary")}
                          >
                            {l}
                          </span>
                        ))}
                      </div>

                      <FieldLabel className="mt-5">Favorite cuisines</FieldLabel>
                      <div className="flex flex-wrap gap-1.5">
                        {CUISINE_OPTIONS.map((c) => (
                          <ChipToggle
                            key={c}
                            label={c}
                            active={cuisines.has(c)}
                            onClick={() => toggleSet(cuisines, c, setCuisines)}
                          />
                        ))}
                      </div>
                    </Accordion>

                    <Accordion
                      id="goals"
                      title="Goals"
                      summary={
                        [
                          trackGoals && "Calorie tracking on",
                          budgetSwaps && "Budget-conscious",
                          pantryFirst && "Pantry-first",
                        ]
                          .filter(Boolean)
                          .join(" · ") || "Nothing set — using defaults"
                      }
                      open={openSection === "goals"}
                      onToggle={() => setOpenSection((s) => (s === "goals" ? null : "goals"))}
                    >
                      <SwitchRow
                        title="Track a calorie / macro target"
                        sub="Recipes get flagged against your daily target."
                        checked={trackGoals}
                        onCheckedChange={setTrackGoals}
                      />
                      {trackGoals && (
                        <div className="mt-3 grid grid-cols-2 gap-3">
                          <NumField
                            label="Daily calories"
                            unit="kcal"
                            value={calorieTarget}
                            onChange={setCalorieTarget}
                          />
                          <NumField
                            label="Protein target"
                            unit="g"
                            value={proteinTarget}
                            onChange={setProteinTarget}
                          />
                        </div>
                      )}
                      <SwitchRow
                        className="mt-4"
                        title="Budget-conscious swaps"
                        sub="Prefer cheaper ingredient substitutions when available."
                        checked={budgetSwaps}
                        onCheckedChange={setBudgetSwaps}
                      />
                      <SwitchRow
                        className="mt-4"
                        title="Use what's in my pantry"
                        sub="Rank recipes higher when they match items you already have."
                        checked={pantryFirst}
                        onCheckedChange={setPantryFirst}
                      />
                    </Accordion>

                    <Accordion
                      id="prep"
                      title="Meal-prep mode"
                      summary={`${prepDays} day${prepDays === 1 ? "" : "s"}${leftoverFriendly ? " · Leftover-friendly" : ""}`}
                      open={openSection === "prep"}
                      onToggle={() => setOpenSection((s) => (s === "prep" ? null : "prep"))}
                    >
                      <CounterRow
                        label="Prep for this many days"
                        value={prepDays}
                        min={1}
                        max={7}
                        onChange={setPrepDays}
                      />
                      <SwitchRow
                        className="mt-4"
                        title="Prefer leftover-friendly recipes"
                        sub="Bias search toward dishes that hold up well over a few days."
                        checked={leftoverFriendly}
                        onCheckedChange={setLeftoverFriendly}
                      />
                    </Accordion>
                  </div>
                </Section>
              </div>

              {/* ===================== SUMMARY ===================== */}
              <aside className="lg:sticky lg:top-6">
                {/* Warm tint + primary-tinted border so the live preview reads as
                output, visually distinct from the plain white input cards. */}
                <div className="rounded-3xl border border-primary/20 bg-primary/5 p-6 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Your recipe preview
                  </p>
                  <p className="mt-2 font-display text-3xl text-primary">
                    {adultEq.toFixed(1)} servings
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {Math.round(scale * 100)}% of the base recipe (serves {BASE_SERVES})
                  </p>
                  <div className="my-4 h-px bg-primary/15" />
                  <div className="space-y-2.5 text-sm">
                    <div className="flex items-baseline justify-between gap-2">
                      <span>Rice</span>
                      <span className="font-mono text-xs text-muted-foreground">
                        2 cups →{" "}
                        <b className="font-semibold text-foreground">{scaledExample(2, "cup")}</b>
                      </span>
                    </div>
                    <div className="flex items-baseline justify-between gap-2">
                      <span>Chicken breast</span>
                      <span className="font-mono text-xs text-muted-foreground">
                        1½ lb →{" "}
                        <b className="font-semibold text-foreground">{scaledExample(1.5, "lb")}</b>
                      </span>
                    </div>
                    <div className="flex items-baseline justify-between gap-2">
                      <span>Cooking time</span>
                      <span className="font-mono text-xs text-muted-foreground">
                        {EXAMPLE_RECIPE_MINUTES} min →{" "}
                        <b className="font-semibold text-foreground">{adjustedMinutes} min</b>
                      </span>
                    </div>
                  </div>
                  <p className="mt-3 text-xs text-muted-foreground">
                    Example recipe shown as written (left) vs. adjusted to your profile (right).
                  </p>
                  <div className="my-4 h-px bg-primary/15" />
                  <p className="text-sm">
                    <span className="text-muted-foreground">Diet:</span> {dietSummary}
                  </p>
                  <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
                    This panel updates live as you change your household, units, or dietary filters.
                    Portion and household already work exactly like this on every recipe page — the
                    rest of this page is a preview of what's coming next.
                  </p>
                </div>
              </aside>
            </div>
          </div>
        )}
      </main>

      {saved && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 rounded-full bg-foreground px-5 py-3 text-sm text-background shadow-lift">
          Saved locally for now — synced profile is next.
        </div>
      )}
    </div>
  );
}

// ============================================================
// Pieces below reuse this app's existing visual language:
// - ChipToggle: same shape as home-page ingredient/trending chips
// - Segmented: same pill-group shape as the recipe-detail Servings selector
// - CounterRow's +/- buttons: same square-icon-button shape as PortionRow
// - Accordion: hand-rolled to match card/chip radii exactly (Radix accordion
//   is available too, but its default parts don't share this app's card
//   shell — this keeps the visual match tighter for a like-for-like review)
// ============================================================

function Section({
  title,
  tag,
  children,
}: {
  title: string;
  tag: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-9">
      <h2 className="mb-4 flex items-center gap-2 font-display text-xl">
        {title}
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          — {tag}
        </span>
      </h2>
      {children}
    </section>
  );
}

function Card({
  title,
  hint,
  children,
  className,
}: {
  title: string;
  hint: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-2xl border border-border bg-card p-4 shadow-sm", className)}>
      <h3 className="text-sm font-semibold">{title}</h3>
      {/* Same weight/color as the home page's "Trending in …" label, for one
          consistent "small descriptive line" treatment across the app. */}
      <p className="mb-3 mt-0.5 text-xs font-medium text-muted-foreground">{hint}</p>
      {children}
    </div>
  );
}

function ChipToggle({
  label,
  active,
  onClick,
  pill = true,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  pill?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1 border px-3 py-1.5 text-xs font-medium transition",
        pill ? "rounded-full" : "rounded-lg",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-background text-foreground hover:bg-secondary",
      )}
    >
      {active && <Check className="h-3 w-3" />}
      {label}
    </button>
  );
}

function Segmented<T extends string>({
  value,
  onChange,
  options,
  allowDeselect = false,
}: {
  value: T | null;
  onChange: (v: T | null) => void;
  options: { value: T; label: string }[];
  // Off by default: some choices (unit system) must always have a value.
  allowDeselect?: boolean;
}) {
  return (
    <div className="flex overflow-hidden rounded-full border border-border">
      {options.map((o, i) => (
        <button
          key={o.value}
          onClick={() => onChange(allowDeselect && value === o.value ? null : o.value)}
          className={cn(
            "flex-1 px-3 py-2 text-xs font-medium transition",
            i > 0 && "border-l border-border",
            value === o.value
              ? "bg-primary text-primary-foreground"
              : "bg-background text-foreground hover:bg-secondary",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function CounterRow({
  label,
  value,
  min,
  max,
  onChange,
  className,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center justify-between", className)}>
      <span className="text-sm">{label}</span>
      <div className="flex items-center gap-2">
        <button
          onClick={() => onChange(Math.max(min, value - 1))}
          disabled={value <= min}
          aria-label={`Fewer ${label.toLowerCase()}`}
          className="grid h-7 w-7 place-items-center rounded-md border border-input bg-background text-foreground transition hover:border-primary hover:text-primary disabled:opacity-40"
        >
          <Minus className="h-3.5 w-3.5" />
        </button>
        <span className="w-4 text-center font-mono text-sm tabular-nums">{value}</span>
        <button
          onClick={() => onChange(Math.min(max, value + 1))}
          disabled={value >= max}
          aria-label={`More ${label.toLowerCase()}`}
          className="grid h-7 w-7 place-items-center rounded-md border border-input bg-background text-foreground transition hover:border-primary hover:text-primary disabled:opacity-40"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

// One eater: their age band and how much they eat. Kept to a single compact
// row so a family of five doesn't turn into a wall of controls.
function PersonRow({
  index,
  person,
  onChange,
  onRemove,
}: {
  index: number;
  person: Person;
  onChange: (patch: Partial<Omit<Person, "id">>) => void;
  onRemove?: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-background px-3 py-2">
      <span className="w-16 shrink-0 text-xs font-medium text-muted-foreground">
        Person {index + 1}
      </span>

      <Select value={person.age} onValueChange={(v) => onChange({ age: v as AgeGroupKey })}>
        <SelectTrigger className="h-8 w-[104px] text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {AGE_GROUPS.map((g) => (
            <SelectItem key={g.key} value={g.key} className="text-xs">
              {g.label.replace(/s$/, "")}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="flex flex-1 gap-1">
        {PORTION_LEVELS.map((p) => (
          <button
            key={p.level}
            onClick={() => onChange({ portion: p.level })}
            disabled={person.age === "babies"}
            className={cn(
              "flex-1 rounded-full border px-2 py-1 text-[11px] font-medium transition disabled:opacity-40",
              person.portion === p.level && person.age !== "babies"
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-foreground hover:bg-secondary",
            )}
          >
            {p.label}
          </button>
        ))}
      </div>

      {onRemove && (
        <button
          onClick={onRemove}
          aria-label={`Remove person ${index + 1}`}
          className="grid h-7 w-7 shrink-0 place-items-center rounded-md border border-border text-muted-foreground transition hover:border-destructive hover:text-destructive"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

function FieldLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cn("mb-2 text-xs font-semibold", className)}>{children}</p>;
}

function SwitchRow({
  title,
  sub,
  checked,
  onCheckedChange,
  className,
}: {
  title: string;
  sub: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  className?: string;
}) {
  return (
    <div className={cn("flex items-start justify-between gap-4", className)}>
      <div>
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">{sub}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} className="mt-0.5 shrink-0" />
    </div>
  );
}

function NumField({
  label,
  unit,
  value,
  onChange,
}: {
  label: string;
  unit: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-muted-foreground">{label}</span>
      <div className="flex items-center gap-1 rounded-lg border border-input bg-background px-3 py-2">
        <input
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/\D/g, ""))}
          inputMode="numeric"
          className="w-full bg-transparent font-mono text-sm tabular-nums outline-none"
        />
        <span className="font-mono text-xs text-muted-foreground">{unit}</span>
      </div>
    </label>
  );
}

function Accordion({
  id,
  title,
  summary,
  open,
  onToggle,
  children,
}: {
  id: string;
  title: string;
  summary: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      <button
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-5 py-4 text-left"
      >
        <h3 className="shrink-0 text-sm font-semibold">{title}</h3>
        <span className="flex-1 truncate text-xs text-muted-foreground">{summary}</span>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
        />
      </button>
      {open && (
        <div id={`${id}-panel`} className="border-t border-border bg-background/40 px-5 py-4">
          {children}
        </div>
      )}
    </div>
  );
}
