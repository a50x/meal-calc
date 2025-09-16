// mealBuilder.js
// Exposes: pickPortion, buildMealOrder, foodsForMealIndex, allowedTagsForSlot, buildMeal, tryBuildDay
// Relies on globals: FOODS, uid, rand, sample, isShake, LOCKS (present in foods.js / global context)

// ------------------------------
// Portioning (flexible, supports portion_scalable)
// Global min multiplier = 0.25, max multiplier = 2.0
// portion_scalable (if present) is the step size (e.g. 0.25)
// If the food lacks portion_scalable but has integer min/max we fall back to whole-number portioning
// Each produced item has base metrics (base_kcal,p,c,f) and multiplier qty so it can be adjusted later.
function pickPortion(food, forcedQty = null) {
  if (!food) return null;

  const baseKcal = Number(food.kcal || 0);
  const baseP = Number(food.p || 0);
  const baseC = Number(food.c || 0);
  const baseF = Number(food.f || 0);

  // decide quantity
  let qty = 1;

  // if forcedQty provided (used when regenerating with same unit)
  if (forcedQty !== null && forcedQty !== undefined) {
    qty = forcedQty;
  } else if (food.portion_scalable !== undefined && food.portion_scalable !== null) {
    // scalable step
    const step = Number(food.portion_scalable) || 0.25;
    const minQ = 0.25;
    const maxQ = 2.0;
    // build allowed values
    const values = [];
    for (let v = minQ; v <= maxQ + 1e-9; v = +(v + step).toFixed(6)) values.push(+v.toFixed(6));
    // prefer 1.0 if available; otherwise random sample
    qty = values[rand(0, values.length - 1)];
  } else if (food.portionable && (food.min !== undefined || food.max !== undefined)) {
    // legacy integer portionable support
    const minQInt = Math.max(1, Number(food.min || 1));
    const maxQInt = Math.max(minQInt, Number(food.max || minQInt));
    qty = rand(minQInt, maxQInt);
  } else {
    qty = 1;
  }

  const item = {
    ...food,
    _uid: uid('i'),
    qty: qty,
    base_kcal: baseKcal,
    base_p: baseP,
    base_c: baseC,
    base_f: baseF,
    kcal: baseKcal * qty,
    p: baseP * qty,
    c: baseC * qty,
    f: baseF * qty,
    label: (food.portionable || food.portion_scalable) ? `${food.name} x${qty}${food.unit ? ' ' + food.unit + (qty>1?'s':'') : ''}` : food.name
  };

  return item;
}

// ------------------------------
// Meal Order helpers
function buildMealOrder(totalMeals) {
  const base = ['breakfast', 'lunch', 'dinner'];
  let snacksToInsert = 0;

  if (totalMeals === 3) snacksToInsert = 0;
  else if (totalMeals === 4) snacksToInsert = rand(1, 2);
  else if (totalMeals === 5) snacksToInsert = rand(2, 3);

  let slots = ['breakfast', 'lunch', 'dinner'];

  // gaps 0..slots.length for insertion
  let gaps = [];
  for (let i = 0; i <= slots.length; i++) gaps.push(i);

  while (snacksToInsert > 0 && gaps.length > 0) {
    const g = sample(gaps);
    if ((g > 0 && slots[g - 1] === 'snack') || (g < slots.length && slots[g] === 'snack')) {
      gaps = gaps.filter(x => x !== g);
      continue;
    }
    slots.splice(g, 0, 'snack');
    snacksToInsert--;
    gaps = [];
    for (let i = 0; i <= slots.length; i++) gaps.push(i);
  }

  return slots;
}

function foodsForMealIndex(mi, totalMeals) {
  if (!window._mealOrder || window._mealOrder.length !== totalMeals) {
    window._mealOrder = buildMealOrder(totalMeals);
  }
  return [window._mealOrder[mi]];
}

function allowedTagsForSlot(slot) {
  switch (slot) {
    case 'breakfast':
      return ['breakfast', 'lunch', 'snack'];
    case 'lunch':
      return ['breakfast', 'lunch', 'dinner', 'snack'];
    case 'dinner':
      return ['lunch', 'dinner', 'snack'];
    case 'snack':
      return ['snack', 'breakfast', 'lunch', 'dinner'];
    default:
      return [];
  }
}

