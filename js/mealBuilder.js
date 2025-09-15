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
export function tryBuildDay(options = {}) {
  const mealCount = options.mealCount || 4;
  const plan = { mealCount, meals: [] };

  for (let i = 0; i < mealCount; i++) {
    plan.meals.push(buildMeal({}));
  }

  return plan;
}
