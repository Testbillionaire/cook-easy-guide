import { describe, it, expect } from "vitest";
import {
  toMealdbCandidates,
  estimateMinutes,
  inTimeBand,
  matchEffort,
  applyOverlays,
  isFeatured,
  amazonSearchUrl,
  instacartSearchUrl,
  AMAZON_AFFILIATE_TAG,
  type MealDetail,
  type MealSummary,
  type OverlaySnapshot,
} from "./mealdb";

const meal = (id: string, name = `Meal ${id}`): MealSummary => ({
  idMeal: id,
  strMeal: name,
  strMealThumb: `https://example.test/${id}.jpg`,
});

const detail = (over: Partial<MealDetail> = {}): MealDetail => ({
  idMeal: "1",
  strMeal: "Test",
  strMealThumb: "",
  strCategory: "Chicken",
  strArea: "British",
  strInstructions: "",
  ingredients: [],
  ...over,
});

describe("toMealdbCandidates", () => {
  it("returns the whole phrase before shorter prefixes", () => {
    expect(toMealdbCandidates("chicken breast")).toEqual([
      "chicken breast",
      "chicken",
      "breast",
    ]);
  });

  it("strips the leftover 'lo-' marker", () => {
    expect(toMealdbCandidates("lo-roast chicken")).toContain("chicken");
  });

  it("strips a leading cooking-method prefix", () => {
    expect(toMealdbCandidates("roasted-potato")).toEqual(["potato"]);
  });

  it("strips only the first matching prefix", () => {
    // "cooked-" goes, "fried" survives as a plain word.
    expect(toMealdbCandidates("cooked-fried-rice")).toEqual([
      "fried rice",
      "fried",
      "rice",
    ]);
  });

  it("normalises parentheses and hyphens to spaces", () => {
    expect(toMealdbCandidates("tofu (firm)")).toEqual(["tofu firm", "tofu", "firm"]);
  });

  it("returns an empty list for input that normalises to nothing", () => {
    expect(toMealdbCandidates("   ")).toEqual([]);
    expect(toMealdbCandidates("()")).toEqual([]);
  });

  it("de-duplicates single-word input", () => {
    expect(toMealdbCandidates("egg")).toEqual(["egg"]);
  });
});

describe("estimateMinutes", () => {
  it("grows with ingredient count and instruction length", () => {
    const small = estimateMinutes(detail({ ingredients: [], strInstructions: "" }));
    const large = estimateMinutes(
      detail({
        ingredients: Array.from({ length: 10 }, () => ({ name: "x", measure: "1" })),
        strInstructions: "y".repeat(2200),
      }),
    );
    expect(large).toBeGreaterThan(small);
  });

  it("never returns a negative estimate for an empty recipe", () => {
    expect(estimateMinutes(detail())).toBeGreaterThan(0);
  });
});

describe("inTimeBand", () => {
  it.each([
    [10, "u15", true],
    [15, "u15", false],
    [15, "15_30", true],
    [30, "15_30", true],
    [31, "15_30", false],
    [60, "30_60", true],
    [61, "30_60", false],
    [61, "60p", true],
  ] as const)("%i minutes in band %s -> %s", (mins, band, expected) => {
    expect(inTimeBand(mins, band)).toBe(expected);
  });

  it("leaves no gap between adjacent bands", () => {
    const bands = ["u15", "15_30", "30_60", "60p"] as const;
    for (const mins of [1, 14, 15, 30, 31, 60, 61, 200]) {
      const hits = bands.filter((b) => inTimeBand(mins, b));
      expect(hits).toHaveLength(1);
    }
  });
});

describe("matchEffort", () => {
  it("treats instructions with no cooking verbs as no-cook", () => {
    expect(matchEffort(detail({ strInstructions: "Toss everything in a bowl." }), "no_cook")).toBe(true);
  });

  it("rejects instructions that clearly cook", () => {
    expect(matchEffort(detail({ strInstructions: "Bake for 20 minutes." }), "no_cook")).toBe(false);
  });

  it("detects make-ahead language", () => {
    expect(matchEffort(detail({ strInstructions: "Marinate overnight." }), "make_ahead")).toBe(true);
  });

  it("detects meal-prep language", () => {
    expect(matchEffort(detail({ strInstructions: "Freeze in an airtight container." }), "meal_prep")).toBe(true);
  });

  it("requires a vessel for one-pot", () => {
    expect(matchEffort(detail({ strInstructions: "Simmer in one pot." }), "one_pot")).toBe(true);
    expect(matchEffort(detail({ strInstructions: "Mix well." }), "one_pot")).toBe(false);
  });

  it("excludes recipes that explicitly use a separate pan", () => {
    expect(
      matchEffort(detail({ strInstructions: "Heat the pan. In a separate pan, fry the onion." }), "one_pot"),
    ).toBe(false);
  });

  // ---- Known defects, pinned so a fix visibly flips them ----
  // matchEffort("no_cook") only checks for the ABSENCE of cooking words, so a
  // recipe that advertises itself as no-cook is excluded by the very word that
  // says so.
  it("KNOWN BUG: 'no baking required' is misread as a cooked recipe", () => {
    expect(matchEffort(detail({ strInstructions: "No baking required." }), "no_cook")).toBe(false);
  });
});

