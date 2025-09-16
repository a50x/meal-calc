// mealBuilder.js — meal + day construction logic

let LOCKS = { foods: {}, meals: {} };

function buildMealOrder(totalMeals) {
  if (totalMeals === 3) return ['breakfast', 'lunch', 'dinner'];
  if (totalMeals === 4) return ['breakfast', 'snack', 'lunch', 'dinner'];
  if (totalMeals === 5) return ['breakfast', 'snack', 'lunch', 'snack', 'dinner'];
  return ['meal1','meal2','meal3','meal4','meal5','meal6'];
}

function foodsForMealIndex(mi, totalMeals) {
  return buildMealOrder(totalMeals)[mi];
}

function allowedTagsForSlot(slot) {
  if (slot === 'breakfast') return ['breakfast','snack','any'];
  if (slot === 'snack') return ['snack','breakfast','any'];
  if (slot === 'lunch') return ['lunch','dinner','any'];
  if (slot === 'dinner') return ['dinner','lunch','any'];
  return ['any'];
}

// Build a single meal
function buildMeal(slot, mealIndex, totalMeals, targets, caps, lockedItems) {
  const items = [...lockedItems];
  let kcal = items.reduce((s,it)=>s+it.kcal,0);
  let p = items.reduce((s,it)=>s+it.p,0);
  let c = items.reduce((s,it)=>s+it.c,0);
  let f = items.reduce((s,it)=>s+it.f,0);

  const maxIter = 50;
  for (let iter=0; iter<maxIter; iter++) {
    if (kcal > caps.mealKcalMax) break;
    if (items.length >= caps.mealSizeMax) break;
    if (items.filter(isShake).length >= caps.shakesPerMealMax) break;

    const slotTags = allowedTagsForSlot(slot);
    let candidates = FOODS.filter(fd => fd.tags.some(t => slotTags.includes(t)) || fd.tags.includes('any'));
    if (!candidates.length) candidates = FOODS;

    const chosen = sample(candidates);
    const portion = pickPortion(chosen);

    // skip if would exceed caps
    if (kcal + portion.kcal > caps.dayKcalMax) continue;
    if (c + portion.c > caps.dayCarbMax) continue;
    if (f + portion.f > caps.dayFatMax) continue;

    items.push(portion);
    kcal += portion.kcal; p += portion.p; c += portion.c; f += portion.f;
  }

  return { items, subtotal: { kcal, p, c, f } };
}

// Build whole day
function tryBuildDay(targets, caps, totalMeals=4, maxAttempts=200) {
  let best = null, bestDiff = Infinity;

  for (let attempt=0; attempt<maxAttempts; attempt++) {
    let plan = { meals: [], totals: { kcal:0,p:0,c:0,f:0 } };
    let slots = buildMealOrder(totalMeals);
    let valid = true;

    for (let mi=0; mi<slots.length; mi++) {
      const slot = slots[mi];
      const mealId = uid('m');
      const locked = Object.values(LOCKS.foods).filter(it => it.slot===slot);
      const meal = buildMeal(slot, mi, totalMeals, targets, caps, locked);
      meal.id = mealId; meal.slot = slot;
      plan.meals.push(meal);
      plan.totals.kcal += meal.subtotal.kcal;
      plan.totals.p += meal.subtotal.p;
      plan.totals.c += meal.subtotal.c;
      plan.totals.f += meal.subtotal.f;
    }

    if (plan.totals.kcal < targets.kcalMin || plan.totals.kcal > targets.kcalMax) valid = false;
    if (plan.totals.c > caps.dayCarbMax || plan.totals.f > caps.dayFatMax) valid = false;
    if (plan.totals.p < targets.proteinMin) valid = false;

    const diff = Math.abs(plan.totals.kcal - targets.kcalTarget);
    if (valid && diff < bestDiff) { best = plan; bestDiff = diff; }
  }
  return best;
}
