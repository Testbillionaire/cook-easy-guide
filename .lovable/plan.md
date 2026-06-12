## Goal

Restructure the "What to cook with?" entry into two distinct user flows, and reorganize the ingredient map into a 2-layer (Category → Items) drill-down.

## Flow A — Intro screen (new first step)

A single screen titled **"What to cook with?"** with two large choice cards:

1. **Type what I have** — free-text + suggestion search, no category browser.
2. **Pick what I want** — opens the 2-layer ingredient map.

Each card has an arrow icon; clicking sets the mode and advances to the next step. A small "Back" affordance returns to this intro from either flow.

```text
┌─────────────────────────────┐
│   What to cook with?        │
│                             │
│  ┌──────────┐ ┌──────────┐  │
│  │ ⌨  Type  │ │ 🗂  Pick │  │
│  │ what I   │ │ what I   │  │
│  │ have  →  │ │ want  →  │  │
│  └──────────┘ └──────────┘  │
└─────────────────────────────┘
```

## Flow A.1 — Type what I have

- Search input + Add button (existing behavior).
- Suggestion chips below input (filtered from catalog).
- Selected items list with × to remove.
- Bottom **Next →** arrow button (enabled when ≥1 item).
- No category browser shown in this mode.

## Flow A.2 — Pick what I want (2-layer map)

**Layer 1 — Categories grid.** Tiles for each top-level group from `src/lib/ingredients.ts`, but broken into finer parent groups so each tile feels coherent:

- Chicken, Beef, Pork, Lamb, Seafood, Eggs & Dairy, Vegetables, Fruits, Grains & Pasta, Legumes, Herbs & Spices, Sauces & Condiments, Oils & Fats, Nuts & Seeds, Frozen, Drinks.

Each tile = emoji + label + item count.

**Layer 2 — Items in selected category.** Tapping a tile slides in a panel showing only that group's items as chips (emoji + label). Header has `←` back to Layer 1 + category title. Tapping a chip toggles selection (checkmark overlay). Selected count badge persists across categories.

A sticky bottom bar shows "N selected" + **Next →** arrow.

```text
Layer 1                  Layer 2 (Chicken)
┌───────────────┐       ┌───────────────┐
│ 🐔 Chicken 7 │  ──▶  │ ← Chicken     │
│ 🥩 Beef    9 │       │ ☐ 🍗 Breast   │
│ 🐟 Seafood…  │       │ ☑ 🍗 Thigh    │
│ …            │       │ ☐ Drumstick   │
└───────────────┘       │ …             │
                        └───────────────┘
                        [ 2 selected →  ]
```

Both flows feed the same downstream **Portion** step that already exists.

## Data changes (`src/lib/ingredients.ts`)

- Add a `parent` field (or refine `category`) so items group as: chicken, beef, pork, lamb, seafood, dairy-eggs, vegetables, fruits, grains, legumes, herbs-spices, sauces, oils, nuts-seeds, frozen, drinks.
- Export `getParentGroups()` returning `{ key, label, emoji, count }[]` and `getItemsByParent(key)`.
- Keep existing `defaultUnit` logic untouched.

## UI changes (`src/routes/index.tsx`)

Extend the step machine:

```text
intro → (type | pick) → portion → results → recipe
```

- New `IntroStep` component (two cards).
- Rename current pick UI into `TypeStep` (search + add only).
- New `PickStep` with `layer` state (`"categories" | "items"`) and `activeParent`.
- Reuse existing chip + selection + portion code unchanged.
- "Back" buttons on every step return one level.

## Out of scope

- No backend changes, no new routes, no recipe-source changes.
- Ingredient list contents stay as-is; only their grouping metadata is added.