describe("applyOverlays", () => {
  const snapshot = (over: Partial<OverlaySnapshot> = {}): OverlaySnapshot => ({
    overlays: [],
    custom: [],
    ...over,
  });

  it("returns the base list unchanged when there is no snapshot", () => {
    const base = [meal("1"), meal("2")];
    expect(applyOverlays(base, undefined, { ingredients: [] })).toEqual(base);
  });

  it("drops recipes marked hidden", () => {
    const base = [meal("1"), meal("2")];
    const snap = snapshot({
      overlays: [
        { recipe_id: "1", status: "hidden", time_band: null, dish_key: null, effort_keys: [], featured_rank: null },
      ],
    });
    expect(applyOverlays(base, snap, { ingredients: [] }).map((m) => m.idMeal)).toEqual(["2"]);
  });

  it("sorts featured recipes ahead of the rest, by rank", () => {
    const base = [meal("1"), meal("2"), meal("3")];
    const snap = snapshot({
      overlays: [
        { recipe_id: "3", status: "featured", time_band: null, dish_key: null, effort_keys: [], featured_rank: 1 },
        { recipe_id: "2", status: "featured", time_band: null, dish_key: null, effort_keys: [], featured_rank: 0 },
      ],
    });
    expect(applyOverlays(base, snap, { ingredients: [] }).map((m) => m.idMeal)).toEqual(["2", "3", "1"]);
  });

  it("merges in custom recipes whose ingredients match the search", () => {
    const snap = snapshot({
      custom: [
        {
          id: "cust_1",
          title: "House Chicken",
          image_url: "",
          category: "Chicken",
          area: "",
          instructions: "",
          ingredients: [{ name: "Chicken breast", measure: "200g" }],
        },
      ],
    });
    const out = applyOverlays([meal("1")], snap, { ingredients: ["chicken"] });
    expect(out.map((m) => m.idMeal)).toContain("cust_1");
  });

  it("excludes custom recipes that match no searched ingredient", () => {
    const snap = snapshot({
      custom: [
        {
          id: "cust_1",
          title: "House Salad",
          image_url: "",
          category: "",
          area: "",
          instructions: "",
          ingredients: [{ name: "Lettuce", measure: "1" }],
        },
      ],
    });
    const out = applyOverlays([meal("1")], snap, { ingredients: ["chicken"] });
    expect(out.map((m) => m.idMeal)).not.toContain("cust_1");
  });

  it("does not duplicate a custom recipe already in the base list", () => {
    const snap = snapshot({
      custom: [
        { id: "cust_1", title: "Dup", image_url: "", category: "", area: "", instructions: "", ingredients: [] },
      ],
    });
    const out = applyOverlays([meal("cust_1")], snap, { ingredients: [] });
    expect(out.filter((m) => m.idMeal === "cust_1")).toHaveLength(1);
  });

  // ---- Known defect, pinned ----
  // A custom recipe with NO overlay row is treated as live. That is safe only
  // while custom_recipes INSERT is admin-only; it becomes an unmoderated
  // publish path the moment public submissions are allowed.
  it("KNOWN RISK: a custom recipe with no overlay row is shown by default", () => {
    const snap = snapshot({
      custom: [
        { id: "cust_new", title: "Unreviewed", image_url: "", category: "", area: "", instructions: "", ingredients: [] },
      ],
    });
    const out = applyOverlays([], snap, { ingredients: [] });
    expect(out.map((m) => m.idMeal)).toContain("cust_new");
  });
});

describe("isFeatured", () => {
  it("is false without a snapshot", () => {
    expect(isFeatured("1", undefined)).toBe(false);
  });

  it("distinguishes featured from merely active", () => {
    const snap: OverlaySnapshot = {
      overlays: [
        { recipe_id: "1", status: "featured", time_band: null, dish_key: null, effort_keys: [], featured_rank: 0 },
        { recipe_id: "2", status: "active", time_band: null, dish_key: null, effort_keys: [], featured_rank: null },
      ],
      custom: [],
    };
    expect(isFeatured("1", snap)).toBe(true);
    expect(isFeatured("2", snap)).toBe(false);
  });
});

describe("store links", () => {
  it("keeps the Amazon affiliate tag on every link", () => {
    expect(amazonSearchUrl("olive oil")).toContain(`tag=${AMAZON_AFFILIATE_TAG}`);
  });

  it("url-encodes the query for both stores", () => {
    expect(amazonSearchUrl("olive oil & salt")).toContain("olive%20oil%20%26%20salt");
    expect(instacartSearchUrl("olive oil & salt")).toContain("olive%20oil%20%26%20salt");
  });
});
