// Leftover ingredient categories — sourced from leftover_dish_transformations.xlsx
export type LeftoverCategoryKey =
  | "proteins"
  | "grains"
  | "vegetables"
  | "bread"
  | "dairy"
  | "sauces";

export type LeftoverItem = {
  key: string;       // unique slug, used as ingredient key in selection
  label: string;     // display label
  emoji: string;
  dishes: string[];  // suggested new dishes
};

export type LeftoverCategory = {
  key: LeftoverCategoryKey;
  label: string;
  emoji: string;
  items: LeftoverItem[];
};

export const LEFTOVER_CATEGORIES: LeftoverCategory[] = [
  {
    key: "proteins",
    label: "Proteins",
    emoji: "🍖",
    items: [
      { key: "lo-cooked-chicken-breast", label: "Cooked chicken breast", emoji: "🍗", dishes: ["Chicken fried rice", "Chicken quesadilla", "Caesar wrap"] },
      { key: "lo-roast-chicken", label: "Roast chicken", emoji: "🍗", dishes: ["Chicken noodle soup", "Chicken pot pie", "Chicken tacos"] },
      { key: "lo-cooked-ground-beef", label: "Cooked ground beef", emoji: "🥩", dishes: ["Bolognese pasta", "Stuffed peppers", "Bibimbap"] },
      { key: "lo-roast-beef-steak", label: "Roast beef / steak", emoji: "🥩", dishes: ["Beef fried rice", "Steak sandwich", "Beef hash"] },
      { key: "lo-cooked-pork", label: "Cooked pork", emoji: "🥓", dishes: ["Pork fried rice", "Pork ramen", "Pulled pork tacos"] },
      { key: "lo-cooked-salmon", label: "Cooked salmon", emoji: "🐟", dishes: ["Salmon fish cakes", "Salmon pasta"] },
      { key: "lo-cooked-shrimp", label: "Cooked shrimp", emoji: "🦐", dishes: ["Shrimp fried rice", "Shrimp tacos"] },
    ],
  },
  {
    key: "grains",
    label: "Grains & Legumes",
    emoji: "🌾",
    items: [
      { key: "lo-cooked-white-rice", label: "Cooked white rice", emoji: "🍚", dishes: ["Egg fried rice", "Arancini", "Congee", "Rice pancakes"] },
      { key: "lo-cooked-brown-rice", label: "Cooked brown rice", emoji: "🍚", dishes: ["Grain bowl", "Stuffed cabbage rolls"] },
      { key: "lo-cooked-pasta", label: "Cooked pasta", emoji: "🍝", dishes: ["Pasta frittata", "Cold pasta salad", "Baked mac & cheese"] },
      { key: "lo-cooked-quinoa", label: "Cooked quinoa", emoji: "🥣", dishes: ["Quinoa veggie burger", "Breakfast bowl"] },
      { key: "lo-cooked-lentils", label: "Cooked lentils", emoji: "🫘", dishes: ["Lentil soup", "Lentil patties"] },
      { key: "lo-cooked-chickpeas", label: "Cooked chickpeas", emoji: "🫛", dishes: ["Chickpea curry", "Roasted chickpea snack"] },
      { key: "lo-cooked-black-beans", label: "Cooked black beans", emoji: "🫘", dishes: ["Black bean tacos", "Bean & rice burrito"] },
    ],
  },
  {
    key: "vegetables",
    label: "Vegetables",
    emoji: "🥬",
    items: [
      { key: "lo-roasted-vegetables", label: "Roasted vegetables", emoji: "🥕", dishes: ["Veggie frittata", "Roasted veg soup", "Grain bowl", "Quesadilla"] },
      { key: "lo-mashed-potatoes", label: "Mashed potatoes", emoji: "🥔", dishes: ["Potato croquettes", "Potato pancakes", "Shepherd's pie topping"] },
      { key: "lo-boiled-potatoes", label: "Boiled potatoes", emoji: "🥔", dishes: ["Potato salad", "Potato hash"] },
      { key: "lo-cooked-broccoli", label: "Cooked broccoli", emoji: "🥦", dishes: ["Broccoli soup", "Broccoli cheddar quiche"] },
      { key: "lo-cooked-spinach", label: "Cooked spinach", emoji: "🥬", dishes: ["Spinach ricotta pasta", "Saag paneer"] },
      { key: "lo-sauteed-mushrooms", label: "Sautéed mushrooms", emoji: "🍄", dishes: ["Mushroom risotto", "Mushroom omelette"] },
      { key: "lo-caramelised-onions", label: "Caramelised onions", emoji: "🧅", dishes: ["French onion soup", "Onion tart"] },
      { key: "lo-cooked-corn", label: "Cooked corn", emoji: "🌽", dishes: ["Corn fritters", "Corn chowder"] },
    ],
  },
  {
    key: "bread",
    label: "Bread & Dough",
    emoji: "🍞",
    items: [
      { key: "lo-stale-bread", label: "Stale bread", emoji: "🍞", dishes: ["Panzanella", "French toast", "Bread pudding", "Croutons", "Ribollita", "Breadcrumbs"] },
      { key: "lo-leftover-pizza-dough", label: "Leftover pizza dough", emoji: "🍕", dishes: ["Calzone", "Garlic knots"] },
      { key: "lo-cooked-pizza", label: "Cooked pizza", emoji: "🍕", dishes: ["Pizza scrambled eggs"] },
      { key: "lo-stale-tortillas", label: "Tortillas (stale)", emoji: "🫓", dishes: ["Chilaquiles", "Tortilla soup"] },
      { key: "lo-day-old-croissants", label: "Croissants (day-old)", emoji: "🥐", dishes: ["Croissant bread pudding"] },
    ],
  },
  {
    key: "dairy",
    label: "Dairy & Eggs",
    emoji: "🧀",
    items: [
      { key: "lo-hard-cheese-ends", label: "Hard cheese ends", emoji: "🧀", dishes: ["Mornay sauce", "Cheese soup"] },
      { key: "lo-ricotta", label: "Ricotta", emoji: "🧀", dishes: ["Ricotta pancakes", "Stuffed pasta shells"] },
      { key: "lo-sour-cream", label: "Sour cream", emoji: "🥛", dishes: ["Sour cream muffins", "Creamy dip"] },
      { key: "lo-heavy-cream", label: "Heavy cream", emoji: "🥛", dishes: ["Churned butter", "Cream sauce pasta"] },
      { key: "lo-buttermilk", label: "Buttermilk", emoji: "🥛", dishes: ["Buttermilk pancakes", "Buttermilk fried chicken"] },
      { key: "lo-egg-yolks", label: "Egg yolks", emoji: "🥚", dishes: ["Crème brûlée", "Hollandaise"] },
      { key: "lo-egg-whites", label: "Egg whites", emoji: "🥚", dishes: ["Meringue / Pavlova", "Angel food cake"] },
    ],
  },
  {
    key: "sauces",
    label: "Sauces & Liquids",
    emoji: "🥫",
    items: [
      { key: "lo-tomato-sauce", label: "Tomato sauce", emoji: "🍅", dishes: ["Shakshuka", "Pizza sauce", "Stuffed aubergine"] },
      { key: "lo-curry-sauce", label: "Curry sauce", emoji: "🍛", dishes: ["Curry fried rice", "Curry noodle soup"] },
      { key: "lo-gravy", label: "Gravy", emoji: "🥣", dishes: ["Poutine", "Beef stew base"] },
      { key: "lo-coconut-milk", label: "Coconut milk (partial can)", emoji: "🥥", dishes: ["Coconut rice", "Coconut curry"] },
      { key: "lo-open-wine", label: "Wine (open bottle)", emoji: "🍷", dishes: ["Red wine braised beef", "Wine poached pears"] },
      { key: "lo-stock-broth", label: "Stock / broth", emoji: "🥣", dishes: ["Risotto", "Braised greens"] },
      { key: "lo-pickle-brine", label: "Pickle brine", emoji: "🥒", dishes: ["Fried chicken brine", "Dirty pickle cocktail"] },
      { key: "lo-bean-liquid", label: "Bean cooking liquid", emoji: "🫘", dishes: ["Aquafaba meringue"] },
      { key: "lo-pasta-water", label: "Pasta cooking water", emoji: "💧", dishes: ["Cacio e pepe"] },
      { key: "lo-overripe-bananas", label: "Overripe bananas", emoji: "🍌", dishes: ["Banana bread", "Banana pancakes"] },
    ],
  },
];

export const LEFTOVER_BY_KEY: Record<string, LeftoverItem> = Object.fromEntries(
  LEFTOVER_CATEGORIES.flatMap((c) => c.items.map((i) => [i.key, i])),
);
