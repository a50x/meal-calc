// js/mealBuilder.js
// Meal and day-building logic that relies on globals provided by foods.js
// Uses: window.FOODS, window.pickPortion, window.sample, window.rand, window.uid, window.isShake
// Exposes globals: window.buildMealOrder, window.foodsForMealIndex, window.allowedTagsForSlot,
//                  window.buildMeal, window.tryBuildDay, window.rebuildMeal,
//                  window.regenMeal, window.regenFood
// ------------------------------

(function () {
  // Local wrappers for globals
  function _sample(arr) { return window.sample(arr); }
  function _rand(min, max) { return window.rand(min, max); }
  function _isShake(f) { return window.isShake(f); }
  function _pickPortion(food, forcedQty) { return window.pickPortion(food, forcedQty); }
  function _uid(prefix = '') { return window.uid(prefix); }
  const FOODS = () => window.FOODS || [];

  // ---------------------------
  function buildMealOrder(totalMeals) {
    const base = ['breakfast', 'lunch', 'dinner'];
    let snacksToInsert = 0;
    if (totalMeals === 4) snacksToInsert = _rand(1, 2);
    else if (totalMeals === 5) snacksToInsert = _rand(2, 3);

    let slots = ['breakfast', 'lunch', 'dinner'];
    let gaps = Array.from({ length: slots.length + 1 }, (_, i) => i);

    while (snacksToInsert > 0 && gaps.length > 0) {
      const g = _sample(gaps);
      if ((g > 0 && slots[g - 1] === 'snack') || (g < slots.length && slots[g] === 'snack')) {
        gaps = gaps.filter(x => x !== g);
        continue;
      }
      slots.splice(g, 0, 'snack');
      snacksToInsert--;
      gaps = Array.from({ length: slots.length + 1 }, (_, i) => i);
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
      case 'breakfast': return ['breakfast', 'lunch', 'snack'];
      case 'lunch': return ['breakfast', 'lunch', 'dinner', 'snack'];
      case 'dinner': return ['lunch', 'dinner', 'snack'];
      case 'snack': return ['snack', 'breakfast', 'lunch', 'dinner'];
      default: return [];
    }
  }

  // ---------------------------
  function buildMeal(perMealMax, dailyRemaining, foodCounts, shakesUsed, maxShakes, maxRepeats, preferredTags, maxItems = 3, prePlacedItems = []) {
    const mealItems = [];
    const subtotal = { cal: 0, p: 0, c: 0, f: 0 };
    const attemptsLimit = 400;
    const softMult = 1.25;
    let attempts = 0;

    const usedFoodNames = new Set();

    // Insert prePlaced (locked) items
    if (Array.isArray(prePlacedItems) && prePlacedItems.length) {
      for (const it of prePlacedItems) {
        const copy = { ...it };
        copy.qty = copy.qty ?? 1;
        copy.base_kcal = copy.base_kcal ?? (Number(copy.kcal || 0) / copy.qty);
        copy.base_p = copy.base_p ?? (Number(copy.p || 0) / copy.qty);
        copy.base_c = copy.base_c ?? (Number(copy.c || 0) / copy.qty);
        copy.base_f = copy.base_f ?? (Number(copy.f || 0) / copy.qty);
        copy.kcal = copy.base_kcal * copy.qty;
        copy.p = copy.base_p * copy.qty;
        copy.c = copy.base_c * copy.qty;
        copy.f = copy.base_f * copy.qty;

        mealItems.push(copy);
        subtotal.cal += copy.kcal; subtotal.p += copy.p; subtotal.c += copy.c; subtotal.f += copy.f;
        foodCounts[copy.name] = (foodCounts[copy.name] || 0) + 1;
        if (_isShake(copy)) shakesUsed++;
        if (copy.group) usedFoodNames.add(copy.group);
        usedFoodNames.add(copy.name);
        dailyRemaining.cal -= copy.kcal;
        dailyRemaining.c -= copy.c;
        dailyRemaining.f -= copy.f;
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
      const pool = FOODS().filter(f => {
        if ((foodCounts[f.name] || 0) >= maxRepeats) return false;
        if (_isShake(f) && shakesUsed >= maxShakes) return false;
        if (f.group && usedFoodNames.has(f.group)) return false;
        if (usedFoodNames.has(f.name)) return false;
        return Array.isArray(f.tags) && f.tags.some(t => preferredTags.includes(t));
      });
      if (!pool.length) break;

      const candidateFood = _sample(pool);
      let acceptedPortion = null;

      // Try different qtys
      const preferredQtys = [1.0, 0.5, 1.5, 0.25, 2.0, 0.75];
      const step = candidateFood.portion_scalable ? Number(candidateFood.portion_scalable) : 0.25;
      const minQ = 0.25, maxQ = 2.0;

      for (const qtyRaw of preferredQtys) {
        let qty = Math.max(minQ, Math.min(maxQ, Math.round(qtyRaw / step) * step));
        const tryPortion = _pickPortion(candidateFood, qty);
        if (tryPortion) {
          tryPortion.qty = qty;
          tryPortion.base_kcal = tryPortion.kcal;
          tryPortion.base_p = tryPortion.p;
          tryPortion.base_c = tryPortion.c;
          tryPortion.base_f = tryPortion.f;
          tryPortion.kcal *= qty;
          tryPortion.p *= qty;
          tryPortion.c *= qty;
          tryPortion.f *= qty;
          if (portionFits(tryPortion)) { acceptedPortion = tryPortion; break; }
        }
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
    }

    return { mealItems, subtotal, foodCounts, shakesUsed };
  }

  // ---------------------------
  function tryBuildDay(opts) {
    const { mealCount, calMin, calMax, pMin, pMax, cMin, cMax, fMin, fMax, maxShakes = 2, maxRepeats = 1, seededLocked = {}, maxAttempts = 1200 } = opts;
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
        const perMealMax = { cal: dailyRemaining.cal / remainingMeals, p: pMax / mealCount, c: dailyRemaining.c / remainingMeals, f: dailyRemaining.f / remainingMeals };
        const prePlaced = seededLocked.mealsByIndex?.[mi] || [];
        const preferredTags = foodsForMealIndex(mi, mealCount);
        const { mealItems, subtotal, error } = buildMeal(perMealMax, dailyRemaining, foodCounts, shakesUsed, maxShakes, maxRepeats, preferredTags, 3, prePlaced);
        if (error || !mealItems.length) { failed = true; break; }
        meals.push({ items: mealItems, subtotal });
      }

      if (failed) continue;

      const totals = meals.reduce((acc, m) => {
        acc.cal += m.subtotal.cal; acc.p += m.subtotal.p; acc.c += m.subtotal.c; acc.f += m.subtotal.f;
        return acc;
      }, { cal: 0, p: 0, c: 0, f: 0 });

      if (totals.cal <= calMax && totals.c <= cMax && totals.f <= fMax) {
        if (totals.cal >= calMin && totals.p >= pMin && totals.c >= cMin && totals.f >= fMin) return { meals, totals, mealCount };
        if (totals.p > bestWithinCapsProtein) { bestWithinCapsProtein = totals.p; bestWithinCaps = { meals, totals, mealCount }; }
      }
    }
    return bestWithinCaps;
  }

  // ---------------------------
  function recalcMeal(meal) {
    meal.subtotal = meal.items.reduce((acc, it) => {
      acc.cal += it.kcal; acc.p += it.p; acc.c += it.c; acc.f += it.f;
      return acc;
    }, { cal: 0, p: 0, c: 0, f: 0 });
  }

  function recalcTotals(plan) {
    plan.totals = plan.meals.reduce((acc, m) => {
      acc.cal += m.subtotal.cal; acc.p += m.subtotal.p; acc.c += m.subtotal.c; acc.f += m.subtotal.f;
      return acc;
    }, { cal: 0, p: 0, c: 0, f: 0 });
  }

  // ---------------------------
  function rebuildMeal(plan, mealIndex, opts) {
    const meal = plan.meals[mealIndex];
    if (!meal) return;

    const lockedItems = meal.items.filter(it => window.LOCKS.foods[it._uid]);
    const dailyRemaining = {
      cal: opts.calMax - plan.totals.cal + meal.subtotal.cal,
      c: opts.cMax - plan.totals.c + meal.subtotal.c,
      f: opts.fMax - plan.totals.f + meal.subtotal.f
    };
    const foodCounts = {};
    plan.meals.forEach((m, i) => {
      if (i === mealIndex) return;
      m.items.forEach(it => { foodCounts[it.name] = (foodCounts[it.name] || 0) + 1; });
    });
    let shakesUsed = 0;
    plan.meals.forEach((m, i) => {
      if (i === mealIndex) return;
      m.items.forEach(it => { if (_isShake(it)) shakesUsed++; });
    });
    const perMealMax = {
      cal: dailyRemaining.cal,
      p: opts.pMax / opts.mealCount,
      c: dailyRemaining.c,
      f: dailyRemaining.f
    };
    const preferredTags = foodsForMealIndex(mealIndex, opts.mealCount);
    const { mealItems, subtotal } = buildMeal(
      perMealMax, dailyRemaining, foodCounts, shakesUsed, opts.maxShakes, opts.maxRepeats, preferredTags, 3, lockedItems
    );
    plan.meals[mealIndex].items = mealItems;
    plan.meals[mealIndex].subtotal = subtotal;
    recalcTotals(plan);
  }

  // ---------------------------
  function regenMeal(mealId) {
    if (!window._lastPlan || !window._lastOpts) return;

    const plan = JSON.parse(JSON.stringify(window._lastPlan));
    const mealIndex = plan.meals.findIndex(m => m._uid === mealId);
    if (mealIndex === -1) return;

    rebuildMeal(plan, mealIndex, window._lastOpts);
    window._lastPlan = plan;
    window.renderResult(plan);
  }

  // ---------------------------
  function regenFood(mealId, itemId) {
    if (!window._lastPlan || !window._lastOpts) return;

    const plan = JSON.parse(JSON.stringify(window._lastPlan));
    const mealIndex = plan.meals.findIndex(m => m._uid === mealId);
    if (mealIndex === -1) return;

    const meal = plan.meals[mealIndex];
    const itemIndex = meal.items.findIndex(it => it._uid === itemId);
    if (itemIndex === -1) return;

    // Skip if the food is locked
    if (window.LOCKS.foods[itemId]) return;

    const oldItem = meal.items[itemIndex];
    const candidatePool = FOODS().filter(f => Array.isArray(f.tags) && f.tags.some(t => (meal.slot ? allowedTagsForSlot(meal.slot).includes(t) : true)));

    // Pick new portion
    let newItem = null;
    const preferredQtys = [1.0, 0.5, 1.5, 0.25, 2.0, 0.75];
    const step = oldItem.portion_scalable ? Number(oldItem.portion_scalable) : 0.25;
    const minQ = 0.25, maxQ = 2.0;

    for (let attempt = 0; attempt < 100; attempt++) {
      const f = _sample(candidatePool);
      for (const qtyRaw of preferredQtys) {
        let qty = Math.max(minQ, Math.min(maxQ, Math.round(qtyRaw / step) * step));
        const portion = _pickPortion(f, qty);
        if (portion) {
          portion._uid = oldItem._uid;
          portion.qty = qty;
          portion.base_kcal = portion.kcal;
          portion.base_p = portion.p;
          portion.base_c = portion.c;
          portion.base_f = portion.f;
          portion.kcal *= qty;
          portion.p *= qty;
          portion.c *= qty;
          portion.f *= qty;
          newItem = portion;
          break;
        }
      }
      if (newItem) break;
    }

    if (!newItem) return;

    meal.items[itemIndex] = newItem;
    recalcMeal(meal);
    recalcTotals(plan);
    window.syncLocks(plan);

    window._lastPlan = plan;
    window.renderResult(plan);
  }

  // expose
  window.buildMealOrder = buildMealOrder;
  window.foodsForMealIndex = foodsForMealIndex;
  window.allowedTagsForSlot = allowedTagsForSlot;
  window.buildMeal = buildMeal;
  window.tryBuildDay = tryBuildDay;
  window.rebuildMeal = rebuildMeal;
  window.regenMeal = regenMeal;
  window.regenFood = regenFood;
})();
