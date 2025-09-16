// ------------------------------
// js/mealBuilder.js
// Meal and day-building logic that relies on globals provided by foods.js
// Uses: window.FOODS, window.pickPortion, window.sample, window.rand, window.uid, window.isShake
// Exposes globals: window.buildMealOrder, window.foodsForMealIndex, window.allowedTagsForSlot,
//                  window.buildMeal, window.tryBuildDay
// ------------------------------

(function () {
  // local reference to FOODS via window (keeps code compact)
  function _sample(arr) { return window.sample(arr); }
  function _rand(min, max) { return window.rand(min, max); }
  function _isShake(f) { return window.isShake(f); }
  function _pickPortion(food, forcedQty) { return window.pickPortion(food, forcedQty); }
  function _uid(prefix = '') { return window.uid(prefix); }
  const FOODS = () => window.FOODS || [];

  // ---------------------------
  // Build meal order helper (snack insertion)
  function buildMealOrder(totalMeals) {
    const base = ['breakfast', 'lunch', 'dinner'];
    let snacksToInsert = 0;

    if (totalMeals === 3) snacksToInsert = 0;
    else if (totalMeals === 4) snacksToInsert = _rand(1, 2);
    else if (totalMeals === 5) snacksToInsert = _rand(2, 3);

    let slots = ['breakfast', 'lunch', 'dinner'];
    let gaps = [];
    for (let i = 0; i <= slots.length; i++) gaps.push(i);

    while (snacksToInsert > 0 && gaps.length > 0) {
      const g = _sample(gaps);
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

  // ---------------------------
  function foodsForMealIndex(mi, totalMeals) {
    if (!window._mealOrder || window._mealOrder.length !== totalMeals) {
      window._mealOrder = buildMealOrder(totalMeals);
    }
    return [window._mealOrder[mi]];
  }

  function allowedTagsForSlot(slot) {
    switch (slot) {
      case 'breakfast': return ['breakfast', 'lunch', 'snack'];
      case 'lunch': return ['breakfast', 'lunch', 'dinner', 'snack'];
      case 'dinner': return ['lunch', 'dinner', 'snack'];
      case 'snack': return ['snack', 'breakfast', 'lunch', 'dinner'];
      default: return [];
    }
  }

  // ---------------------------
  // Build a single meal (core algorithm)
  // perMealMax: { cal, p, c, f } approximate targets
  // dailyRemaining: object mutated in-place
  // foodCounts: object mapping name -> count (cumulative across day)
  // shakesUsed: number used so far
  // preferredTags: array of tags for slot preference
  function buildMeal(perMealMax, dailyRemaining, foodCounts, shakesUsed, maxShakes, maxRepeats, preferredTags, maxItems = 3, prePlacedItems = []) {
    const mealItems = [];
    const subtotal = { cal: 0, p: 0, c: 0, f: 0 };
    const attemptsLimit = 400;
    const softMult = 1.25;
    let attempts = 0;

    const usedFoodNames = new Set();

    // insert prePlaced locked items first
    if (Array.isArray(prePlacedItems) && prePlacedItems.length) {
      for (const it of prePlacedItems) {
        if (it.kcal > dailyRemaining.cal || it.c > dailyRemaining.c || it.f > dailyRemaining.f) {
          return { mealItems: [], subtotal, foodCounts, shakesUsed, error: 'prePlaced overflow' };
        }
        mealItems.push({ ...it });
        subtotal.cal += it.kcal; subtotal.p += it.p; subtotal.c += it.c; subtotal.f += it.f;
        foodCounts[it.name] = (foodCounts[it.name] || 0) + 1;
        if (_isShake(it)) shakesUsed++;
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

      const poolPreferred = FOODS().filter(f => {
        if (foodCounts[f.name] >= maxRepeats) return false;
        if (_isShake(f) && shakesUsed >= maxShakes) return false;
        if (f.group && usedFoodNames.has(f.group)) return false;
        if (usedFoodNames.has(f.name)) return false;
        if (f.kcal > dailyRemaining.cal) return false;
        if (f.c > dailyRemaining.c) return false;
        if (f.f > dailyRemaining.f) return false;
        return Array.isArray(f.tags) && f.tags.some(t => preferredTags.includes(t));
      });

      const poolFallback = FOODS().filter(f => {
        if (foodCounts[f.name] >= maxRepeats) return false;
        if (_isShake(f) && shakesUsed >= maxShakes) return false;
        if (f.group && usedFoodNames.has(f.group)) return false;
        if (usedFoodNames.has(f.name)) return false;
        if (f.kcal > dailyRemaining.cal) return false;
        if (f.c > dailyRemaining.c) return false;
        if (f.f > dailyRemaining.f) return false;
        return true;
      });

      const pool = poolPreferred.length ? poolPreferred : poolFallback;
      if (!pool.length) break;

      const candidateFood = _sample(pool);
      let acceptedPortion = null;

      // try few portion options
      const portionTries = 5;
      for (let t = 0; t < portionTries; t++) {
        let tryPortion = null;

        if (candidateFood.portion_scalable !== undefined && candidateFood.portion_scalable !== null) {
          // attempt sequence: 1, 0.5, 1.5, 0.25, 2.0, etc (clamped & snapped)
          const preferred = [1, 0.5, 1.5, 0.25, 2.0];
          const step = Number(candidateFood.portion_scalable) || 0.25;
          let qty = preferred[t] !== undefined ? preferred[t] : 1;
          const minQ = 0.25, maxQ = 2.0;
          if (qty < minQ) qty = minQ;
          if (qty > maxQ) qty = maxQ;
          qty = Math.round(qty / step) * step;
          tryPortion = _pickPortion(candidateFood, qty);
        } else if (candidateFood.portionable && (candidateFood.min !== undefined || candidateFood.max !== undefined)) {
          const minQ = Math.max(1, Number(candidateFood.min || 1));
          const maxQ = Math.max(minQ, Number(candidateFood.max || minQ));
          const qvals = [minQ];
          if (maxQ > minQ) qvals.push(Math.min(maxQ, minQ + 1));
          if (maxQ > minQ + 1) qvals.push(maxQ);
          for (const q of qvals) {
            const p = _pickPortion({ ...candidateFood, min: q, max: q, portionable: true }, q);
            if (portionFits(p)) { tryPortion = p; break; }
          }
          if (!tryPortion) {
            const p = _pickPortion(candidateFood);
            tryPortion = portionFits(p) ? p : null;
          }
        } else {
          const p = _pickPortion(candidateFood);
          tryPortion = portionFits(p) ? p : null;
        }

        if (tryPortion) { acceptedPortion = tryPortion; break; }
      }

      if (!acceptedPortion) continue;

      mealItems.push(acceptedPortion);
      subtotal.cal += acceptedPortion.kcal; subtotal.p += acceptedPortion.p; subtotal.c += acceptedPortion.c; subtotal.f += acceptedPortion.f;
      foodCounts[acceptedPortion.name] = (foodCounts[acceptedPortion.name] || 0) + 1;
      if (_isShake(acceptedPortion)) shakesUsed++;
      if (acceptedPortion.group) usedFoodNames.add(acceptedPortion.group);
      usedFoodNames.add(acceptedPortion.name);

      dailyRemaining.cal -= acceptedPortion.kcal;
      dailyRemaining.c -= acceptedPortion.c;
      dailyRemaining.f -= acceptedPortion.f;

      if (subtotal.cal >= perMealMax.cal && subtotal.c >= perMealMax.c && subtotal.f >= perMealMax.f) break;
    }

    // fallback if empty
    if (mealItems.length === 0) {
      const viable = FOODS().slice().sort((a,b) => a.kcal - b.kcal);
      if (viable.length) {
        const smallest = viable[0];
        const portion = _pickPortion(smallest);
        if (portionFits(portion)) {
          mealItems.push(portion);
          subtotal.cal += portion.kcal; subtotal.p += portion.p; subtotal.c += portion.c; subtotal.f += portion.f;
          foodCounts[portion.name] = (foodCounts[portion.name] || 0) + 1;
          if (_isShake(portion)) shakesUsed++;
          dailyRemaining.cal -= portion.kcal;
          dailyRemaining.c -= portion.c;
          dailyRemaining.f -= portion.f;
        }
      }
    }

    return { mealItems, subtotal, foodCounts, shakesUsed };
  }

  // ---------------------------
  // tryBuildDay
  function tryBuildDay(opts) {
    const {
      mealCount,
      calMin, calMax,
      pMin, pMax,
      cMin, cMax,
      fMin, fMax,
      maxShakes = 2,
      maxRepeats = 1,
      seededLocked = {},
      maxAttempts = 1200,
    } = opts;
  
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
          p: (pMax && pMax > 0) ? (pMax / mealCount) : 0,
          c: Math.max(0.1, dailyRemaining.c / remainingMeals),
          f: Math.max(0.1, dailyRemaining.f / remainingMeals),
        };
  
        const prePlaced = (seededLocked.mealsByIndex && seededLocked.mealsByIndex[mi]) 
          ? seededLocked.mealsByIndex[mi] 
          : [];
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
  
      const totals = meals.reduce((acc, meal) => {
        const mcal = meal.items.reduce((s, f) => s + (f.kcal || 0), 0);
        const mp = meal.items.reduce((s, f) => s + (f.p || 0), 0);
        const mc = meal.items.reduce((s, f) => s + (f.c || 0), 0);
        const mf = meal.items.reduce((s, f) => s + (f.f || 0), 0);
        return { cal: acc.cal + mcal, p: acc.p + mp, c: acc.c + mc, f: acc.f + mf };
      }, { cal: 0, p: 0, c: 0, f: 0 });
  
      if (totals.cal <= calMax && totals.c <= cMax && totals.f <= fMax) {
        if (totals.cal >= calMin && totals.p >= pMin && totals.c >= cMin && totals.f >= fMin) {
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
  
// Rebuild Meal
function rebuildMeal(plan, mealIndex, opts, locks) {
  if (!plan || !plan.meals || !plan.meals[mealIndex]) return plan;

  // Clone existing plan so we don’t mutate directly
  const newPlan = JSON.parse(JSON.stringify(plan));

  // Remaining macros excluding the target meal
  const totalsExcluding = newPlan.meals.reduce((acc, meal, i) => {
    if (i === mealIndex) return acc;
    acc.cal += meal.items.reduce((s, f) => s + (f.kcal || 0), 0);
    acc.p   += meal.items.reduce((s, f) => s + (f.p || 0), 0);
    acc.c   += meal.items.reduce((s, f) => s + (f.c || 0), 0);
    acc.f   += meal.items.reduce((s, f) => s + (f.f || 0), 0);
    return acc;
  }, { cal: 0, p: 0, c: 0, f: 0 });

  const dailyRemaining = {
    cal: opts.calMax - totalsExcluding.cal,
    c:   opts.cMax - totalsExcluding.c,
    f:   opts.fMax - totalsExcluding.f,
  };

  const perMealMax = {
    cal: dailyRemaining.cal,
    p:   (opts.pMax / opts.mealCount),
    c:   dailyRemaining.c,
    f:   dailyRemaining.f,
  };

  const prePlaced = (locks.mealsByIndex && locks.mealsByIndex[mealIndex]) 
    ? locks.mealsByIndex[mealIndex] 
    : [];

  const preferredTags = foodsForMealIndex(mealIndex, newPlan.mealCount);

  const { mealItems, subtotal } = buildMeal(
    perMealMax, dailyRemaining, {}, 0,
    opts.maxShakes, opts.maxRepeats,
    preferredTags, 3, prePlaced
  );

  if (mealItems && mealItems.length) {
    newPlan.meals[mealIndex] = { items: mealItems, subtotal };
    newPlan.totals = newPlan.meals.reduce((acc, m) => {
      acc.cal += m.items.reduce((s, f) => s + (f.kcal || 0), 0);
      acc.p   += m.items.reduce((s, f) => s + (f.p || 0), 0);
      acc.c   += m.items.reduce((s, f) => s + (f.c || 0), 0);
      acc.f   += m.items.reduce((s, f) => s + (f.f || 0), 0);
      return acc;
    }, { cal: 0, p: 0, c: 0, f: 0 });
  }

  return newPlan;
}

window.rebuildMeal = rebuildMeal;

  // expose
  window.buildMealOrder = buildMealOrder;
  window.foodsForMealIndex = foodsForMealIndex;
  window.allowedTagsForSlot = allowedTagsForSlot;
  window.buildMeal = buildMeal;
  window.tryBuildDay = tryBuildDay;
})();

