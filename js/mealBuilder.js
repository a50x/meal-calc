// mealBuilder.js — handles meal/day building logic
import { rand, clamp, pickPortion } from "./foods.js";

// --- Meal order ---
function buildMealOrder() {
  return ["breakfast", "lunch", "snack", "dinner"];
}

// --- Foods by meal type ---
function foodsForMealIndex(foods, mealType) {
  return foods.filter(f => f.tags && f.tags.includes(mealType));
}

// --- Meal builder ---
function buildMeal(foods, mealType) {
  const pool = foodsForMealIndex(foods, mealType);
  if (!pool.length) return [];

  const meal = [];
  const chosen = rand(pool);
  const portion = pickPortion(chosen);

  meal.push({
    ...chosen,
    qty: portion.qty,
    unit: portion.unit,
  });

  return meal;
}

// --- Day builder with retries ---
function tryBuildDay(foods, tries = 10) {
  for (let i = 0; i < tries; i++) {
    const plan = {};
    let ok = true;

    for (const mealType of buildMealOrder()) {
      const meal = buildMeal(foods, mealType);
      if (!meal.length) {
        ok = false;
        break;
      }
      plan[mealType] = meal;
    }

    if (ok) return plan;
  }
  return null;
}

export { buildMealOrder, foodsForMealIndex, buildMeal, tryBuildDay };
