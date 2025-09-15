// mealBuilder.js
import { getFoods, pickPortion, sample } from "./foods.js";

let UID_COUNTER = 1;
function uid() {
  return "f" + UID_COUNTER++;
}

// ---------------------------
// Build a single meal
function buildMeal(options = {}) {
  const foods = getFoods();
  const count = options.count || 2 + Math.floor(Math.random() * 2); // 2–3 items
  const meal = { items: [] };

  for (let i = 0; i < count; i++) {
    const f = pickPortion(sample(foods));
    if (f) {
      f._uid = uid();
      f.label = `${f.name} ${f.qty}${f.unit || ""}`;
      meal.items.push(f);
    }
  }
  return meal;
}

// ---------------------------
// Build a whole day
export function tryBuildDay(arg1, arg2, arg3, arg4) {
  let mealCount, options;
  if (typeof arg1 === "object") {
    // called like tryBuildDay({ mealCount, targets, ... })
    options = arg1;
    mealCount = options.mealCount || 4;
  } else {
    // called like tryBuildDay(mealCount, targets, maxShakes, maxRepeats)
    mealCount = arg1 || 4;
    options = { mealCount, targets: arg2, maxShakes: arg3, maxRepeats: arg4 };
  }

  const plan = { mealCount, meals: [] };

  for (let i = 0; i < mealCount; i++) {
    plan.meals.push(buildMeal({}));
  }

  return plan;
}
