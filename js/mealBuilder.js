// js/mealBuilder.js
// Meal and day-building logic that relies on globals provided by foods.js
// Uses: window.FOODS, window.pickPortion, window.sample, window.rand, window.uid, window.isShake
// Exposes globals: window.buildMealOrder, window.foodsForMealIndex, window.allowedTagsForSlot,
//                  window.buildMeal, window.tryBuildDay, window.rebuildMeal, window.regenMeal, window.regenFood
// ------------------------------

(function () {
  // Local wrappers
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
      // avoid adjacent snacks
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
  function buildMeal(perMealMax, dailyRemaining, foodCounts, shakesUsed, maxShakes, maxRepeats, preferredTags, maxItems = 3, prePlacedItems = []) {
    const mealItems = [];
    const subtotal = { cal: 0, p: 0, c: 0, f: 0 };
    const attemptsLimit = 400;
    const softMult = 1.25; // tightened from 1.30
    let attempts = 0;

    const usedFoodNames = new Set();
    let shakesInThisMeal = 0;

    // insert prePlaced items first
    if (Array.isArray(prePlacedItems) && prePlacedItems.length) {
      for (const it of prePlacedItems) {
        if ((it.kcal || 0) > (dailyRemaining.cal || 0) || (it.c || 0) > (dailyRemaining.c || 0) || (it.f || 0) > (dailyRemaining.f || 0)) {
          return { mealItems: [], subtotal, foodCounts, shakesUsed, error: 'prePlaced overflow' };
        }
        const copy = { ...it };
        copy.qty = copy.qty ?? 1;
        copy.base_kcal = copy.base_kcal ?? (Number(copy.kcal || 0) / (copy.qty || 1));
        copy.base_p = copy.base_p ?? (Number(copy.p || 0) / (copy.qty || 1));
        copy.base_c = copy.base_c ?? (Number(copy.c || 0) / (copy.qty || 1));
        copy.base_f = copy.base_f ?? (Number(copy.f || 0) / (copy.qty || 1));
        copy.kcal = (copy.base_kcal || 0) * (copy.qty || 1);
        copy.p = (copy.base_p || 0) * (copy.qty || 1);
        copy.c = (copy.base_c || 0) * (copy.qty || 1);
        copy.f = (copy.base_f || 0) * (copy.qty || 1);

        mealItems.push(copy);
        subtotal.cal += copy.kcal; subtotal.p += copy.p; subtotal.c += copy.c; subtotal.f += copy.f;
        foodCounts[copy.name] = (foodCounts[copy.name] || 0) + 1;
        if (_isShake(copy)) { shakesUsed++; shakesInThisMeal++; }
        if (copy.group) usedFoodNames.add(copy.group);
        usedFoodNames.add(copy.name);
        dailyRemaining.cal -= copy.kcal;
        dailyRemaining.c -= copy.c;
        dailyRemaining.f -= copy.f;
      }
    }

    function portionFits(portion) {
      if (!portion) return false;
      if ((portion.kcal || 0) > (dailyRemaining.cal || 0)) return false;
      if ((portion.c || 0) > (dailyRemaining.c || 0)) return false;
      if ((portion.f || 0) > (dailyRemaining.f || 0)) return false;
      if ((portion.kcal || 0) > (perMealMax.cal || 0) * softMult) return false;
      if ((portion.c || 0) > (perMealMax.c || 0) * softMult) return false;
      if ((portion.f || 0) > (perMealMax.f || 0) * softMult) return false;
      return true;
    }

    // attempt fill
    while (attempts < attemptsLimit && mealItems.length < maxItems) {
      attempts++;
      const poolPreferred = FOODS().filter(f => {
        if ((foodCounts[f.name] || 0) >= (maxRepeats || 1)) return false;
        if (_isShake(f) && (shakesUsed >= (maxShakes || 2) || shakesInThisMeal >= 1)) return false;
        if (f.group && usedFoodNames.has(f.group)) return false;
        if (usedFoodNames.has(f.name)) return false;
        if ((f.kcal || 0) > (dailyRemaining.cal || 0)) return false;
        if ((f.c || 0) > (dailyRemaining.c || 0)) return false;
        if ((f.f || 0) > (dailyRemaining.f || 0)) return false;
        return Array.isArray(f.tags) && f.tags.some(t => (preferredTags || []).includes(t));
      });

      const poolFallback = FOODS().filter(f => {
        if ((foodCounts[f.name] || 0) >= (maxRepeats || 1)) return false;
        if (_isShake(f) && (shakesUsed >= (maxShakes || 2) || shakesInThisMeal >= 1)) return false;
        if (f.group && usedFoodNames.has(f.group)) return false;
        if (usedFoodNames.has(f.name)) return false;
        if ((f.kcal || 0) > (dailyRemaining.cal || 0)) return false;
        if ((f.c || 0) > (dailyRemaining.c || 0)) return false;
        if ((f.f || 0) > (dailyRemaining.f || 0)) return false;
        return true;
      });

      const pool = poolPreferred.length ? poolPreferred : poolFallback;
      if (!pool.length) break;

      const candidateFood = _sample(pool);
      let acceptedPortion = null;

      const portionTries = 6;
      for (let t = 0; t < portionTries; t++) {
        let tryPortion = null;
        if (candidateFood.portion_scalable !== undefined && candidateFood.portion_scalable !== null) {
          const preferred = [1, 0.75, 1.25, 0.5, 1.5, 2.0];
          const step = Number(candidateFood.portion_scalable) || 0.25;
          let qty = preferred[t] !== undefined ? preferred[t] : 1;
          const minQ = 0.25, maxQ = 2.0;
          if (qty < minQ) qty = minQ;
          if (qty > maxQ) qty = maxQ;
          qty = Math.round(qty / step) * step;
          tryPortion = _pickPortion(candidateFood, qty);
        } else if (candidateFood.portionable) {
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

      acceptedPortion.qty = acceptedPortion.qty ?? 1;
      acceptedPortion.base_kcal = acceptedPortion.base_kcal ?? (Number(acceptedPortion.kcal || 0) / (acceptedPortion.qty || 1));
      acceptedPortion.base_p = acceptedPortion.base_p ?? (Number(acceptedPortion.p || 0) / (acceptedPortion.qty || 1));
      acceptedPortion.base_c = acceptedPortion.base_c ?? (Number(acceptedPortion.c || 0) / (acceptedPortion.qty || 1));
      acceptedPortion.base_f = acceptedPortion.base_f ?? (Number(acceptedPortion.f || 0) / (acceptedPortion.qty || 1));
      acceptedPortion.kcal = (acceptedPortion.base_kcal || 0) * (acceptedPortion.qty || 1);
      acceptedPortion.p = (acceptedPortion.base_p || 0) * (acceptedPortion.qty || 1);
      acceptedPortion.c = (acceptedPortion.base_c || 0) * (acceptedPortion.qty || 1);
      acceptedPortion.f = (acceptedPortion.base_f || 0) * (acceptedPortion.qty || 1);

      mealItems.push(acceptedPortion);
      subtotal.cal += acceptedPortion.kcal; subtotal.p += acceptedPortion.p; subtotal.c += acceptedPortion.c; subtotal.f += acceptedPortion.f;
      foodCounts[acceptedPortion.name] = (foodCounts[acceptedPortion.name] || 0) + 1;
      if (_isShake(acceptedPortion)) { shakesUsed++; shakesInThisMeal++; }
      if (acceptedPortion.group) usedFoodNames.add(acceptedPortion.group);
      usedFoodNames.add(acceptedPortion.name);
      dailyRemaining.cal -= acceptedPortion.kcal;
      dailyRemaining.c -= acceptedPortion.c;
      dailyRemaining.f -= acceptedPortion.f;
      if ((subtotal.cal >= perMealMax.cal) && (subtotal.c >= perMealMax.c) && (subtotal.f >= perMealMax.f)) break;
    }

    return { mealItems, subtotal, foodCounts, shakesUsed };
  }

  // ---------------------------
  // tryBuildDay (balanced per-meal allocation)
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

    const baselinePerMeal = (calMax || 0) / (mealCount || 1);
    const minMult = 0.75; // tightened from 0.67
    const maxMult = 1.25; // tightened from 1.33

    let bestWithinCaps = null;
    let bestWithinCapsProtein = -Infinity;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const foodCounts = {};
      let shakesUsed = 0;
      const dailyRemaining = { cal: calMax, c: cMax, f: fMax };

      const multipliers = [];
      for (let i = 0; i < mealCount; i++) multipliers.push(minMult + Math.random() * (maxMult - minMult));
      const sumMult = multipliers.reduce((s, x) => s + x, 0);
      const perMealCalories = multipliers.map(m => (m / sumMult) * (calMax || 0));

      const meals = [];
      let failed = false;

      for (let mi = 0; mi < mealCount; mi++) {
        const perMealMax = {
          cal: Math.max(1, perMealCalories[mi]),
          p: (pMax && pMax > 0) ? (pMax / mealCount) : 0,
          c: Math.max(0.1, (cMax || 0) / mealCount),
          f: Math.max(0.1, (fMax || 0) / mealCount),
        };
        const prePlaced = (seededLocked.mealsByIndex && Array.isArray(seededLocked.mealsByIndex[mi])) ? seededLocked.mealsByIndex[mi] : [];
        const preferredTags = foodsForMealIndex(mi, mealCount) || [];
        const { mealItems, subtotal, foodCounts: newCounts, shakesUsed: newShakes, error } =
          buildMeal(perMealMax, dailyRemaining, foodCounts, shakesUsed, maxShakes, maxRepeats, preferredTags, 3, prePlaced);
        if (error || !mealItems || mealItems.length === 0) { failed = true; break; }
        for (const k in newCounts) foodCounts[k] = newCounts[k];
        shakesUsed = newShakes;
        meals.push({ items: mealItems, subtotal, slot: preferredTags[0] || null });
      }
      if (failed) continue;

      const totals = meals.reduce((acc, m) => {
        const mcal = (m.items || []).reduce((s, f) => s + (f.kcal || 0), 0);
        const mp = (m.items || []).reduce((s, f) => s + (f.p || 0), 0);
        const mc = (m.items || []).reduce((s, f) => s + (f.c || 0), 0);
        const mf = (m.items || []).reduce((s, f) => s + (f.f || 0), 0);
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

  // expose
  window.buildMealOrder = buildMealOrder;
  window.foodsForMealIndex = foodsForMealIndex;
  window.allowedTagsForSlot = allowedTagsForSlot;
  window.buildMeal = buildMeal;
  window.tryBuildDay = tryBuildDay;
})();
