// mealBuilder.js
import { getFoods, pickPortion, sample, isShake } from "./foods.js";

// ---------------------------
// Meal sequencing helpers
export function buildMealOrder(mealCount) {
  if (mealCount === "optimal") {
    const options = [3, 4, 5];
    mealCount = options[Math.floor(Math.random() * options.length)];
  }
  return Array.from({ length: mealCount }, (_, i) => i);
}

export function foodsForMealIndex(mi, mealCount) {
  if (mealCount === 3) {
    if (mi === 0) return ["breakfast"];
    if (mi === 1) return ["lunch"];
    if (mi === 2) return ["dinner"];
  }
  if (mealCount === 4) {
    if (mi === 0) return ["breakfast"];
    if (mi === 1) return ["lunch"];
    if (mi === 2) return ["snack"];
    if (mi === 3) return ["dinner"];
  }
  if (mealCount === 5) {
    if (mi === 0) return ["breakfast"];
    if (mi === 1) return ["lunch"];
    if (mi === 2) return ["snack"];
    if (mi === 3) return ["dinner"];
    if (mi === 4) return ["snack"];
  }
  return [];
}

// ---------------------------
// Build a single meal
export function buildMeal(
  perMealMax,
  remaining,
  foodCounts,
  shakesUsed,
  maxShakes,
  maxRepeats,
  preferredTags,
  maxItems = 3,
  preplacedItems = []
) {
  const FOODS = getFoods();
  const mealItems = [...preplacedItems];

  for (let attempt = 0; attempt < 50 && mealItems.length < maxItems; attempt++) {
    const candidateBase = sample(
      FOODS.filter((f) => {
        if (maxRepeats > 0 && foodCounts[f.id] >= maxRepeats) return false;
        if (isShake(f) && shakesUsed >= maxShakes) return false;
        if (
          preferredTags.length &&
          (!Array.isArray(f.tags) || !f.tags.some((t) => preferredTags.includes(t)))
        )
          return false;
        return true;
      })
    );
    if (!candidateBase) break;
    const candidate = pickP