// ------------------------------
// Meal Builder
// - ensures no duplicate food by name inside same meal
// - respects dailyRemaining and perMeal soft caps
// - respects shakes and maxRepeats across entire day (caller must pass appropriate values)
// - lockedItems may be preplaced inside meal (they are inserted first)
function buildMeal(perMealMax, dailyRemaining, foodCounts, shakesUsed, maxShakes, maxRepeats, preferredTags, maxItems = 3, prePlacedItems = []) {
  const mealItems = [];
  const subtotal = { cal: 0, p: 0, c: 0, f: 0 };
  const attemptsLimit = 400;
  const softMult = 1.25;
  let attempts = 0;

  // Track used food names inside this meal to avoid duplicates
  const usedFoodNames = new Set();

  // Insert pre-placed (locked) items first
  if (Array.isArray(prePlacedItems) && prePlacedItems.length) {
    for (const it of prePlacedItems) {
      // prePlaced items are expected to have qty and base metrics already
      if (it.kcal > dailyRemaining.cal || it.c > dailyRemaining.c || it.f > dailyRemaining.f) {
        return { mealItems: [], subtotal, foodCounts, shakesUsed, error: 'prePlaced overflow' };
      }
      mealItems.push(it);
      subtotal.cal += it.kcal; subtotal.p += it.p; subtotal.c += it.c; subtotal.f += it.f;
      foodCounts[it.name] = (foodCounts[it.name] || 0) + 1;
      if (isShake(it)) shakesUsed++;
      if (it.group) usedFoodNames.add(it.group);
      usedFoodNames.add(it.name);
      dailyRemaining.cal -= it.kcal;
      dailyRemaining.c -= it.c;
      dailyRemaining.f -= it.f;
    }
  }

  function portionFits(portion) {
    if (!portion) return false;
    if (portion.kcal > dailyRemaining.cal) return false;
    if (portion.c > dailyRemaining.c) return false;
    if (portion.f > dailyRemaining.f) return false;
    if (portion.kcal > perMealMax.cal * softMult) return false;
    if (portion.c > perMealMax.c * softMult) return false;
    if (portion.f > perMealMax.f * softMult) return false;
    return true;
  }

  while (attempts < attemptsLimit && mealItems.length < maxItems) {
    attempts++;

    // Preferred pool (matching tags)
    const preferredPool = FOODS.filter(f => {
      if (foodCounts[f.name] >= maxRepeats) return false;
      if (isShake(f) && shakesUsed >= maxShakes) return false;
      if (f.group && usedFoodNames.has(f.group)) return false;
      if (usedFoodNames.has(f.name)) return false; // prevent duplicate inside same meal
      // check base metrics smaller than remaining daily caps
      if (f.kcal > dailyRemaining.cal) return false;
      if (f.c > dailyRemaining.c) return false;
      if (f.f > dailyRemaining.f) return false;
      return Array.isArray(f.tags) && f.tags.some(t => preferredTags.includes(t));
    });

    const fallbackPool = FOODS.filter(f => {
      if (foodCounts[f.name] >= maxRepeats) return false;
      if (isShake(f) && shakesUsed >= maxShakes) return false;
      if (f.group && usedFoodNames.has(f.group)) return false;
      if (usedFoodNames.has(f.name)) return false;
      if (f.kcal > dailyRemaining.cal) return false;
      if (f.c > dailyRemaining.c) return false;
      if (f.f > dailyRemaining.f) return false;
      return true;
    });

    const pool = preferredPool.length ? preferredPool : fallbackPool;
    if (!pool.length) break;

    const candidateFood = sample(pool);
    let acceptedPortion = null;

    // When portion_scalable exists, try a few reasonable qty options (prioritize 1.0, then smaller/larger)
    const portionTries = 5;
    for (let t = 0; t < portionTries; t++) {
      let tryPortion = null;
      if (candidateFood.portion_scalable !== undefined && candidateFood.portion_scalable !== null) {
        // try preferred sequence: 1.0, then 0.5, 1.5, 0.25, 2.0 (bounded)
        const preferred = [1, 0.5, 1.5, 0.25, 2.0];
        const step = Number(candidateFood.portion_scalable) || 0.25;
        let qty = preferred[t] !== undefined ? preferred[t] : 1;
        // clamp & snap to step
        const minQ = 0.25, maxQ = 2.0;
        if (qty < minQ) qty = minQ;
        if (qty > maxQ) qty = maxQ;
        // snap to step
        qty = Math.round(qty / step) * step;
        tryPortion = pickPortion(candidateFood, qty);
      } else if (candidateFood.portionable && (candidateFood.min !== undefined || candidateFood.max !== undefined)) {
        // try integer values
        const minQ = Math.max(1, Number(candidateFood.min || 1));
        const maxQ = Math.max(minQ, Number(candidateFood.max || minQ));
        const qvals = [minQ];
        if (maxQ > minQ) qvals.push(Math.min(maxQ, minQ + 1));
        if (maxQ > minQ + 1) qvals.push(maxQ);
        // try each
        for (const q of qvals) {
          const p = pickPortion({ ...candidateFood, min: q, max: q, portionable: true }, q);
          if (portionFits(p)) { tryPortion = p; break; }
        }
        if (!tryPortion) {
          const p = pickPortion(candidateFood);
          tryPortion = portionFits(p) ? p : null;
        }
      } else {
        const p = pickPortion(candidateFood);
        tryPortion = portionFits(p) ? p : null;
      }

      if (tryPortion) { acceptedPortion = tryPortion; break; }
    }

    if (!acceptedPortion) continue;

    mealItems.push(acceptedPortion);
    subtotal.cal += acceptedPortion.kcal; subtotal.p += acceptedPortion.p; subtotal.c += acceptedPortion.c; subtotal.f += acceptedPortion.f;
    foodCounts[acceptedPortion.name] = (foodCounts[acceptedPortion.name] || 0) + 1;
    if (isShake(acceptedPortion)) shakesUsed++;
    if (acceptedPortion.group) usedFoodNames.add(acceptedPortion.group);
    usedFoodNames.add(acceptedPortion.name);

    dailyRemaining.cal -= acceptedPortion.kcal;
    dailyRemaining.c -= acceptedPortion.c;
    dailyRemaining.f -= acceptedPortion.f;

    // stop if meal is reasonably full
    if (subtotal.cal >= perMealMax.cal && subtotal.c >= perMealMax.c && subtotal.f >= perMealMax.f) break;
  }

  // fallback: if meal ended with nothing, try smallest viable (no duplication)
  if (mealItems.length === 0) {
    const viable = FOODS.filter(f => {
      if (f.group && false) return false; // keep for future group logic
      // can't repeat in same meal
      return true;
    }).sort((a,b)=>a.kcal - b.kcal);

    if (viable.length) {
      const smallest = viable[0];
      const portion = pickPortion(smallest);
      if (portionFits(portion)) {
        mealItems.push(portion);
        subtotal.cal += portion.kcal; subtotal.p += portion.p; subtotal.c += portion.c; subtotal.f += portion.f;
        foodCounts[portion.name] = (foodCounts[portion.name] || 0) + 1;
        if (isShake(portion)) shakesUsed++;
        if (portion.group) {} // ignore
        dailyRemaining.cal -= portion.kcal;
        dailyRemaining.c -= portion.c;
        dailyRemaining.f -= portion.f;
      }
    }
  }

  return { mealItems, subtotal, foodCounts, shakesUsed };
}

