// ------------------------------
// Portioning
// ------------------------------
function pickPortion(food) {
  const qty = food.portionable ? rand(food.min, food.max) : 1;
  return {
    ...food,
    qty,
    kcal: food.kcal * qty,
    p: food.p * qty,
    c: food.c * qty,
    f: food.f * qty,
    _uid: uid("i"),
  };
}

// ------------------------------
// Meal Order
// ------------------------------
function buildMealOrder(totalMeals) {
  if (totalMeals <= 3) return ["breakfast", "lunch", "dinner"];
  if (totalMeals === 4) return ["breakfast", "snack", "lunch", "dinner"];
  if (totalMeals === 5) return ["breakfast", "snack", "lunch", "snack", "dinner"];
  return Array(totalMeals).fill("meal");
}

function foodsForMealIndex(mi, totalMeals) {
  return buildMealOrder(totalMeals)[mi];
}

function allowedTagsForSlot(slot) {
  if (slot === "breakfast") return ["breakfast", "any"];
  if (slot === "lunch" || slot === "dinner") return ["lunch", "dinner", "any"];
  if (slot === "snack") return ["snack", "any"];
  return ["any"];
}

// ------------------------------
// Meal Builder
// ------------------------------
function buildMeal(opts, slot, remaining, lockedItems) {
  let items = [...lockedItems];
  let subtotal = { kcal: 0, p: 0, c: 0, f: 0 };

  items.forEach((it) => {
    subtotal.kcal += it.kcal;
    subtotal.p += it.p;
    subtotal.c += it.c;
    subtotal.f += it.f;
  });

  const tags = allowedTagsForSlot(slot);
  let attempts = 0;

  while (attempts < 200 && subtotal.kcal < opts.perMealKcalMax) {
    const candidates = window.FOODS.filter((f) =>
      f.tags.some((t) => tags.includes(t))
    );
    const food = sample(candidates);
    if (!food) break;

    const portion = pickPortion(food);

    if (
      subtotal.kcal + portion.kcal > opts.perMealKcalMax ||
      subtotal.c + portion.c > opts.perMealCarbMax ||
      subtotal.f + portion.f > opts.perMealFatMax
    ) {
      attempts++;
      continue;
    }

    items.push(portion);
    subtotal.kcal += portion.kcal;
    subtotal.p += portion.p;
    subtotal.c += portion.c;
    subtotal.f += portion.f;

    attempts++;
  }

  return { items, subtotal };
}

// ------------------------------
// Day Builder
// ------------------------------
function tryBuildDay(opts) {
  let bestPlan = null;

  for (let attempt = 0; attempt < opts.maxAttempts; attempt++) {
    const mealOrder = buildMealOrder(opts.totalMeals);
    let meals = [];
    let totals = { kcal: 0, p: 0, c: 0, f: 0 };

    for (let mi = 0; mi < mealOrder.length; mi++) {
      const slot = mealOrder[mi];
      const lockedItems = (window.LOCKS.meals[slot] || []).map((id) =>
        window._lastPlan?.allItems.find((it) => it._uid === id)
      ).filter(Boolean);

      const { items, subtotal } = buildMeal(opts, slot, totals, lockedItems);

      meals.push({ id: uid("m"), slot, items, subtotal });

      totals.kcal += subtotal.kcal;
      totals.p += subtotal.p;
      totals.c += subtotal.c;
      totals.f += subtotal.f;
    }

    if (
      totals.kcal >= opts.totalKcalMin &&
      totals.kcal <= opts.totalKcalMax &&
      totals.p >= opts.totalProteinMin &&
      totals.c <= opts.totalCarbMax &&
      totals.f <= opts.totalFatMax
    ) {
      bestPlan = { meals, totals };
      break;
    }
  }

  return bestPlan;
}
