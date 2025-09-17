// js/mealBuilder.js
// Meal and day-building logic that relies on globals provided by foods.js
// Uses: window.FOODS, window.pickPortion, window.sample, window.rand, window.uid, window.isShake
// Exposes globals: window.buildMealOrder, window.foodsForMealIndex, window.allowedTagsForSlot,
//                  window.buildMeal, window.tryBuildDay, window.rebuildMeal, window.regenMeal, window.regenFood
// ------------------------------

(function () {
  // Local wrappers for globals (keeps code compact & testable)
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
  //
  // perMealMax: { cal, p, c, f } approximate targets (for this meal)
  // dailyRemaining: object mutated in-place { cal, c, f } remaining for day before building this meal
  // foodCounts: object mapping name -> count (cumulative across day)
  // shakesUsed: number used so far in day
  // maxShakes: allowed shakes per day
  // maxRepeats: allowed repeats per day (same food name)
  // preferredTags: array of tags to prefer (slot)
  // maxItems: number of items to attempt to include in meal
  // prePlacedItems: locked items to include first (they should already have macros)
  function buildMeal(perMealMax, dailyRemaining, foodCounts, shakesUsed, maxShakes, maxRepeats, preferredTags, maxItems = 3, prePlacedItems = []) {
    const mealItems = [];
    const subtotal = { cal: 0, p: 0, c: 0, f: 0 };
    const attemptsLimit = 400;
    const softMult = 1.25; // portion guards
    let attempts = 0;

    const usedFoodNames = new Set();
    let shakesInThisMeal = 0;

    // insert prePlaced locked items first
    if (Array.isArray(prePlacedItems) && prePlacedItems.length) {
      for (const it of prePlacedItems) {
        // If prePlaced item doesn't fit remaining daily macros, bail
        if ((it.kcal || 0) > (dailyRemaining.cal || 0) || (it.c || 0) > (dailyRemaining.c || 0) || (it.f || 0) > (dailyRemaining.f || 0)) {
          return { mealItems: [], subtotal, foodCounts, shakesUsed, error: 'prePlaced overflow' };
        }
        const copy = { ...it };
        // ensure qty, bases, macros are present
        copy.qty = copy.qty ?? 1;
        copy.base_kcal = copy.base_kcal !== undefined ? copy.base_kcal : (Number(copy.kcal || 0) / (copy.qty || 1));
        copy.base_p = copy.base_p !== undefined ? copy.base_p : (Number(copy.p || 0) / (copy.qty || 1));
        copy.base_c = copy.base_c !== undefined ? copy.base_c : (Number(copy.c || 0) / (copy.qty || 1));
        copy.base_f = copy.base_f !== undefined ? copy.base_f : (Number(copy.f || 0) / (copy.qty || 1));
        copy.kcal = (copy.base_kcal || 0) * (copy.qty || 1);
        copy.p = (copy.base_p || 0) * (copy.qty || 1);
        copy.c = (copy.base_c || 0) * (copy.qty || 1);
        copy.f = (copy.base_f || 0) * (copy.qty || 1);

        mealItems.push(copy);
        subtotal.cal += copy.kcal; subtotal.p += copy.p; subtotal.c += copy.c; subtotal.f += copy.f;
        foodCounts[copy.name] = (foodCounts[copy.name] || 0) + 1;
        if (_isShake(copy)) {
          shakesUsed++;
          shakesInThisMeal++;
        }
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

    // attempt to fill meal up to maxItems
    while (attempts < attemptsLimit && mealItems.length < maxItems) {
      attempts++;

      // Candidate pools: preferred by tags first, fallback to any
      const poolPreferred = FOODS().filter(f => {
        if ((foodCounts[f.name] || 0) >= (maxRepeats || 1)) return false; // global repeat cap
        if (_isShake(f) && (shakesUsed >= (maxShakes || 2) || shakesInThisMeal >= 1)) return false; // limit shakes per day and per meal (max 1 per meal)
        if (f.group && usedFoodNames.has(f.group)) return false; // avoid same group inside meal
        if (usedFoodNames.has(f.name)) return false; // avoid same name inside meal
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

      // Try several quantity strategies — prefer 1x, but respect portion_scalable & portionable ranges
      const portionTries = 6;
      for (let t = 0; t < portionTries; t++) {
        let tryPortion = null;

        if (candidateFood.portion_scalable !== undefined && candidateFood.portion_scalable !== null) {
          // attempt sequence: 1, 0.75, 1.25, 0.5, 1.5, 2.0 (snapped to step)
          const preferred = [1, 0.75, 1.25, 0.5, 1.5, 2.0];
          const step = Number(candidateFood.portion_scalable) || 0.25;
          let qty = preferred[t] !== undefined ? preferred[t] : 1;
          const minQ = 0.25, maxQ = 2.0;
          if (qty < minQ) qty = minQ;
          if (qty > maxQ) qty = maxQ;
          qty = Math.round(qty / step) * step;
          tryPortion = _pickPortion(candidateFood, qty);
        } else if (candidateFood.portionable && (candidateFood.min !== undefined || candidateFood.max !== undefined)) {
          // integer portionable fallback
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
          // default single portion
          const p = _pickPortion(candidateFood);
          tryPortion = portionFits(p) ? p : null;
        }

        if (tryPortion) { acceptedPortion = tryPortion; break; }
      }

      if (!acceptedPortion) continue;

      // normalize acceptedPortion fields
      acceptedPortion.qty = acceptedPortion.qty ?? 1;
      acceptedPortion.base_kcal = acceptedPortion.base_kcal !== undefined ? acceptedPortion.base_kcal : (Number(acceptedPortion.kcal || 0) / (acceptedPortion.qty || 1));
      acceptedPortion.base_p = acceptedPortion.base_p !== undefined ? acceptedPortion.base_p : (Number(acceptedPortion.p || 0) / (acceptedPortion.qty || 1));
      acceptedPortion.base_c = acceptedPortion.base_c !== undefined ? acceptedPortion.base_c : (Number(acceptedPortion.c || 0) / (acceptedPortion.qty || 1));
      acceptedPortion.base_f = acceptedPortion.base_f !== undefined ? acceptedPortion.base_f : (Number(acceptedPortion.f || 0) / (acceptedPortion.qty || 1));

      acceptedPortion.kcal = (acceptedPortion.base_kcal || 0) * (acceptedPortion.qty || 1);
      acceptedPortion.p = (acceptedPortion.base_p || 0) * (acceptedPortion.qty || 1);
      acceptedPortion.c = (acceptedPortion.base_c || 0) * (acceptedPortion.qty || 1);
      acceptedPortion.f = (acceptedPortion.base_f || 0) * (acceptedPortion.qty || 1);

      // push, update counters & remaining
      mealItems.push(acceptedPortion);
      subtotal.cal += acceptedPortion.kcal; subtotal.p += acceptedPortion.p; subtotal.c += acceptedPortion.c; subtotal.f += acceptedPortion.f;
      foodCounts[acceptedPortion.name] = (foodCounts[acceptedPortion.name] || 0) + 1;
      if (_isShake(acceptedPortion)) { shakesUsed++; shakesInThisMeal++; }
      if (acceptedPortion.group) usedFoodNames.add(acceptedPortion.group);
      usedFoodNames.add(acceptedPortion.name);

      dailyRemaining.cal -= acceptedPortion.kcal;
      dailyRemaining.c -= acceptedPortion.c;
      dailyRemaining.f -= acceptedPortion.f;

      // Stop early if we've hit targets comfortably
      if ((subtotal.cal >= perMealMax.cal) && (subtotal.c >= perMealMax.c) && (subtotal.f >= perMealMax.f)) break;
    }

    // fallback: if still empty, try to at least include the smallest viable food
    if (mealItems.length === 0) {
      const viable = FOODS().slice().sort((a,b) => (a.kcal || 0) - (b.kcal || 0));
      if (viable.length) {
        const smallest = viable[0];
        const portion = _pickPortion(smallest);
        if (portion && portionFits(portion)) {
          portion.qty = portion.qty ?? 1;
          portion.base_kcal = portion.base_kcal !== undefined ? portion.base_kcal : (Number(portion.kcal || 0) / (portion.qty || 1));
          portion.base_p = portion.base_p !== undefined ? portion.base_p : (Number(portion.p || 0) / (portion.qty || 1));
          portion.base_c = portion.base_c !== undefined ? portion.base_c : (Number(portion.c || 0) / (portion.qty || 1));
          portion.base_f = portion.base_f !== undefined ? portion.base_f : (Number(portion.f || 0) / (portion.qty || 1));
          portion.kcal = (portion.base_kcal || 0) * (portion.qty || 1);
          portion.p = (portion.base_p || 0) * (portion.qty || 1);
          portion.c = (portion.base_c || 0) * (portion.qty || 1);
          portion.f = (portion.base_f || 0) * (portion.qty || 1);

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

    // baseline per-meal share and allowed flexibility (±33%)
    const baselinePerMeal = (calMax || 0) / (mealCount || 1);
    const minMult = 0.67;
    const maxMult = 1.33;

    let bestWithinCaps = null;
    let bestWithinCapsProtein = -Infinity;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      // plan-wide trackers
      const foodCounts = {};
      let shakesUsed = 0;
      const dailyRemaining = { cal: calMax, c: cMax, f: fMax };

      // create per-meal calorie targets that are balanced but slightly perturbed
      // we pick a random multiplier in [minMult, maxMult] for each meal, then normalize to calMax
      const multipliers = [];
      for (let i = 0; i < mealCount; i++) multipliers.push(minMult + Math.random() * (maxMult - minMult));
      const sumMult = multipliers.reduce((s, x) => s + x, 0);
      const perMealCalories = multipliers.map(m => (m / sumMult) * (calMax || 0));

      const meals = [];
      let failed = false;

      for (let mi = 0; mi < mealCount; mi++) {
        // compute perMealMax using perMealCalories target (but keep protein per meal as roughly pMax/mealCount)
        const perMealMax = {
          cal: Math.max(1, perMealCalories[mi]),
          p: (pMax && pMax > 0) ? (pMax / mealCount) : 0,
          c: Math.max(0.1, (cMax || 0) / mealCount),
          f: Math.max(0.1, (fMax || 0) / mealCount),
        };

        // prePlaced items (locked) for this index
        const prePlaced = (seededLocked && seededLocked.mealsByIndex && Array.isArray(seededLocked.mealsByIndex[mi]))
          ? seededLocked.mealsByIndex[mi]
          : [];

        // preferred tags for this slot
        const preferredTags = foodsForMealIndex(mi, mealCount) || [];

        // Build meal
        const { mealItems, subtotal, foodCounts: newCounts, shakesUsed: newShakes, error } =
          buildMeal(perMealMax, dailyRemaining, foodCounts, shakesUsed, maxShakes, maxRepeats, preferredTags, 3, prePlaced);

        if (error || !mealItems || mealItems.length === 0) {
          failed = true;
          break;
        }

        // merge counts
        for (const k in newCounts) foodCounts[k] = newCounts[k];
        shakesUsed = newShakes;
        meals.push({ items: mealItems, subtotal, slot: preferredTags[0] || null });
      }

      if (failed) continue;

      // compute totals
      const totals = meals.reduce((acc, m) => {
        const mcal = (m.items || []).reduce((s, f) => s + (f.kcal || 0), 0);
        const mp = (m.items || []).reduce((s, f) => s + (f.p || 0), 0);
        const mc = (m.items || []).reduce((s, f) => s + (f.c || 0), 0);
        const mf = (m.items || []).reduce((s, f) => s + (f.f || 0), 0);
        return { cal: acc.cal + mcal, p: acc.p + mp, c: acc.c + mc, f: acc.f + mf };
      }, { cal: 0, p: 0, c: 0, f: 0 });

      // accept plan if within caps and meets minimums, otherwise keep best by protein
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

  // ---------------------------
  // rebuildMeal: regenerate a single meal inside a given plan, keeping locked foods
  // plan: the whole plan object (will be cloned inside)
  // mealIndex: index of meal to rebuild
  // opts: options object similar to tryBuildDay opts (must include calMax, cMax, fMax, pMax, mealCount, etc.)
  // locks: object with mealsByIndex: { idx: [prePlacedItems...] } OR full locks.foods mapping
  function rebuildMeal(plan, mealIndex, opts = {}, locks = {}) {
    if (!plan || !Array.isArray(plan.meals) || mealIndex < 0 || mealIndex >= plan.meals.length) return null;

    // shallow clone plan to avoid mutating original
    const newPlan = JSON.parse(JSON.stringify(plan));

    // compute totals excluding target meal
    const totalsExcluding = newPlan.meals.reduce((acc, meal, i) => {
      if (i === mealIndex) return acc;
      acc.cal += (meal.items || []).reduce((s, f) => s + (f.kcal || 0), 0);
      acc.p   += (meal.items || []).reduce((s, f) => s + (f.p || 0), 0);
      acc.c   += (meal.items || []).reduce((s, f) => s + (f.c || 0), 0);
      acc.f   += (meal.items || []).reduce((s, f) => s + (f.f || 0), 0);
      return acc;
    }, { cal: 0, p: 0, c: 0, f: 0 });

    // opts should contain daily caps; fallback to window._lastOpts
    const effectiveOpts = { ...(opts || {}), ...(window._lastOpts || {}) };

    const dailyRemaining = {
      cal: (effectiveOpts.calMax ?? 99999) - totalsExcluding.cal,
      c:   (effectiveOpts.cMax ?? 99999) - totalsExcluding.c,
      f:   (effectiveOpts.fMax ?? 99999) - totalsExcluding.f,
    };

    // perMealMax: give this meal a reasonable share (conservative)
    const perMealMax = {
      cal: Math.max(1, Math.min(dailyRemaining.cal, effectiveOpts.perMealCalMax ?? (dailyRemaining.cal))),
      p:   (effectiveOpts.pMax && effectiveOpts.pMax > 0) ? (effectiveOpts.pMax / (effectiveOpts.mealCount || newPlan.meals.length)) : 0,
      c:   Math.max(0.1, Math.min(dailyRemaining.c, effectiveOpts.perMealCarbMax ?? (dailyRemaining.c))),
      f:   Math.max(0.1, Math.min(dailyRemaining.f, effectiveOpts.perMealFatMax ?? (dailyRemaining.f))),
    };

    // Build prePlaced from locks param: either locks.mealsByIndex[mealIndex] or locks.foods mapping find items in current meal
    const prePlaced = [];
    if (locks && Array.isArray(locks.mealsByIndex) && Array.isArray(locks.mealsByIndex[mealIndex])) {
      for (const it of locks.mealsByIndex[mealIndex]) prePlaced.push(it);
    } else if (locks && locks.mealsByIndex && Array.isArray(locks.mealsByIndex[mealIndex])) {
      for (const it of locks.mealsByIndex[mealIndex]) prePlaced.push(it);
    } else if (locks && locks.foods) {
      const origMeal = plan.meals[mealIndex] || { items: [] };
      (origMeal.items || []).forEach(it => {
        if (locks.foods[it._uid]) prePlaced.push(it);
      });
    } else {
      // fallback: also check global LOCKS (if available) to keep locked foods
      const origMeal = plan.meals[mealIndex] || { items: [] };
      (origMeal.items || []).forEach(it => {
        if (window.LOCKS && window.LOCKS.foods && window.LOCKS.foods[it._uid]) prePlaced.push(it);
      });
    }

    // foodCounts should reflect counts across the day excluding this meal to enforce maxRepeats
    const foodCounts = {};
    newPlan.meals.forEach((m, idx) => {
      if (idx === mealIndex) return;
      (m.items || []).forEach(it => {
        foodCounts[it.name] = (foodCounts[it.name] || 0) + 1;
      });
    });

    // count shakes used elsewhere
    let shakesUsed = 0;
    newPlan.meals.forEach((m, idx) => {
      if (idx === mealIndex) return;
      (m.items || []).forEach(it => { if (_isShake(it)) shakesUsed++; });
    });

    const preferredTags = foodsForMealIndex(mealIndex, effectiveOpts.mealCount || newPlan.meals.length) || [];

    const maxShakes = effectiveOpts.maxShakes ?? 2;
    const maxRepeats = effectiveOpts.maxRepeats ?? 1;

    // call buildMeal to create a meal that fits remaining daily macros while keeping prePlaced locks
    const { mealItems, subtotal, error } = buildMeal(perMealMax, dailyRemaining, foodCounts, shakesUsed, maxShakes, maxRepeats, preferredTags, 3, prePlaced);

    if (error || !mealItems || mealItems.length === 0) {
      // if we failed to rebuild, return null to indicate no valid replacement
      return null;
    }

    // ensure uids and macros on returned items
    const normalizedItems = mealItems.map(it => {
      const copy = { ...it };
      if (!copy._uid) copy._uid = uid('i');
      copy.qty = copy.qty ?? 1;
      copy.base_kcal = copy.base_kcal !== undefined ? copy.base_kcal : (Number(copy.kcal || 0) / (copy.qty || 1));
      copy.base_p = copy.base_p !== undefined ? copy.base_p : (Number(copy.p || 0) / (copy.qty || 1));
      copy.base_c = copy.base_c !== undefined ? copy.base_c : (Number(copy.c || 0) / (copy.qty || 1));
      copy.base_f = copy.base_f !== undefined ? copy.base_f : (Number(copy.f || 0) / (copy.qty || 1));
      copy.kcal = (copy.base_kcal || 0) * (copy.qty || 1);
      copy.p = (copy.base_p || 0) * (copy.qty || 1);
      copy.c = (copy.base_c || 0) * (copy.qty || 1);
      copy.f = (copy.base_f || 0) * (copy.qty || 1);
      return copy;
    });

    // replace meal in newPlan
    newPlan.meals[mealIndex] = { items: normalizedItems, subtotal };

    // recalc totals for the day
    newPlan.totals = newPlan.meals.reduce((acc, meal) => {
      acc.cal += (meal.items || []).reduce((s, f) => s + (f.kcal || 0), 0);
      acc.p   += (meal.items || []).reduce((s, f) => s + (f.p || 0), 0);
      acc.c   += (meal.items || []).reduce((s, f) => s + (f.c || 0), 0);
      acc.f   += (meal.items || []).reduce((s, f) => s + (f.f || 0), 0);
      return acc;
    }, { cal: 0, p: 0, c: 0, f: 0 });

    return newPlan;
  }

  // ---------------------------
  // regenMeal (wrappers for UI)
  function regenMeal(mealId) {
    if (!window._lastPlan || !window._lastOpts) return;
    const plan = JSON.parse(JSON.stringify(window._lastPlan));
    const mealIndex = plan.meals.findIndex(m => m._uid === mealId);
    if (mealIndex === -1) return;

    // Build list of locked items (from global LOCKS) for this meal
    const prePlacedItems = (plan.meals[mealIndex].items || []).filter(it => window.LOCKS && window.LOCKS.foods && window.LOCKS.foods[it._uid]);

    const newPlan = rebuildMeal(plan, mealIndex, window._lastOpts, { mealsByIndex: { [mealIndex]: prePlacedItems } });
    if (newPlan) {
      // preserve UIDs for locked items and meal
      newPlan.meals[mealIndex]._uid = plan.meals[mealIndex]._uid;
      newPlan.meals[mealIndex].items.forEach((it, idx) => {
        if (!it._uid) it._uid = uid('i');
      });
      // update global
      window._lastPlan = newPlan;
      if (window.renderResult) window.renderResult(newPlan);
    }
  }

  // ---------------------------
  // regenFood — only replaces a single food in-place (keeps UID and only affects that item)
  function regenFood(mealId, itemId) {
    if (!window._lastPlan || !window._lastOpts) return;

    const plan = JSON.parse(JSON.stringify(window._lastPlan));
    const mealIndex = plan.meals.findIndex(m => m._uid === mealId);
    if (mealIndex === -1) return;

    const meal = plan.meals[mealIndex];
    const itemIndex = (meal.items || []).findIndex(it => it._uid === itemId);
    if (itemIndex === -1) return;

    // Skip if the food is locked
    if (window.LOCKS && window.LOCKS.foods && window.LOCKS.foods[itemId]) return;

    const oldItem = meal.items[itemIndex];

    // Build candidate pool restricted to slot tags (avoid adding two shakes to same meal)
    const slotAllowed = allowedTagsForSlot(meal.slot || '');
    const candidatePool = FOODS().filter(f => {
      // respect slot tags
      if (!Array.isArray(f.tags)) return false;
      if (!f.tags.some(t => slotAllowed.includes(t))) return false;
      // avoid if global repeats exceeded
      // compute current day counts (from plan) excluding this old item occurrence
      let dayCount = 0;
      plan.meals.forEach((m, mi) => {
        (m.items || []).forEach(it => {
          if (it.name === f.name) {
            // if same meal and same uid (the one we're replacing), skip counting that occurrence
            if (mi === mealIndex && it._uid === itemId) return;
            dayCount++;
          }
        });
      });
      const maxRepeats = (window._lastOpts && window._lastOpts.maxRepeats) || 1;
      if (dayCount >= maxRepeats) return false;

      // avoid adding another shake if one already exists in this meal
      const shakesInMeal = (meal.items || []).reduce((acc, it) => acc + (_isShake(it) ? 1 : 0), 0);
      if (_isShake(f) && shakesInMeal >= 1) return false;

      return true;
    });

    if (!candidatePool.length) return;

    // Try a number of attempts to find a portion that fits (qty respects portion_scalable)
    let newItem = null;
    const preferredQtys = [1.0, 0.75, 1.25, 0.5, 1.5, 2.0]; // sensible sequence
    const maxAttempts = 120;
    for (let attempt = 0; attempt < maxAttempts && !newItem; attempt++) {
      const f = _sample(candidatePool);
      // determine step for this candidate (default snap 0.25)
      const step = (f.portion_scalable !== undefined && f.portion_scalable !== null) ? Number(f.portion_scalable) : 0.25;
      const minQ = 0.25, maxQ = 2.0;

      for (const qtyRaw of preferredQtys) {
        let qty = Math.max(minQ, Math.min(maxQ, Math.round(qtyRaw / step) * step));
        const portion = _pickPortion(f, qty);
        if (!portion) continue;

        // ensure this portion doesn't blow daily/cap budgets (approx — conservative)
        // estimate day totals excluding old item
        const totalsExcluding = plan.meals.reduce((acc, m, mi) => {
          (m.items || []).forEach(it => {
            // exclude the old item being replaced
            if (mi === mealIndex && it._uid === itemId) return;
            acc.cal += it.kcal || 0;
            acc.p += it.p || 0;
            acc.c += it.c || 0;
            acc.f += it.f || 0;
          });
          return acc;
        }, { cal: 0, p: 0, c: 0, f: 0 });

        const effectiveOpts = window._lastOpts || {};
        const calCap = effectiveOpts.calMax ?? Infinity;
        const cCap = effectiveOpts.cMax ?? Infinity;
        const fCap = effectiveOpts.fMax ?? Infinity;

        // portion macros
        portion.qty = qty;
        portion.base_kcal = portion.base_kcal !== undefined ? portion.base_kcal : (Number(portion.kcal || 0) / (portion.qty || 1));
        portion.base_p = portion.base_p !== undefined ? portion.base_p : (Number(portion.p || 0) / (portion.qty || 1));
        portion.base_c = portion.base_c !== undefined ? portion.base_c : (Number(portion.c || 0) / (portion.qty || 1));
        portion.base_f = portion.base_f !== undefined ? portion.base_f : (Number(portion.f || 0) / (portion.qty || 1));
        portion.kcal = (portion.base_kcal || 0) * portion.qty;
        portion.p = (portion.base_p || 0) * portion.qty;
        portion.c = (portion.base_c || 0) * portion.qty;
        portion.f = (portion.base_f || 0) * portion.qty;

        // check rough feasiblity against caps
        if ((totalsExcluding.cal + portion.kcal) > calCap) continue;
        if ((totalsExcluding.c + portion.c) > cCap) continue;
        if ((totalsExcluding.f + portion.f) > fCap) continue;

        // found acceptable portion
        portion._uid = oldItem._uid; // preserve uid
        newItem = portion;
        break;
      }
    }

    if (!newItem) return;

    // replace the item
    meal.items[itemIndex] = newItem;

    // recalc meal and day totals for the mutated plan
    // recalc meal
    const subtotal = { cal: 0, p: 0, c: 0, f: 0 };
    (meal.items || []).forEach(it => {
      subtotal.cal += it.kcal || 0;
      subtotal.p += it.p || 0;
      subtotal.c += it.c || 0;
      subtotal.f += it.f || 0;
    });
    meal.subtotal = subtotal;

    // recalc day totals
    const totals = plan.meals.reduce((acc, m) => {
      (m.items || []).forEach(it => {
        acc.cal += it.kcal || 0;
        acc.p += it.p || 0;
        acc.c += it.c || 0;
        acc.f += it.f || 0;
      });
      return acc;
    }, { cal: 0, p: 0, c: 0, f: 0 });
    plan.totals = totals;

    // update locks if needed (sync will be called by UI)
    window._lastPlan = plan;
    if (window.syncLocks) window.syncLocks(plan);
    if (window.renderResult) window.renderResult(plan);
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