// ------------------------------
// tryBuildDay (same general algorithm as original, but hooks into new pickPortion & buildMeal)
// Accepts seededLocked same as original. Keeps maxRepeats and maxShakes handling.
// Returns best plan or null
function tryBuildDay(mealCount, targets, maxShakes, maxRepeats, seededLocked = {}, maxAttempts = 1200) {
  const calMin = targets.calMin, calMax = targets.calMax;
  const cMax = targets.cMax, fMax = targets.fMax, pMin = targets.pMin;

  let bestWithinCaps = null;
  let bestWithinCapsProtein = -Infinity;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const foodCounts = {};
    let shakesUsed = 0;
    const dailyRemaining = { cal: calMax, c: cMax, f: fMax };

    const meals = [];
    let failed = false;

    for (let mi = 0; mi < mealCount; mi++) {
      const remainingMeals = mealCount - mi;
      const perMealMax = {
        cal: Math.max(1, dailyRemaining.cal / remainingMeals),
        p: (targets.pMax && targets.pMax > 0) ? (targets.pMax / mealCount) : 0,
        c: Math.max(0.1, dailyRemaining.c / remainingMeals),
        f: Math.max(0.1, dailyRemaining.f / remainingMeals)
      };

      // prePlaced for this meal index (if any)
      const prePlaced = (seededLocked && seededLocked.mealsByIndex && seededLocked.mealsByIndex[mi]) ? seededLocked.mealsByIndex[mi] : [];

      const preferredTags = foodsForMealIndex(mi, mealCount) || [];

      const { mealItems, subtotal, foodCounts: newCounts, shakesUsed: newShakes, error } =
        buildMeal(perMealMax, dailyRemaining, foodCounts, shakesUsed, maxShakes, maxRepeats, preferredTags, 3, prePlaced);

      if (error || !mealItems || mealItems.length === 0) {
        failed = true;
        break;
      }

      for (const k in newCounts) foodCounts[k] = newCounts[k];
      shakesUsed = newShakes;
      meals.push({ items: mealItems });
    }

    if (failed) continue;

    // compute totals
    const totals = meals.reduce((acc, meal) => {
      const mcal = meal.items.reduce((s, f) => s + (f.kcal || 0), 0);
      const mp = meal.items.reduce((s, f) => s + (f.p || 0), 0);
      const mc = meal.items.reduce((s, f) => s + (f.c || 0), 0);
      const mf = meal.items.reduce((s, f) => s + (f.f || 0), 0);
      return { cal: acc.cal + mcal, p: acc.p + mp, c: acc.c + mc, f: acc.f + mf };
    }, { cal: 0, p: 0, c: 0, f: 0 });

    // Validate caps
    if (totals.cal <= calMax && totals.c <= cMax && totals.f <= fMax) {
      if (totals.cal >= calMin && totals.p >= pMin && totals.c >= targets.cMin && totals.f >= targets.fMin) {
        return { meals, totals, mealCount };
      }
      if (totals.p > bestWithinCapsProtein) {
        bestWithinCapsProtein = totals.p;
        bestWithinCaps = { meals, totals, mealCount };
      }
    }
  }

  if (bestWithinCaps) return bestWithinCaps;
  return null;
}
