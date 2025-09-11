// ---------------------------
// Meal tag ordering logic
// ---------------------------
const MEAL_TAG_ORDER = ['breakfast', 'lunch', 'dinner', 'snack', 'shake']; // priority for meal placement

function foodsForMealIndex(mealIndex, totalMeals) {
  // Map meal index to a "likely tag"
  if (totalMeals === 3) {
    if (mealIndex === 0) return ['breakfast'];
    if (mealIndex === 1) return ['lunch'];
    if (mealIndex === 2) return ['dinner'];
  } else if (totalMeals === 4) {
    if (mealIndex === 0) return ['breakfast'];
    if (mealIndex === 1) return ['lunch'];
    if (mealIndex === 2) return ['snack', 'shake'];
    if (mealIndex === 3) return ['dinner'];
  } else if (totalMeals === 5) {
    if (mealIndex === 0) return ['breakfast'];
    if (mealIndex === 1) return ['snack', 'shake'];
    if (mealIndex === 2) return ['lunch'];
    if (mealIndex === 3) return ['snack', 'shake'];
    if (mealIndex === 4) return ['dinner'];
  }
  return []; // fallback: any food
}

// ---------------------------
// Candidate builder (updated for tags)
// ---------------------------
function buildCandidate(mealsWanted, foods, maxShakes, maxRepeats) {
  const candidate = { meals: [], totals: { cal: 0, p: 0, c: 0, f: 0 } };
  let shakesUsed = 0;
  const foodCounts = {};

  for (let m = 0; m < mealsWanted; m++) {
    const meal = { items: [] };
    const numItems = rand(2, 3); // 2–3 foods per meal
    const preferredTags = foodsForMealIndex(m, mealsWanted);

    for (let i = 0; i < numItems; i++) {
      let food, attempts = 0;

      do {
        // sample foods matching preferred tags first
        const taggedFoods = preferredTags.length
          ? foods.filter(f => f.tags.some(t => preferredTags.includes(t)))
          : foods;
        food = pickPortion(sample(taggedFoods.length ? taggedFoods : foods));
        attempts++;

        // enforce shake cap
        if (isShake(food) && shakesUsed >= maxShakes) continue;

        // enforce repeat cap
        if (foodCounts[food.name] >= maxRepeats) continue;

        break;
      } while (attempts < 50);

      if (attempts >= 50) continue;

      meal.items.push(food);

      // update counters
      if (isShake(food)) shakesUsed++;
      foodCounts[food.name] = (foodCounts[food.name] || 0) + 1;

      candidate.totals.cal += food.kcal;
      candidate.totals.p += food.p;
      candidate.totals.c += food.c;
      candidate.totals.f += food.f;
    }

    candidate.meals.push(meal);
  }

  return candidate;
}
